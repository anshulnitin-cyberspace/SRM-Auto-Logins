<div align="center">

# 🔐 SRM Auto Login Ultra

One-click auto-login for your **SRMIST Google account** — a lightweight, privacy-first Chrome extension that fills your SRM credentials and signs you into Gmail automatically.

[![Language](https://img.shields.io/badge/Language-JavaScript-yellow?style=for-the-badge&logo=javascript&logoColor=white)]()
[![Extension](https://img.shields.io/badge/Extension-Chrome%20MV3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)]()
[![Platform](https://img.shields.io/badge/Platform-Chrome%20%7C%20Edge%20%7C%20Brave-lightgrey?style=for-the-badge&logo=googlechrome&logoColor=white)]()
[![Privacy](https://img.shields.io/badge/Privacy-100%25%20Local-success?style=for-the-badge&logo=shield&logoColor=white)]()
[![License](https://img.shields.io/badge/License-MIT-orange?style=for-the-badge&logo=opensourceinitiative&logoColor=white)](LICENSE)

**Never type your SRM NetID and password again. The extension handles the Google login flow for you — from the sign-in page to the "Choose an account" screen.**

</div>

---

## ✨ Features

- ⚡ **Zero-Touch Sign-In** — Opens Google login on every Chrome startup and auto-signs you into Gmail with your saved SRM account.
- 👥 **Multi-Account Support** — Save unlimited SRM accounts, set a **default**, and enable/disable or edit them any time from the popup.
- 🎯 **Google Account-Chooser Auto-Selection** — Visits `accounts.google.com` with multiple signed-in sessions? The extension instantly clicks your preferred saved account (or the first SRM-domain session).
- 🔒 **100% Local Storage** — Credentials are obfuscated and stored **only in your browser** via `chrome.storage.local`. Nothing ever leaves your device, and the only permission used is `storage`.
- 🛡️ **2FA-Aware** — Detects challenge/2FA screens and pauses with a friendly toast instead of fighting the login flow.
- 🔁 **Self-Healing** — A timestamped halt guard prevents any infinite retry loops; the login flow resumes cleanly after a short pause.
- 🧩 **Tiny & Minimal** — A modern MV3 service worker, ~500 lines of content script, and a Playfair Display-styled popup. No frameworks, no dependencies.

---

## 📁 Project Structure

```text
srm-auto-login-ultra/
├── manifest.json          # MV3 manifest (storage permission only)
├── background.js          # Startup worker: opens Google login → Gmail
├── content.js             # Auto-login engine & Google chooser auto-select
├── popup.html             # Account manager UI (light-grey, Playfair Display)
├── popup.js               # Multi-account CRUD, default/enable toggles
└── shared/
    └── storage.js         # Obfuscation, SRM ID validation, persistence layer
```

---

## 🧩 How It Works

The content script runs **only** on `https://accounts.google.com/*` and drives the whole login flow through a single persistent `MutationObserver`:

### 1. Smart URL Router

The engine watches the current URL and routes each step accordingly:

| Stage | URL Marker | Action |
|-------|------------|--------|
| **Identifier / Chooser** | `/identifier`, `/accountchooser` | Auto-selects preferred saved account (or first SRM-domain session) on the "Choose an account" screen, else fills the email field |
| **Password** | `/challenge/pwd` | Fills the password for the matching saved account and submits |
| **Confirm Identifier** | `/confirmidentifier` | Confirms the account to finish sign-in |
| **2FA / Challenge** | challenge markers | Pauses login with a toast |

### 2. Account-Chooser Auto-Selection

Google's "Choose an account" screen renders progressively, so the engine **waits** for the account cards (`[data-email]`, `[data-authuser]`, etc.) to exist before clicking:

1. Look for the **preferred (default) saved account** card → click it.
2. Otherwise, click the **first SRM-domain session** card available.
3. If neither exists, fall back to the plain login form and fill the credentials directly.

### 3. Credential Handling

- Passwords are obfuscated with a lightweight XOR + hex scheme before storage — never stored as plaintext.
- Legacy single-account entries are transparently migrated on load.

---

## 📥 Installation

### Option A — Download the Release (Recommended)

1. Grab the latest `srm-auto-login-ultra-v*.zip` from the [Releases](https://github.com/anshulnitin-cyberspace/SRM-Auto-Logins/releases) section.
2. Unzip it — you'll get a folder named `srm-auto-login-ultra` containing `manifest.json`.
3. Open **`chrome://extensions`** (or `edge://extensions`), toggle **Developer mode** on.
4. Click **Load unpacked** and select that folder.

### Option B — Clone & Load

```bash
git clone https://github.com/anshulnitin-cyberspace/SRM-Auto-Logins.git
```

Then follow steps 3–4 above using the `srm-auto-login-ultra/` folder from the clone.

---

## 🚀 Usage

1. Click the extension icon to open the popup.
2. Enter your SRM **NetID** (format `ab1234`) and password, then **Save account**.
3. Add more accounts anytime — pick a **default**, or enable/disable each one.
4. Restart Chrome (or just open a Google login page) and let it do the rest.

The extension auto-opens the Google sign-in page on every Chrome startup and signs you into **Gmail** automatically.

> 💡 Tip: The account list in the popup is collapsible — click the **Saved accounts** header to drop it down.

---

## ⚖️ Disclaimer

> ⚠️ **Warning:** This tool is intended for **personal use** to automate logging into your own SRMIST account. Use it only on your own devices and accounts. Storing passwords in browser storage, even obfuscated, carries inherent risk — treat your machine accordingly.

---

## 📄 License

This project is open-source and available under the **MIT License**.