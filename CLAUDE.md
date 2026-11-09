# Madness: handoff notes for Claude

This file is read automatically by any Claude session opened in this folder. Keep it current:
update **Status** and **Next steps** whenever something changes.

## What this is
A self-hosted AI SaaS that the owner (Parzival) is building:
- A ChatGPT-style website and an OpenAI-compatible API (`/v1`).
- The model is **gpt-oss-20b** (llama.cpp, MXFP4) on an **RTX 5060 Ti 16 GB** in a GPU box at home.
- The owner is a beginner. Explain in plain words, ask before choices that matter, and do the work for them.

## Where everything lives
| What | Where |
|---|---|
| Code | https://github.com/Parzival-Samanyolu/madness (public, branch `main`). Local copy: this folder |
| Live site | https://samanyoluai.duckdns.org (admin page `/admin`, API `/v1`, docs `/docs`). DuckDNS name made by the owner on duckdns.org (static IP, no updater needed) |
| VPS | `ssh oracle-amd1` (Ubuntu 22.04, 1 GB RAM + 5 GB swap, passwordless sudo). Install dir `/opt/madness`, secrets in `/opt/madness/.env` (root only) |
| Admin login | `muradhumbatov@hotmail.com`. The password is `ADMIN_PASSWORD` in `/opt/madness/.env` on the VPS. Never write it into the repo |
| GPU box | Fedora **KDE** desktop at home. **No SSH access**: the owner types commands at its keyboard (Konsole) |
| Links | Apple Note "Madness AI – links" on the owner's Mac (syncs to their phone) |

## Architecture (as deployed)
```
Internet -> host Caddy on amd1 (/etc/caddy/sites/madness.caddy, HTTPS)
         -> web container (Caddy, 127.0.0.1:18090: static site, proxies /api,/v1)
         -> api container (FastAPI, 127.0.0.1:18000) -> postgres 127.0.0.1:55432, redis 127.0.0.1:56379
         -> LLM at 127.0.0.1:18080 = SSH reverse tunnel from the GPU box (user madness-tunnel, port 22)
GPU box: llama.cpp server-cuda on 127.0.0.1:8080; madness-tunnel.service runs ssh -R 18080:127.0.0.1:8080
```
- Oracle Cloud only allows ports 22, 80 and 443 in. That is why the design uses an SSH tunnel and not WireGuard.
- Pairing goes over HTTPS through Caddy (`/_pair/*` -> 127.0.0.1:51821), run by `scripts/pair_server.py`.
- DB schema changes **must** come with an Alembic migration:
  - `cd api && .venv/bin/alembic revision --autogenerate -m "..."`
  - `tests/test_migrations.py` fails if you forget.
- Plans and limits live in `api/app/config.py` (`PLANS`). The free plan has 32k context and 200k tokens/day. Pro has 120k context and is assigned manually on the admin page (Stripe is a stub).
- Website chats get context compression at 80% of the plan's context (`api/app/compress.py`).

## Status (2026-11-09)
- [x] Code complete. 42 API tests pass, and the website was checked in a headless browser.
- [x] VPS installed on oracle-amd1 and verified live (HTTPS, login, API returns 503 "model offline" as expected).
- [ ] **GPU box: not set up yet.** The owner will install Fedora KDE by following `docs/SETUP-FEDORA.md`.
  - On 2026-11-09 the owner said it will be "in a month or so" (around mid-December 2026). Open a fresh pairing window then.
- [ ] Pairing: the old window expired. When the owner is ready, run `ssh oracle-amd1 sudo madness pair 24` and put the new command in the Apple Note.
- [ ] After the GPU box connects:
  - Run `ssh oracle-amd1 madness status` (expect "connected").
  - Run `ssh oracle-amd1 madness bench` and report tok/s.
  - Raise or lower `LLM_PARALLEL` with the owner. Only the owner can change it, at the GPU box: `sudo madness set LLM_PARALLEL N`.
- [x] **Rebrand to Synapse deployed 2026-11-09** (commit 9661275).
  - Owner's choices: name **Synapse**, "made by **Samanyolu AI**", model **synapse-2**, modes low/medium/high (API: `reasoning_effort`), all plans get all modes.
  - Friendly and clear, replies in the user's language. Brain-spark logo. Home page Anthropic-style. Chat, login and settings ChatGPT-style. Dark default with a light switch.
  - Internal names stay `madness` (CLI, /opt/madness, services, repo).
