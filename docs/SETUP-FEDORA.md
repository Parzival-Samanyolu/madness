# Setting up the GPU box (Fedora KDE) from a blank disk

A checklist you can print. It takes about an hour, most of which is waiting.
You need: the GPU box (RTX 5060 Ti), a USB stick of 8 GB or more, a wired network cable (recommended), and your Mac.

> Do **Part A (the VPS)** in the README first. At the end it gives you a short pairing command for step 6 below.

---

## 1. Make the install USB (on your Mac)

1. Go to **https://fedoraproject.org/kde/download** and download **Fedora KDE Plasma Desktop, x86_64** (the "Live ISO").
2. Download **Fedora Media Writer** (https://fedoraproject.org/workstation/download, scroll to "Fedora Media Writer" for macOS), or use **balenaEtcher**.
3. Plug in the USB stick, choose **"Select .iso file"**, pick the ISO, then click **Write**. This wipes the stick.

> **Monitor tip:** if your CPU has built-in graphics, plug the monitor into the **motherboard's** HDMI/DisplayPort, not the graphics card.
> Then the desktop doesn't use any of the 5060 Ti's 16 GB, and the AI gets all of it. If your CPU has no graphics, that's fine:
> the installer adjusts the AI's memory automatically.

## 2. BIOS / UEFI settings (on the GPU box)

Turn the box on and press the BIOS key right away (usually **Del** or **F2**). Then:

| Setting | Set to | Why |
|---|---|---|
| Boot mode | **UEFI** (CSM / Legacy **off**) | Modern boot |
| **Secure Boot** | **Disabled** | The NVIDIA driver loads without extra key steps (see the end of this guide if you want to keep it on) |
| Restore on AC power loss | **Power On** | The PC comes back by itself after a power cut |
| XMP / EXPO (memory profile) | Enabled (optional) | Faster RAM |
| Integrated graphics (iGPU) | **Enabled** if your monitor is on the motherboard port | Keeps the 5060 Ti free for the AI |

Save and exit (usually F10). Then boot from the USB stick. The boot menu key is usually **F8, F11 or F12**.

## 3. Install Fedora KDE

1. The USB starts a live KDE desktop. Double-click **"Install to Hard Drive"**.
2. Pick your language and keyboard.
3. **Installation Destination**: select the disk and keep **Automatic**. If the disk had something on it, choose **"Reclaim space" → "Delete all"**.
4. **Network**: wired is best. For Wi-Fi, use the network icon in the bottom-right corner of the live desktop.
5. **User**: create your user and **tick "Make this user administrator"**. Write the password down.
6. Click **Begin Installation**. When it finishes, shut down, remove the USB stick, and turn the PC on.

## 4. First login and updates

Log in to KDE, open **Konsole** (the menu → System → Konsole), and run:

```bash
sudo dnf -y upgrade --refresh
sudo reboot
```

Wi-Fi: connect with the network icon in the taskbar. Tick "connect automatically" and **"all users may connect"**,
so it reconnects after a reboot even before you log in.

## 5. Make the PC come back by itself after a reboot (recommended)

So the AI starts even if nobody logs in: open **System Settings → Colors & Themes → Login Screen (SDDM)
→ Behavior**, then turn on **"Automatically log in"** with your user. This is optional; the AI itself runs
without anyone logged in, but auto-login keeps the desktop ready.

## 6. Run the pairing command from your VPS

On the VPS, `sudo madness pair` shows a line like:

```bash
curl -fsSL https://samanyoluai.duckdns.org/_pair/abcd2345 | sudo bash
```

Type that **exact line** in Konsole on the GPU box and press Enter. It will:

1. Connect the box privately to your VPS with an SSH tunnel. You don't need to change anything on your home router.
2. Turn off sleep and suspend, so the AI stays online. KDE's "Sleep" button stops working on this PC; shutting down and restarting still work.
3. Ask whether you want **Cockpit**, a web dashboard for this box that you can open from your Mac on the home Wi-Fi. Your choice.
4. Install the NVIDIA driver, then ask to **reboot**. Say yes.
5. **After the reboot it continues by itself.** It installs Docker and downloads the AI model (about 12 GB), then starts it.

To watch progress after the reboot, log in, open Konsole and run:
```bash
sudo madness install-log
```
(Press Ctrl+C to stop watching. That does not stop the install.)

## 7. Check it worked

```bash
madness status
```
You want to see the GPU name, about 14-15 GB of video memory in use, and `{"status":"ok"}` under **Model**.
If the desktop runs on the 5060 Ti, a little of that memory is the desktop's; that's normal.
Then open your website from your phone and say hi.

To see how many people the GPU can serve at once:
```bash
madness bench
```

---

## Everyday commands (in Konsole on the GPU box)

| What | Command |
|---|---|
| Is everything OK? | `madness status` |
| Live model logs | `madness logs` |
| Install the newest version | `sudo madness update` |
| More chats at once (e.g. 12) | `sudo madness set LLM_PARALLEL 12` |
| Restart the model | `sudo madness restart` |

The box restarts everything on its own after a reboot or a power cut.

## Troubleshooting

- **`nvidia-smi` says "No devices were found"**: Secure Boot is probably still on (see below), or the driver build didn't finish. Run `sudo akmods --force && sudo reboot`.
- **Model never comes online**: run `madness logs`. If you see "out of memory", the installer already retries with a smaller context. You can also run `sudo madness set LLM_CTX 65536` yourself.
- **The website says "AI server is offline"**: run `madness status` on both machines. If *Private link* says "not connected", run `journalctl -u madness-tunnel -n 20` on the GPU box to see why.

## Keeping Secure Boot on (optional, advanced)

1. Run `sudo kmodgenca -a`, then `sudo mokutil --import /etc/pki/akmods/certs/public_key.der`, and choose a one-time password.
2. Reboot. A blue **MOK Manager** screen appears: pick **Enroll MOK → Continue → Yes**, then type that password.
3. Run `sudo akmods --force && sudo reboot`.
