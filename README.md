# Event Leaderboard System

A professional, modern **Event Leaderboard** with an admin score-management dashboard.
Built with **HTML5, CSS3, Vanilla JavaScript**, and a tiny **PHP + JSON-file** backend so
scores are **shared live across every visitor** when hosted (e.g. on Hostinger).

## Two data modes (automatic)

| Mode | When it's used | Where data lives | Shared? |
|------|----------------|------------------|---------|
| **Live / Server** | Site served over http(s) with PHP (Hostinger, XAMPP, `php -S`) | `data.json` on the server, via `api.php` | ✅ Yes — everyone sees the same board |
| **Local preview** | You open the `.html` files directly from disk (`file://`) | Your browser's `localStorage` | ❌ No — only that one browser |

The page detects the mode on load and shows a badge: **🟢 Live** or **🟠 Local preview**.

## Features

**Public leaderboard (`index.html`)**
- Animated top-3 podium — Rank 1 dominant, Rank 2 & 3 slightly smaller
- Gold / silver / bronze medals, gradients, shadows, hover effects
- Per-event selector, full standings table, graceful empty state
- **Light / dark theme toggle** (☀️/🌙) — remembers your choice, follows system default
- **Auto-refreshes every 12s in Live mode** — scores update without reloading
- Fully responsive; honors `prefers-reduced-motion`

**Admin dashboard (`admin.html`)**
- **Password-protected** in Live mode (login overlay)
- Create / delete events
- Add, edit, delete participants (name, organization, score, logo URL)
- Automatic ranking with **tie handling** (standard competition ranking: 1, 2, 2, 4)
- Reset all scores; toast notifications; live participant count

## Files

| File | Purpose |
|------|---------|
| `index.html` | Public leaderboard |
| `admin.html` | Admin dashboard |
| `style.css`  | All styling, animations, responsive layout |
| `script.js`  | Ranking engine + API/localStorage data layer for both pages |
| `api.php`    | JSON-file API — read (public) / write (password-protected) |
| `config.php` | **Your admin password lives here — change it!** |
| `data.json`  | The live scores (auto-created/updated by `api.php`) |

---

## 🚀 Deploy to Hostinger (live for all visitors)

1. **Set your password.** Open `config.php` (line 11). The current password is:
   ```php
   define('ADMIN_PASSWORD', 'Podium@2026!');   // <-- change to your own strong password
   ```

2. **Upload the files.** In Hostinger's **hPanel → File Manager** (or via FTP),
   upload everything into **`public_html`** (or a subfolder like `public_html/leaderboard`):
   ```
   index.html  admin.html  style.css  script.js  api.php  config.php  data.json
   ```

3. **Make sure PHP can write `data.json`.** In File Manager, right-click
   `data.json` → **Permissions** → set to **644** (and the folder to **755**).
   Hostinger's defaults usually already allow this. If not, you'll see a clear
   error in the admin panel when saving.

4. **Open your site:**
   - Public board → `https://yourdomain.com/` (or `/leaderboard/`)
   - Admin → `https://yourdomain.com/admin.html` — log in with your password.

5. **Run your event.** Edit scores in the admin panel; the public board updates
   for everyone within ~12 seconds (or on refresh).

> **Security notes**
> - `config.php` is executed by PHP, so its contents (your password) are never
>   served as text.
> - Don't commit your real password to a public repo. `data.json` is git-ignored
>   so deploys never clobber live scores.
> - For a private admin URL, you can also add Hostinger **Directory Password
>   Protection** on `admin.html` for a second layer.

---

## Run locally

- **Quickest (local preview):** double-click `index.html`. Works instantly using
  `localStorage`, but data isn't shared between devices. No login required.
- **Full live behavior locally:** serve the folder with PHP:
  ```bash
  php -S localhost:8000
  ```
  then visit `http://localhost:8000/` and `http://localhost:8000/admin.html`.
  (XAMPP works too — drop the folder in `htdocs`.)

## Reset to sample data

Delete `data.json` (the server recreates it from the built-in sample on the next
load), or in Local mode clear the site's storage in your browser.
