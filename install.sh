#!/usr/bin/env bash
# Madness installer.
#
#   VPS (website + API):   curl -fsSL https://raw.githubusercontent.com/Parzival-Samanyolu/madness/main/install.sh | sudo bash -s vps
#   GPU box (the model):   use the short command that `sudo madness pair` prints on the VPS
#
# Safe to run again at any time: every step checks whether it is already done.
set -Eeuo pipefail

MADNESS_REPO="${MADNESS_REPO:-https://github.com/Parzival-Samanyolu/madness.git}"
MADNESS_BRANCH="${MADNESS_BRANCH:-main}"
DIR=/opt/madness
LOG=/var/log/madness-install.log

c_blue=$'\e[1;34m'; c_green=$'\e[1;32m'; c_yellow=$'\e[1;33m'; c_red=$'\e[1;31m'; c_off=$'\e[0m'
step() { echo; echo "${c_blue}==> $*${c_off}"; }
ok()   { echo "${c_green}  ✓ $*${c_off}"; }
warn() { echo "${c_yellow}  ! $*${c_off}"; }
die()  { echo "${c_red}  ✗ $*${c_off}" >&2; exit 1; }
trap 'die "Failed at line $LINENO: $BASH_COMMAND  (full log: $LOG)"' ERR

ask() {  # ask "Question" default -> echoes answer (reads the keyboard even when piped from curl)
  local q="$1" def="${2:-}" ans=""
  if [[ -r /dev/tty ]]; then
    read -r -p "  $q${def:+ [$def]}: " ans </dev/tty || true
  fi
  echo "${ans:-$def}"
}
ask_secret() {
  local q="$1" ans=""
  if [[ -r /dev/tty ]]; then read -r -s -p "  $q: " ans </dev/tty || true; echo >&2; fi
  echo "$ans"
}
rand() { head -c 64 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c "${1:-40}"; }
env_get() { [[ -f $DIR/.env ]] && grep -E "^$1=" "$DIR/.env" | tail -1 | cut -d= -f2- | sed 's/\$\$/$/g' || true; }
env_set() {  # env_set KEY VALUE  (creates or replaces the line)
  touch "$DIR/.env"; chmod 600 "$DIR/.env"
  if grep -qE "^$1=" "$DIR/.env"; then
    local tmp; tmp=$(mktemp); grep -vE "^$1=" "$DIR/.env" >"$tmp"; cat "$tmp" >"$DIR/.env"; rm -f "$tmp"
  fi
  echo "$1=${2//\$/\$\$}" >>"$DIR/.env"   # docker compose reads $ as a variable, so store it as $$
}

need_root() {
  [[ $EUID -eq 0 ]] || die "Please run as root: put 'sudo' in front of the command."
}

load_os() {
  # shellcheck disable=SC1091
  . /etc/os-release
  OS_ID="$ID"; OS_LIKE="${ID_LIKE:-}"; OS_VER="${VERSION_ID:-}"
}

pkg_install() {
  if command -v dnf >/dev/null; then dnf -y -q install "$@"
  elif command -v apt-get >/dev/null; then DEBIAN_FRONTEND=noninteractive apt-get -y -qq install "$@"
  else die "Unsupported Linux: need dnf or apt-get"; fi
}

get_code() {
  step "Getting the Madness code"
  if [[ -d $DIR/.git ]]; then
    git -C "$DIR" pull --ff-only -q && ok "Updated $DIR"
  elif [[ -f $DIR/install.sh && ! -d $DIR/.git ]]; then
    ok "Using existing files in $DIR"
  else
    [[ $MADNESS_REPO == *CHANGE_ME* ]] && die "Set MADNESS_REPO to your GitHub repo URL (edit the top of install.sh)."
    git clone -q -b "$MADNESS_BRANCH" "$MADNESS_REPO" "$DIR" && ok "Cloned into $DIR"
  fi
  ln -sf "$DIR/bin/madness" /usr/local/bin/madness
  chmod +x "$DIR/bin/madness" "$DIR/install.sh"
}

install_docker() {
  step "Installing Docker"
  if command -v docker >/dev/null && docker compose version >/dev/null 2>&1; then
    ok "Docker already installed"
  elif [[ $OS_ID == fedora ]]; then
    dnf -y -q install dnf-plugins-core
    if dnf --version 2>/dev/null | grep -q "dnf5"; then
      dnf config-manager addrepo --overwrite --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo
    else
      dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
    fi
    dnf -y -q install docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
    ok "Docker installed"
  else
    curl -fsSL https://get.docker.com | sh >/dev/null
    ok "Docker installed"
  fi
  systemctl enable --now docker >/dev/null 2>&1
}

