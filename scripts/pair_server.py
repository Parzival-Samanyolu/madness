#!/usr/bin/env python3
"""One-time pairing server (runs on the VPS via `sudo madness pair`). Standard library only.

It listens on 127.0.0.1:51821 and is reached over HTTPS through Caddy at https://<domain>/_pair/...

GET  /<code>           -> a small bash script that installs Madness on the GPU box
POST /<code>/register  -> the GPU box sends its SSH public key; it gets the VPS host key + settings

Stops after one successful pairing, or after 15 minutes.
"""
import json
import os
import re
import secrets
import subprocess
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = 51821
TIMEOUT = 15 * 60
REMOTE_PORT = 18080
TUNNEL_USER = os.environ.get("MADNESS_TUNNEL_USER", "madness-tunnel")
AUTH_KEYS = os.environ.get("MADNESS_AUTH_KEYS", f"/var/lib/{TUNNEL_USER}/.ssh/authorized_keys")
HOST_KEY = os.environ.get("MADNESS_HOST_KEY", "/etc/ssh/ssh_host_ed25519_key.pub")
ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"  # no look-alikes (l/1, o/0)
KEY_RE = re.compile(r"^ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI[A-Za-z0-9+/]{43}$")


def main():
    domain, public_ip, llm_key, repo, branch = sys.argv[1:6]
    code = "".join(secrets.choice(ALPHABET) for _ in range(8))
    host_key = " ".join(open(HOST_KEY).read().split()[:2])
    known_hosts = f"{public_ip} {host_key}"
    done = threading.Event()
    base = f"https://{domain}/_pair/{code}"

    bootstrap = f"""#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" = 0 ] || {{ echo "Please run with sudo"; exit 1; }}
echo "==> Downloading Madness"
dnf -y -q install git >/dev/null
if [ -d /opt/madness/.git ]; then git -C /opt/madness pull -q --ff-only; else git clone -q -b '{branch}' '{repo}' /opt/madness; fi
exec bash /opt/madness/install.sh gpu --pair '{base}'
"""

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            print("  pairing:", fmt % args, flush=True)

        def _send(self, status, body, ctype="application/json"):
            data = body.encode()
            self.send_response(status)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def do_GET(self):
            if self.path.strip("/") == code:
                return self._send(200, bootstrap, "text/x-shellscript")
            self._send(404, '{"error": "wrong or expired code"}')

        def do_POST(self):
            if self.path.strip("/") != f"{code}/register":
                return self._send(404, '{"error": "wrong or expired code"}')
            try:
                length = min(int(self.headers.get("Content-Length", 0)), 4096)
                pub = json.loads(self.rfile.read(length))["pubkey"].strip()
                if not KEY_RE.match(pub):
                    raise ValueError("bad key")
            except (ValueError, KeyError, TypeError):
                return self._send(400, '{"error": "bad request"}')
            write_authorized_key(pub)
            self._send(200, json.dumps({
                "ssh_host": public_ip, "ssh_user": TUNNEL_USER, "remote_port": REMOTE_PORT,
                "known_hosts": known_hosts, "llm_api_key": llm_key,
            }))
            print("\n  ✓ GPU box paired! It will now finish installing by itself.", flush=True)
            done.set()

    server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    print(f"""
  Pairing mode is on for 15 minutes.

  On the GPU box (Fedora, logged in at its keyboard) type exactly:

      curl -fsSL {base} | sudo bash

  Waiting for the GPU box...""", flush=True)
    paired = done.wait(TIMEOUT)
    time.sleep(2)  # let the last response finish sending
    server.shutdown()
    if not paired:
        print("\n  Pairing timed out. Run 'sudo madness pair' again when the GPU box is ready.")
    sys.exit(0 if paired else 2)


def write_authorized_key(pub: str):
    """Only allow this key to open the single reverse tunnel. Replaces any previous GPU box."""
    line = f'restrict,port-forwarding,permitlisten="127.0.0.1:{REMOTE_PORT}" {pub} madness-gpu\n'
    tmp = AUTH_KEYS + ".tmp"
    with open(tmp, "w") as f:
        f.write(line)
    os.chmod(tmp, 0o600)
    try:
        import pwd
        pw = pwd.getpwnam(TUNNEL_USER)
        os.chown(tmp, pw.pw_uid, pw.pw_gid)
    except KeyError:
        pass
    os.replace(tmp, AUTH_KEYS)
    # drop an old tunnel session that may still hold the port
    subprocess.run(["pkill", "-u", TUNNEL_USER, "sshd"], check=False, capture_output=True)


if __name__ == "__main__":
    main()
