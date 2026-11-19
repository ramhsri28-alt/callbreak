# 🃏 Offline Call Break - Local Hotspot Multiplayer

A lightweight, 100% offline local-network multiplayer **Call Break** card game server designed to run directly on an Android phone inside **Termux** (4GB RAM mid-range phone) using Node.js.

Your friends connect to your phone's Wi-Fi Hotspot and play directly in their Chrome browser. **No internet connection is needed while playing! No apps or plugins required for friends.**

---

## 📋 Table of Contents
1. [Prerequisites & One-Time Setup on Android](#1-prerequisites--one-time-setup-on-android)
2. [How to Transfer Files to Your Phone](#2-how-to-transfer-files-to-your-phone)
3. [Running the Server on Your Phone](#3-running-the-server-on-your-phone)
4. [How Your Friends Join & Play](#4-how-your-friends-join--play)
5. [Server-Side Bots (Solo & Less Than 4 Players)](#5-server-side-bots-solo--less-than-4-players)
6. [Common Problems & Fixes](#6-common-problems--fixes)
7. [Testing on Your Computer (4 Tabs)](#7-testing-on-your-computer-4-tabs)
8. [Call Break Rules Implemented](#8-call-break-rules-implemented)
9. [How to Customize Colors & Look](#9-how-to-customize-colors--look)

---

## 1. Prerequisites & One-Time Setup on Android

You only need an internet connection **once** to install Termux and Node.js.

### Step 1: Install Termux from F-Droid
> ⚠️ **Important:** Do NOT install Termux from Google Play Store (the Play Store version is abandoned and packages will fail to install).
- Download Termux from F-Droid: **https://f-droid.org/en/packages/com.termux/**
- Install the `.apk` on your Android phone.

### Step 2: Open Termux and Run These Commands
Copy and paste each line into Termux:

```bash
# Update packages
pkg update && pkg upgrade -y

# Install Node.js
pkg install nodejs -y

# Verify Node.js is installed (shows v20 or newer)
node -v
npm -v
```

---

## 2. How to Transfer Files to Your Phone

### Option A: Direct Copy via USB Cable or Download Folder (Easiest)
1. Zip this project folder (`cardgame.zip`) on your PC.
2. Send it to your phone (via USB cable, Bluetooth, or Google Drive / WhatsApp once).
3. Place the extracted `cardgame` folder in your phone's **Download** folder.
4. In Termux, grant storage permission:
   ```bash
   termux-setup-storage
   ```
   *(A popup will ask for permission; tap **Allow**)*
5. Navigate to your folder inside Termux:
   ```bash
   cd ~/storage/shared/Download/cardgame
   ```

### Option B: Copying files directly inside Termux home directory
```bash
cd ~
# If you copied cardgame into your home directory:
cd cardgame
```

---

## 3. Running the Server on Your Phone

Once inside the `cardgame` folder in Termux:

### Step 1: Install Dependencies (Run once while connected to internet)
```bash
npm install
```
*(This only installs Express and WS. Zero native compilation required!)*

### Step 2: Prevent Your Phone from Sleeping
To ensure the server does not pause when your phone screen turns off:
```bash
termux-wake-lock
```

### Step 3: Start the Server
```bash
node server.js
```

You will see:
```text
=============================================================
 🃏  OFFLINE MULTIPLAYER CARD GAME SERVER READY
=============================================================
 Server running on port: 3000
 No internet connection is required while playing!
-------------------------------------------------------------
 🌟 ANDROID HOTSPOT LINK (Share this with friends):
    👉  http://192.168.43.1:3000
-------------------------------------------------------------
```

### To Stop the Server:
Press **`Ctrl + C`** on your Termux keyboard.

---

## 4. How Your Friends Join & Play

1. On your host phone, turn **ON** your **Portable Wi-Fi Hotspot**.
2. Have your 3 friends connect to your phone's Wi-Fi Hotspot.
3. Your friends open **Google Chrome** (or any browser) on their phones and type the link printed on your Termux screen:
   ```text
   http://192.168.43.1:3000
   ```
   *(Note: Make sure they include `http://` so Chrome doesn't treat it as a Google search).*
4. You (the host) also open Chrome on your phone and open `http://localhost:3000` or `http://192.168.43.1:3000`.
5. Each person enters their name and joins the table.
6. Once 4 players are seated, the host taps **"Start Call Break"**!

---

## 5. Server-Side Bots (Solo & Less Than 4 Players)

You don't need to wait for 3 friends to play! The server includes smart server-side AI bots:
- **Auto-Fill Empty Seats**: If 1, 2, or 3 humans join and the host clicks **"Start Call Break"**, the server automatically fills the remaining seats with bots (`Bot 1`, `Bot 2`, etc.).
- **Difficulty Modes**:
  - **Medium (Default)**: Strategic bidding based on hand strength, cashing aces, saving trumps, winning tricks as cheaply as possible, and discarding low worthless cards.
  - **Easy**: Casual play with randomized legal moves and simple bids.
- **Natural Timing**: Bots pause 700 to 1200 ms with an animated "Thinking..." status before making a move, giving a real-game feel.
- **Human Takeover**: If a friend arrives later, they can take over a bot's seat between rounds (during the round summary screen).
- **Zero Cheating**: Bots run 100% on the server, see only their own cards, and follow the exact same validation rules as humans.

---

## 6. Common Problems & Fixes

| Issue | Solution |
| :--- | :--- |
| **Chrome does a Google search instead of opening the link** | Type the full address with `http://`, for example: `http://192.168.43.1:3000` (not just `192.168.43.1:3000`). |
| **"Wi-Fi has no internet" popup on friends' phones** | Android or iOS will display a warning that the hotspot has no internet. Tap **"Keep Connected"** or **"Stay Connected"** or **"Use this network as is"**. |
| **Friends can't connect / Connection timed out** | Check your Hotspot IP. While 95% of Android phones use `192.168.43.1`, some brands use `192.168.50.1` or `192.168.1.1`. Look at the exact IP printed by `node server.js` in your Termux window. |
| **Server stops when host phone screen turns off** | In Termux, run `termux-wake-lock` before starting `node server.js`. Also, disable battery optimization for Termux in your phone's Android Settings → Apps → Termux → Battery → Unrestricted. |
| **Disconnects while playing** | Reconnection is built-in! If someone switches apps or their phone sleeps, when they return to Chrome, they will automatically rejoin their seat and restore their hand. The game will pause with a notice until they return. |
| **Accidental cellular routing** | Turn **Mobile Data OFF** on the host phone while playing so Android does not attempt to route local requests through 4G/5G. |

---

## 6. Testing on Your Computer (4 Tabs)

You can test the entire multiplayer game right on your laptop before moving it to your phone:

1. Open your terminal in this folder and run:
   ```bash
   node server.js
   ```
2. Open 4 separate tabs in Chrome:
   - Tab 1: `http://localhost:3000` (Enter name: "Host Player")
   - Tab 2: `http://localhost:3000` (Enter name: "Player 2")
   - Tab 3: `http://localhost:3000` (Enter name: "Player 3")
   - Tab 4: `http://localhost:3000` (Enter name: "Player 4")
3. In Tab 1, click **"Start Call Break"**.
4. Test bidding: Each player places their bid (1 to 8).
5. Test playing: Notice how only legal cards can be played, and the game enforces following suit or trumping with Spades!

You can also run our automated verification test anytime:
```bash
npm test
```

---

## 7. Call Break Rules Implemented (Nepali/Indian Standard)

- **4 Players, 52 Cards**: Each player receives 13 cards.
- **5 Rounds Total**: Dealer rotates counter-clockwise each round.
- **Direction**: Play proceeds in **counter-clockwise** order. The table shows clear directional arrows.
- **Spades are Trump**: Spades (`S`) beat all other suits.
- **Trick Rules Enforced by Server**:
  1. You must follow the led suit if you have it.
  2. If following the led suit, you must play a higher card than the current highest of that suit if possible.
  3. If you have no cards of the led suit, you **must play a Spade** if you have one. If a spade was already played, you must play a higher spade if possible.
  4. If you have neither the led suit nor any spades, you may discard any card.
- **Scoring**:
  - If tricks won $\ge$ bid: `Score = Bid + 0.1 × (Tricks Won - Bid)` (e.g. Bid 3, Won 5 = `3.2`).
  - If tricks won $<$ bid: `Score = -Bid` (e.g. Bid 3, Won 2 = `-3.0`).
- **Fairness**:
  - Secure hardware-level Fisher-Yates shuffle using Node's `crypto.randomInt`.
  - Your private cards are never sent to your opponents' phones.

---

## 8. How to Customize Colors & Look

All design colors are neatly organized in **`public/css/tokens.css`**. You can open that file with any text editor to customize the theme:

```css
:root {
  /* Change Table Felt Color */
  --bg-table-felt: #163626;     /* Felt center surface */
  --bg-canvas: #09130e;         /* Outer background */

  /* Change Highlight & Turn Accent Color */
  --accent-gold: #f5c443;       /* Gold turn indicator & buttons */

  /* Change Card Colors */
  --suit-red: #d32f2f;         /* Red for Hearts and Diamonds */
  --suit-black: #1a1e24;       /* Black for Spades and Clubs */
  --card-face: #fbfbfa;        /* Card surface color */
}
```

- **Lite Mode**: Tap the **"✨ Smooth / ⚡ Lite"** toggle at the top right of the game screen to disable heavy animations on older phones.
- **Sound**: Tap **"🔇 Mute / 🔊 Sound"** to enable or disable audio. Sounds are generated locally using the Web Audio API with zero external audio files.