compose() { (cd "$DIR" && docker compose -f "docker-compose.$(env_get ROLE).yml" "$@"); }

# ---------------------------------------------------------------- VPS ----
# The VPS stack only listens on 127.0.0.1. HTTPS is done by Caddy on the host:
#  - if the host already runs Caddy (systemd), we add ONE site file to it and touch nothing else
#  - otherwise we start our own "edge" Caddy container on ports 80/443
# The GPU box reaches the VPS with an SSH reverse tunnel on port 22 (no extra ports to open).
TUNNEL_USER=madness-tunnel
LLM_PORT_VPS=18080

setup_tunnel_user() {
  step "Creating the locked-down SSH user for the GPU box"
  id "$TUNNEL_USER" >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/$TUNNEL_USER --shell /usr/sbin/nologin "$TUNNEL_USER"
  install -d -m 700 -o "$TUNNEL_USER" -g "$TUNNEL_USER" /var/lib/$TUNNEL_USER/.ssh
  touch /var/lib/$TUNNEL_USER/.ssh/authorized_keys
  chown "$TUNNEL_USER:$TUNNEL_USER" /var/lib/$TUNNEL_USER/.ssh/authorized_keys; chmod 600 /var/lib/$TUNNEL_USER/.ssh/authorized_keys
  local conf=/etc/ssh/sshd_config.d/zz-madness-tunnel.conf
  if [[ ! -f $conf ]]; then
    cat >"$conf" <<EOF
# Madness: the GPU box may only open one reverse tunnel, nothing else.
Match User $TUNNEL_USER
    AllowTcpForwarding remote
    PermitListen 127.0.0.1:$LLM_PORT_VPS
    PermitTTY no
    X11Forwarding no
    AllowAgentForwarding no
    ClientAliveInterval 15
    ClientAliveCountMax 3
EOF
    if ! sshd -t 2>/dev/null; then rm -f "$conf"; die "SSH config test failed; nothing was changed."; fi
    # make sure the Match block did not leak into anyone else's settings before reloading
    local me; me=$(sshd -T -C user=root,host=x,addr=203.0.113.1 2>/dev/null | grep -i '^clientaliveinterval' | awk '{print $2}')
    if [[ $me != 0 && $me != "" ]] && ! grep -qiE '^\s*ClientAliveInterval' /etc/ssh/sshd_config; then
      rm -f "$conf"; die "SSH config check failed; nothing was changed."
    fi
    systemctl reload ssh 2>/dev/null || systemctl reload sshd
  fi
  ok "User $TUNNEL_USER can only forward port $LLM_PORT_VPS (no shell, no login)"
}

setup_https() {
  step "HTTPS for https://$(env_get DOMAIN)"
  local site="$DIR/deploy/site.caddy"
  sed "s|__DOMAIN__|$(env_get DOMAIN)|g" "$DIR/deploy/site.caddy.tmpl" >"$site"
  if systemctl is-active -q caddy && [[ -f /etc/caddy/Caddyfile ]]; then
    local target
    if grep -qE '^\s*import\s+sites/\*' /etc/caddy/Caddyfile && [[ -d /etc/caddy/sites ]]; then
      target=/etc/caddy/sites/madness.caddy
    else
      target=/etc/caddy/madness.caddy
      grep -q "import /etc/caddy/madness.caddy" /etc/caddy/Caddyfile || {
        cp /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.bak.$(date +%s)"
        printf '\nimport /etc/caddy/madness.caddy\n' >>/etc/caddy/Caddyfile; }
    fi
    local old=""; [[ -f $target ]] && old=$(cat "$target")
    cp "$site" "$target"
    if ! caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
      if [[ -n $old ]]; then echo "$old" >"$target"; else rm -f "$target"; fi
      die "Caddy rejected the new site; your existing Caddy config was left as it was."
    fi
    systemctl reload caddy
    env_set COMPOSE_PROFILES ""
    ok "Added site to your existing Caddy ($target); other sites untouched"
  else
    ss -tln | grep -qE ':(80|443)\s' && die "Ports 80/443 are used by something other than Caddy. Free them or put Madness behind it."
    env_set COMPOSE_PROFILES edge
    compose up -d edge
    ok "Using Madness's own Caddy on ports 80/443"
  fi
}