- [x] **OpenRouter fallback is live.** `FALLBACK_LLM_API_KEY` is in `/opt/madness/.env`; the key has a $0 limit, so only free models work.
  - Used automatically while the GPU box is offline. Models are in `FALLBACK_MODELS` (default: nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free, then cohere/north-mini-code:free).
  - The owner said: no Gemma ("gemmas dont work"), small models only (max 200B).
- [x] **Address switched to https://samanyoluai.duckdns.org on 2026-11-09.** The old madness.…sslip.io address is off. The Apple Note is updated. A live chat test passed.
  - Backups from before the deploy are at /opt/madness/.env.bak-20261109 and /opt/madness/deploy/madness.caddy.bak-20261109.
- [x] **2026-11-09, later:**
  - Fixed the duplicate empty chats on repeat Enter. Moved the theme script to `/theme-init.js` (the CSP blocked the inline one).
  - Fallback models are now nvidia/nemotron-3.5-super-vl:free (primary, owner's choice) and recursive/flint-v1.0:free.
  - New admin panel with Overview / Users (details + actions) / Activity / System tabs.
  - **Memory**: table `memories` plus `users.memory_enabled` (migration 0002); code in `api/app/memory.py`.
    - After a web chat reply, a background low-effort request pulls out lasting facts, only if the message looks personal (regex gate).
    - Saved facts are added to the system prompt. Users manage them in Settings → Memory.
- [x] **2026-11-09, evening (migration 0003, deployed + live-tested): features the owner picked in "what to build next":**
  - Chat search now covers message text (`GET /api/conversations/search`), with snippets in the sidebar. Chats can be **pinned**.
  - **AI chat titles**: after the first reply, a low-effort request writes a 2-6 word title (`make_title` in `routers/chat.py`).
    The chat stream sends `done` first, then the `title` and `memory` events, so the input box unlocks right away.
  - **Share links**: `/share/<token>` is a public read-only snapshot (table `shared_chats`). No reasoning, no memories.
  - **Memory**: a wider gate (more languages, Turkish/Azeri verb endings, long messages), a "Memory updated" note in chat, and editing in Settings.
  - **Training data**: `users.training_opt_in` is off by default. Users turn it on with the sign-up checkbox or Settings → Data controls.
    The admin downloads it at System → Training data as JSONL in `{"messages":[...]}` format, with optional `thinking`. The file has no emails.
  - Edit-message and regenerate were already built before this.
- [ ] Ideas not built yet: Stripe billing, file upload, Google login, password reset by email.

## Next steps when the owner comes back
1. Ask whether the GPU box finished, then check with `ssh oracle-amd1 madness status`.
2. If it's not connected, the owner can run `journalctl -u madness-tunnel -n 30` and `sudo madness install-log` on the GPU box and read you the output.
3. Once it's online, test a real chat on the live site and run `madness bench`.

## Rules (the owner asked for these)
- **Keep the Mac clean.** Install nothing globally: no brew, no Docker, no `npm -g`, no pip `--user`.
  - Use `scripts/dev.sh`. It keeps the venv, `node_modules` and caches inside the project.
  - Run `scripts/mac-clean.sh` when you're done.
- **On oracle-amd1, don't touch anything else:**
  - `xb-telemetry` (live at the bare `193-122-49-121.sslip.io`, returns 404 at `/`, which is normal).
  - The owner's cron publishers.
  - `/opt/llm-gateway`: an old project, **stopped**. Its backup cron was renamed to `/etc/cron.d/llm-gateway-backup.disabled`. The owner chose to keep its files.
- Before changing Caddy, run `caddy validate`. Only edit `/etc/caddy/sites/madness.caddy`.
- Ask before deleting anything or before outward-facing actions (pushing to new places, posting).
- Commit as the GitHub no-reply email that is already set in this repo's local git config. Pushing with the private hotmail address is blocked by GitHub.
- Put links for the owner into the Apple Note "Madness AI – links", using `osascript`.

## Handy commands
```bash
ssh oracle-amd1 madness status            # health of everything
ssh oracle-amd1 sudo madness update       # deploy latest main (git pull + rebuild)
ssh oracle-amd1 sudo madness pair 24      # 24h pairing window for the GPU box
ssh oracle-amd1 sudo madness pair-command # show pending pairing command
ssh oracle-amd1 madness logs api          # live API logs
./scripts/dev.sh                          # local dev with mock model (http://localhost:5173)
```
