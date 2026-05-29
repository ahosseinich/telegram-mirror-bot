# Personal Mirror Bot

Mirrors messages between two private Telegram groups.

- **Group A → Group B**: messages from allowlisted senders are forwarded
- **Group B → Group A**: your messages (owner only) are forwarded back

## Setup

### 1. Create the bot

1. Open [@BotFather](https://t.me/BotFather) on Telegram
2. Send `/newbot` and follow the prompts
3. Copy the **token** you receive

### 2. Disable privacy mode ⚠️

By default, bots only see messages that start with `/` in groups.
You must turn this off so the bot can read all messages:

1. In @BotFather, send `/mybots`
2. Select your bot → **Bot Settings** → **Group Privacy** → **Turn off**

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `BOT_TOKEN` — from BotFather
- `OWNER_ID` — your Telegram user ID (message [@userinfobot](https://t.me/userinfobot) to find it)
- `ALLOWED_SENDER_IDS` — comma-separated user IDs to relay from Group A
- `GROUP_A_ID` / `GROUP_B_ID` — see step 4

### 4. Get group IDs

1. Add the bot to **both groups** (make it an admin so it can read all messages)
2. Install dependencies and start the bot:

```bash
npm install
npm start
```

3. In each group, send `/chatid` — the bot will reply with that group's ID
4. Paste those IDs into `.env`, then restart the bot

### 5. Run

```bash
npm start          # production
npm run dev        # auto-restart on file changes (Node 18+)
```

## How it works

```
Group A ──[allowed sender]──▶ bot ──▶ Group B  (native forward)
Group B ──[you / owner]──────▶ bot ──▶ Group A  (native forward)
```

Messages are forwarded natively (shows "Forwarded from …" banner).
All message types work: text, photos, videos, files, stickers, etc.