install_vps() {
  step "Preparing the VPS ($PRETTY_NAME)"
  if command -v apt-get >/dev/null; then apt-get -qq update; fi
  pkg_install git python3 openssl
  ok "Base packages installed"
  get_code
  env_set ROLE vps
  install_docker

  step "Configuring the website"
  local ip; ip=$(curl -4 -fsS --max-time 10 https://api.ipify.org || curl -4 -fsS --max-time 10 https://ifconfig.me)
  [[ -n $ip ]] || die "Could not detect the public IP"
  env_set PUBLIC_IP "$ip"
  [[ -n $(env_get DOMAIN) ]] || env_set DOMAIN "madness.${ip//./-}.sslip.io"
  [[ -n $(env_get SECRET_KEY) ]] || env_set SECRET_KEY "$(rand 64)"
  [[ -n $(env_get POSTGRES_PASSWORD) ]] || env_set POSTGRES_PASSWORD "$(rand 32)"
  [[ -n $(env_get LLM_API_KEY) ]] || env_set LLM_API_KEY "$(rand 48)"
  if [[ -z $(env_get ADMIN_EMAIL) ]]; then
    local email pw
    email=$(ask "Admin email (your login for the admin page)" "${ADMIN_EMAIL:-admin@$(env_get DOMAIN)}")
    pw=${ADMIN_PASSWORD:-$(ask_secret "Admin password (leave empty to generate one)")}
    [[ -n $pw ]] || pw=$(rand 16)
    env_set ADMIN_EMAIL "$email"; env_set ADMIN_PASSWORD "$pw"
  fi

  step "Building and starting the website, API and database (first time takes several minutes)"
  compose up -d --build --remove-orphans
  docker image prune -f >/dev/null 2>&1 || true
  ok "Containers running (all bound to 127.0.0.1)"

  setup_tunnel_user
  setup_https

  step "Daily database backups"
  cat >/etc/systemd/system/madness-backup.service <<EOF
[Unit]
Description=Madness database backup
[Service]
Type=oneshot
ExecStart=/usr/local/bin/madness backup
EOF
  cat >/etc/systemd/system/madness-backup.timer <<EOF
[Unit]
Description=Daily Madness database backup
[Timer]
OnCalendar=*-*-* 04:30:00
Persistent=true
[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload; systemctl enable --now madness-backup.timer >/dev/null 2>&1
  ok "Backups every day at 04:30 into $DIR/backups (14 kept)"

  echo
  echo "${c_green}Website + API are installed.${c_off}"
  echo "  Site:      https://$(env_get DOMAIN)   (HTTPS can take a minute on first visit)"
  echo "  Admin:     $(env_get ADMIN_EMAIL) / $(env_get ADMIN_PASSWORD)"
  echo "  Next:      sudo madness pair   (then type the command it shows on the GPU box)"
}

# ---------------------------------------------------------------- GPU ----
gpu_pair() {
  local url="$1"
  step "Pairing with your VPS"
  install -d -m 700 /etc/madness
  [[ -f /etc/madness/tunnel_key ]] || ssh-keygen -q -t ed25519 -N "" -C madness-gpu -f /etc/madness/tunnel_key
  local pub; pub=$(cat /etc/madness/tunnel_key.pub)
  local resp; resp=$(curl -fsS --max-time 30 -X POST -H 'Content-Type: application/json' \
    -d "{\"pubkey\": \"${pub% *}\"}" "$url/register") || die "Pairing failed. Is 'madness pair' still running on the VPS?"
  j() { python3 -c "import json,sys; print(json.load(sys.stdin)['$1'])" <<<"$resp"; }
  j known_hosts >/etc/madness/known_hosts
  env_set ROLE gpu
  env_set TUNNEL_HOST "$(j ssh_host)"
  env_set TUNNEL_USER "$(j ssh_user)"
  env_set TUNNEL_PORT "$(j remote_port)"
  env_set LLM_API_KEY "$(j llm_api_key)"
  cat >/etc/systemd/system/madness-tunnel.service <<EOF
[Unit]
Description=Madness private link to the VPS (SSH reverse tunnel)
After=network-online.target
Wants=network-online.target
[Service]
ExecStart=/usr/bin/ssh -N -T -i /etc/madness/tunnel_key -o IdentitiesOnly=yes -o BatchMode=yes \
  -o UserKnownHostsFile=/etc/madness/known_hosts -o StrictHostKeyChecking=yes \
  -o ServerAliveInterval=15 -o ServerAliveCountMax=3 -o ExitOnForwardFailure=yes \
  -R 127.0.0.1:$(j remote_port):127.0.0.1:8080 $(j ssh_user)@$(j ssh_host)
Restart=always
RestartSec=5
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload; systemctl enable -q madness-tunnel.service; systemctl restart madness-tunnel.service
  sleep 4
  if systemctl is-active -q madness-tunnel.service; then ok "Private link to the VPS is up"; else warn "Link not up yet; it retries every 5 seconds (journalctl -u madness-tunnel)"; fi
}

gpu_system_setup() {
  step "System settings for an always-on server"
  hostnamectl set-hostname madness-gpu
  systemctl mask -q sleep.target suspend.target hibernate.target hybrid-sleep.target
  ok "Sleep disabled, hostname set"
  if ! systemctl is-enabled -q dnf-automatic.timer 2>/dev/null && ! systemctl is-enabled -q dnf5-automatic.timer 2>/dev/null; then
    dnf -y -q install dnf-automatic || dnf -y -q install dnf5-plugin-automatic || true
    mkdir -p /etc/dnf
    cat >/etc/dnf/automatic.conf <<EOF
[commands]
upgrade_type = security
apply_updates = yes
reboot = never
EOF
    systemctl enable --now dnf-automatic.timer >/dev/null 2>&1 || systemctl enable --now dnf5-automatic.timer >/dev/null 2>&1 || true
    ok "Automatic security updates on (never reboots by itself)"
  fi
  ok "Firewall unchanged: the model only listens on 127.0.0.1 and leaves through the SSH link"
  if [[ ! -f /etc/madness-cockpit-asked ]]; then
    touch /etc/madness-cockpit-asked
    if [[ $(ask "Enable Cockpit (web dashboard for this box, home network only)? y/N" "n") =~ ^[Yy] ]]; then
      dnf -y -q install cockpit
      systemctl enable --now cockpit.socket
      firewall-cmd -q --permanent --add-service=cockpit && firewall-cmd -q --reload
      ok "Cockpit on https://$(hostname -I | awk '{print $1}'):9090 (log in with your Fedora user)"
    fi
  fi
}

gpu_nvidia() {
  step "NVIDIA driver for the RTX 5060 Ti"
  if nvidia-smi >/dev/null 2>&1; then
    ok "Driver working: $(nvidia-smi --query-gpu=name,driver_version --format=csv,noheader)"
    return 0
  fi
  lspci | grep -qi nvidia || die "No NVIDIA GPU found (lspci). Is the card seated and powered?"
  if [[ -n ${MADNESS_UNATTENDED:-} ]] && modinfo -F version nvidia >/dev/null 2>&1; then
    echo "${c_red}  ✗ The NVIDIA driver is built but won't load. Usually Secure Boot is on: turn it off in the BIOS"
    echo "    (or see docs/SETUP-FEDORA.md), reboot, then run: sudo /opt/madness/install.sh gpu${c_off}"
    exit 0  # stop here without retrying (the resume service disables itself)
  fi
  if command -v mokutil >/dev/null && mokutil --sb-state 2>/dev/null | grep -qi enabled; then
    warn "Secure Boot is ON. Easiest: reboot into BIOS, turn Secure Boot off, then run this again."
    warn "(Keeping it on works too, see docs/SETUP-FEDORA.md 'Secure Boot' section.)"
  fi
  local fv; fv=$(rpm -E %fedora)
  dnf -y -q install "https://mirrors.rpmfusion.org/free/fedora/rpmfusion-free-release-$fv.noarch.rpm" \
                    "https://mirrors.rpmfusion.org/nonfree/fedora/rpmfusion-nonfree-release-$fv.noarch.rpm" || true
  # Blackwell (RTX 50xx) needs NVIDIA's open kernel modules
  echo "%_with_kmod_nvidia_open 1" >/etc/rpm/macros.nvidia-kmod
  dnf -y -q install "kernel-devel-$(uname -r)" || dnf -y -q install kernel-devel
  dnf -y -q install akmod-nvidia xorg-x11-drv-nvidia-cuda
  step "Building the driver for your kernel (takes 3-10 minutes, please wait)"
  akmods --force --kernels "$(uname -r)" >/dev/null 2>&1 || true
  for _ in $(seq 1 60); do modinfo -F version nvidia >/dev/null 2>&1 && break; sleep 10; done
  modinfo -F version nvidia >/dev/null 2>&1 || die "Driver build failed. Check: journalctl -u akmods"
  ok "Driver $(modinfo -F version nvidia) built"

  # resume automatically after the reboot
  cat >/etc/systemd/system/madness-resume.service <<EOF
[Unit]
Description=Finish Madness install after reboot
After=network-online.target
Wants=network-online.target
[Service]
Type=oneshot
Environment=MADNESS_UNATTENDED=1
ExecStart=$DIR/install.sh gpu
ExecStartPost=/bin/systemctl disable madness-resume.service
Restart=on-failure
RestartSec=60
StandardOutput=journal+console
[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload; systemctl enable -q madness-resume.service
  echo
  echo "${c_yellow}A reboot is needed to load the NVIDIA driver.${c_off}"
  echo "After the reboot the install finishes by itself (about 15-40 min, mostly downloading the model)."
  echo "Watch it with:  sudo madness install-log"
  if [[ $(ask "Reboot now? Y/n" "y") =~ ^[Yy] ]]; then reboot; fi
  exit 0
}

gpu_container_runtime() {
  install_docker
  step "Letting Docker use the GPU"
  if ! command -v nvidia-ctk >/dev/null; then
    curl -fsSL https://nvidia.github.io/libnvidia-container/stable/rpm/nvidia-container-toolkit.repo \
      -o /etc/yum.repos.d/nvidia-container-toolkit.repo
    dnf -y -q install nvidia-container-toolkit
  fi
  nvidia-ctk runtime configure --runtime=docker >/dev/null
  systemctl restart docker
  docker run --rm --gpus all ghcr.io/ggml-org/llama.cpp:server-cuda --version >/dev/null 2>&1 \
    && ok "Docker can see the GPU" || warn "GPU test container failed; continuing (see: madness logs)"
}

gpu_start_model() {
  step "Starting the model (first start downloads ~12 GB of gpt-oss-20b)"
  mkdir -p "$DIR/models"
  [[ -n $(env_get LLM_CTX) ]] || env_set LLM_CTX 131072
  [[ -n $(env_get LLM_PARALLEL) ]] || env_set LLM_PARALLEL 8
  for ctx in 131072 98304 65536 32768; do
    (( ctx > $(env_get LLM_CTX) )) && continue
    env_set LLM_CTX "$ctx"
    compose up -d --force-recreate
    echo "  Trying context pool of $ctx tokens with $(env_get LLM_PARALLEL) parallel chats..."
    local started=0 deadline=$(( $(date +%s) + 4 * 3600 ))  # slow internet: 12 GB can take a while
    while (( $(date +%s) < deadline )); do
      local restarts; restarts=$(docker inspect -f '{{.RestartCount}}' "$(compose ps -q llm)" 2>/dev/null || echo 0)
      if (( restarts >= 3 )) && ! compose logs --tail 80 llm 2>&1 | grep -qiE "out of memory|failed to allocate|cudaMalloc failed|failed to create context"; then
        compose logs --tail 30 llm; die "The model keeps crashing (see the log above). Send this output for help."
      fi
      if curl -fsS --max-time 3 "http://127.0.0.1:8080/health" 2>/dev/null | grep -q ok; then started=1; break; fi
      if compose logs --tail 80 llm 2>&1 | grep -qiE "out of memory|failed to allocate|cudaMalloc failed|failed to create context"; then
        warn "Not enough GPU memory for $ctx tokens, trying smaller"; break
      fi
      local last; last=$(compose logs --tail 1 llm 2>&1 | tail -1 | cut -c1-110)
      printf '\r  %s' "${last//$'\r'/}"; printf '\e[K'
      sleep 5
    done
    echo
    if (( started )); then ok "Model online: context pool $ctx tokens, $(env_get LLM_PARALLEL) chats at once"; return 0; fi
  done
  die "Model did not start. Run 'madness logs' to see why."
}

install_gpu() {
  load_os
  [[ $OS_ID == fedora ]] || die "The GPU box must run Fedora (found: $PRETTY_NAME)."
  step "Preparing the GPU box ($PRETTY_NAME)"
  dnf -y -q install git openssh-clients python3 pciutils mokutil
  ok "Base packages installed"
  get_code
  if [[ -n ${PAIR_URL:-} ]]; then gpu_pair "$PAIR_URL"; fi
  [[ -f /etc/systemd/system/madness-tunnel.service ]] || die "Not paired yet. On the VPS run 'madness pair' and type the command it shows here."
  gpu_system_setup
  gpu_nvidia
  gpu_container_runtime
  gpu_start_model
  echo
  echo "${c_green}All done! Your GPU box is serving the model to the VPS.${c_off}"
  echo "  Check it any time:    madness status"
  echo "  Measure speed:        madness bench"
}

main() {
  need_root
  exec > >(tee -a "$LOG") 2>&1
  load_os
  local role="${1:-}"; shift || true
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --pair) PAIR_URL="$2"; shift 2 ;;
      *) shift ;;
    esac
  done
  case "$role" in
    vps) install_vps ;;
    gpu) install_gpu ;;
    *) echo "Usage: install.sh vps | gpu [--pair URL]"; exit 1 ;;
  esac
}

main "$@"
