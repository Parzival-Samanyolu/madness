# Madness (public brand: Synapse by Samanyolu AI)

Users see **Synapse** and the model **synapse-2**. `madness` is only the internal name (CLI, folders, services).

Your own AI service: a ChatGPT-style website plus an OpenAI-compatible API, running **gpt-oss-20b** on your own RTX 5060 Ti.

```
 Internet ──HTTPS──► VPS (website, API, accounts, database)
                       ▲  private SSH tunnel on port 22 (the GPU box dials out, so no router changes)
                       │
                     GPU box at home (Fedora KDE + RTX 5060 Ti): runs the model
```

**What users get:** sign-up and login, streaming chat with code highlighting and a visible "thinking" section, saved conversations, automatic context compression at 80%, API keys, and a usage dashboard.
**What you get:** an admin page with stats, ban and plan controls, free/pro plans with daily limits, automatic HTTPS, daily database backups, and one-command updates.

---

## Install

Code: **https://github.com/Parzival-Samanyolu/madness**

### Part A: the VPS (over SSH)

Any Ubuntu/Debian/Fedora VPS works, even 1 GB RAM. If it already runs Caddy, Madness adds one site file to it; otherwise it brings its own. Run:

```bash
curl -fsSL https://raw.githubusercontent.com/Parzival-Samanyolu/madness/main/install.sh | sudo bash -s vps
```

It asks for an admin email and password, then sets up the website at
`https://synapse.<your-ip-with-dashes>.sslip.io`. That's a free address that needs no sign-up, with real HTTPS.
Then run `sudo madness pair`. It prints a one-line HTTPS command to type on the GPU box.

Only ports **22, 80 and 443** are needed, which most VPSes (including Oracle Cloud) already allow.

### Part B: the GPU box (at its keyboard)

Follow **[docs/SETUP-FEDORA.md](docs/SETUP-FEDORA.md)**. It starts from a blank disk: USB stick, BIOS, Fedora KDE install, then the pairing command.

### Later: your own domain

Point the domain's DNS **A record** at the VPS IP, then on the VPS run:
```bash
sudo madness domain example.com
```

---

## Day-to-day

Run these on either machine (`madness help` lists them all):

| | |
|---|---|
| `madness status` | health of everything |
| `madness logs` | live logs |
| `sudo madness update` | pull the newest code from GitHub and restart |
| `madness bench` | how many users the GPU can serve at once |
| `sudo madness set LLM_PARALLEL 12` | more chats at once (GPU box) |
| `sudo madness backup` / `restore` | database backups (VPS, also daily at 04:00) |
| `sudo madness pair` | (re)connect a GPU box (VPS) |

**To change plans and limits**, edit `api/app/config.py` (`PLANS`), push, then run `sudo madness update` on the VPS.
The Free and Pro plans each set requests/minute, tokens/day, context size, answer length and parallel chats.
To change a user's plan, use the Admin page. Stripe billing has a stub ready in `api/app/routers/billing.py`.

## GPU capacity (RTX 5060 Ti, 16 GB)

- The model uses about 12 GB of memory. The rest holds a **shared 128k-token context pool** (8-bit KV cache), which any single chat can use in full.
- **8 chats generate at the same time** by default; more requests queue for a few seconds.
- Run `madness bench` to measure, then raise `LLM_PARALLEL` while "tok/s per user" stays above about 15.
- If 128k doesn't fit, the installer falls back to 96k, then 64k, on its own.

## Developing on your Mac (optional)

```bash
./scripts/dev.sh          # mock model + API + website on http://localhost:5173 (admin@local.test / admin12345)
cd api && .venv/bin/python -m pytest
./scripts/mac-clean.sh    # deletes every downloaded dependency again, keeping only the code
```
No GPU, Docker or global installs are needed. Everything lives inside the project folder and the cleanup script removes it.

## Layout

```
api/                 FastAPI: auth, API keys, limits, chat + compression, OpenAI-compatible /v1, admin
  migrations/        database schema changes (applied automatically on start)
web/                 React website (built into the Caddy image)
mock-llm/            fake model server for development and tests
deploy/Caddyfile     HTTPS + routing on the VPS
docker-compose.vps.yml / docker-compose.gpu.yml
install.sh           installer for both machines
bin/madness          the control command
scripts/             pairing server, benchmark, dev and cleanup scripts
docs/SETUP-FEDORA.md blank-disk guide for the GPU box
```

## Security notes

- Passwords are hashed with argon2. API keys and sessions are stored only as keyed hashes, and keys are shown once.
- The GPU box opens **no ports**. The model listens on 127.0.0.1 and is reached only through an outgoing SSH tunnel.
  On the VPS the tunnel user `madness-tunnel` has no shell and may only open that one tunnel port.
- Login and sign-up are rate-limited per IP. Banning a user logs them out everywhere.
- Pairing runs over HTTPS with a one-time code that expires after 15 minutes.
