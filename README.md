# imessage-claude

> **WARNING: This project is experimental and should be used with caution.**
>
> - This software reads directly from your macOS Messages database (`chat.db`). While it opens the database in **read-only mode**, use at your own risk.
> - It sends iMessages via AppleScript automation. Messages sent by the bot are real iMessages and cannot be unsent.
> - It spawns Claude Code CLI processes that can **read, write, and execute code** on your machine. Be mindful of the tools you allow and the working directory you configure.
> - This is a personal/hobby project with no warranty. See [LICENSE](LICENSE).
> - **Do not use this in production or for anything critical.** It is a proof of concept.

---

Send yourself a message on iMessage. Get a response from [Claude Code](https://claude.ai/download).

This is a lightweight Node.js relay that polls your Mac's iMessage database for self-messages, sends them to Claude Code's headless CLI (`claude -p`), and delivers Claude's response back as an iMessage — giving you full Claude Code agent access (file editing, bash commands, code search) from any device with iMessage.

## How it works

```
You (iMessage) ──> Messages.app ──> chat.db ──> [poller] ──> claude -p ──> [response]
                                                                                │
You (iMessage) <── Messages.app <── AppleScript <───────────────────────────────┘
```

1. A Node.js process polls `~/Library/Messages/chat.db` every 2 seconds
2. It detects new messages **from you to yourself** (self-messages only — other people's messages are completely ignored)
3. The message text is sent to Claude Code via `claude -p` (headless mode)
4. Claude's response is sent back to you as an iMessage via AppleScript, prefixed with `[Claude]`
5. Multi-turn conversation context is maintained (30-minute session timeout)

## Prerequisites

- **macOS** with Messages.app signed in to iMessage
- **Node.js** >= 18
- **Claude Code CLI** installed and authenticated ([download](https://claude.ai/download))
- **Full Disk Access** granted to your terminal app (required to read `chat.db`)

## Setup

### 1. Clone and install

```bash
git clone https://github.com/jcallicott/imessage-claude.git
cd imessage-claude
npm install
```

### 2. Grant Full Disk Access

Go to **System Settings > Privacy & Security > Full Disk Access** and enable it for your terminal app (Terminal.app, iTerm2, etc.). You may need to restart the terminal afterward.

### 3. Find your iMessage handle

Your handle is the phone number or email address associated with your iMessage account. You can find it in **Messages.app > Settings > iMessage** — it's listed under "You can be reached for messages at."

### 4. Run

```bash
IMESSAGE_HANDLE="you@example.com" npm start
```

Or with a phone number:

```bash
IMESSAGE_HANDLE="+15551234567" npm start
```

### 5. Send yourself a message

Open Messages.app (or iMessage on another device), start a conversation with yourself (your own email/phone), and type a message. Claude's response will appear in the same thread.

## Configuration

All configuration is via environment variables:

| Variable | Required | Default | Description |
|---|---|---|---|
| `IMESSAGE_HANDLE` | **Yes** | — | Your iMessage handle (phone number or email) |
| `CLAUDE_WORKING_DIR` | No | `./workspace` | Working directory for Claude Code |
| `POLL_INTERVAL_MS` | No | `2000` | How often to check for new messages (ms) |
| `SESSION_TIMEOUT_MS` | No | `1800000` (30 min) | Inactivity timeout before starting a new session |
| `RESPONSE_PREFIX` | No | `[Claude] ` | Prefix on bot responses (also used for echo detection) |
| `CLAUDE_TIMEOUT_MS` | No | `300000` (5 min) | Max time to wait for Claude to respond |
| `CLAUDE_MAX_TURNS` | No | `10` | Max agent turns per invocation |
| `CLAUDE_ALLOWED_TOOLS` | No | `Read,Grep,Glob,Bash,Edit,Write` | Comma-separated list of tools Claude can use |
| `LOG_LEVEL` | No | `info` | Logging level (`debug`, `info`, `warn`, `error`) |

## Special commands

Send these as self-messages to control the bot:

| Command | Description |
|---|---|
| `!reset` or `/reset` | Force-reset the conversation session |
| `!status` or `/status` | Show current session info |

## Project structure

```
imessage-claude/
  config.js              — Configuration from environment variables
  index.js               — Entry point: preflight checks, message loop
  src/
    db.js                — Polls chat.db for new self-messages
    message-decoder.js   — Extracts text from chat.db message rows
    claude.js            — Spawns claude CLI and parses responses
    sender.js            — Sends iMessages via AppleScript
    session.js           — Multi-turn session tracking
    logger.js            — Timestamped console logger
  workspace/             — Default working directory for Claude (gitignored)
```

## How echo prevention works

When the bot sends a response via AppleScript, that message also appears in `chat.db` with `is_from_me = 1`. To prevent an infinite loop:

1. **SQL filter**: Only processes messages where `is_from_me = 1` (ignores other people)
2. **Prefix filter**: Skips messages starting with `[Claude] ` (the bot's own responses)
3. **Queue serialization**: Only one Claude invocation runs at a time

## Limitations

- **Polling, not real-time**: Messages are detected within the polling interval (default 2 seconds), not instantly
- **macOS only**: Relies on `chat.db` and AppleScript, both macOS-specific
- **No attachments**: Only processes text messages; images/files are silently skipped
- **Single session**: One conversation session at a time (no concurrent users)
- **AppleScript quirks**: Messages.app must be running; very long messages are chunked

## License

[MIT](LICENSE)
