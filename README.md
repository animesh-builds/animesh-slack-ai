# animesh-slack-ai

A personal Slack AI assistant powered by [Groq](https://console.groq.com) (Llama 3.3 70B). Responds to mentions and DMs, retrieves relevant context via TF-IDF over a local knowledge base, and persists memory across sessions.

---

## Features

- **AI responses** — mention the bot or DM it, get context-aware answers
- **Thread context** — multi-turn conversations within Slack threads
- **Persistent memory** — save learnings to a local file, available instantly in future queries
- **Knowledge base** — curated domain knowledge indexed at startup via TF-IDF
- **Save allowlist** — only you can write to memory; everyone else gets answers, not saves
- **Channel allowlist** — restrict bot to specific channels
- **Privacy hardened** — hard rules block PII disclosure, jailbreak attempts, and knowledge base exposure

---

## Stack

| Layer | Tech |
|---|---|
| Slack | `@slack/bolt` v3 — Socket Mode (no public URL needed) |
| AI | Groq API — `llama-3.3-70b-versatile` (free tier) |
| Retrieval | TF-IDF via `natural` over `data/knowledge.md` |
| Memory | Append-only `data/learnings.md` |
| Health check | Express `GET /` |
| Runtime | Node.js 18+ |

---

## Project Structure

```
src/
  app.js          → Main bot: Slack listeners, save handling, AI calls
  embeddings.js   → TF-IDF index builder and retrieval
  knowledge.js    → Assembles system prompt + knowledge chunks + learnings
  learnings.js    → Read/write learnings.md and knowledge.md
data/
  system-prompt.md  → Bot persona and hard rules
  knowledge.md      → Curated knowledge base (indexed at startup)
  learnings.md      → Runtime learnings (auto-created, gitignored)
.env.example        → All required env vars
```

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/animesh-builds/animesh-slack-ai.git
cd animesh-slack-ai
npm install
```

### 2. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → From scratch
2. **Socket Mode** → Enable → Generate App-Level Token with scope `connections:write` → copy as `SLACK_APP_TOKEN`
3. **OAuth & Permissions** → Bot Token Scopes — add:
   - `app_mentions:read`
   - `chat:write`
   - `channels:history`
   - `groups:history`
   - `im:history`
   - `im:read`
   - `im:write`
4. **Event Subscriptions** → Subscribe to bot events:
   - `app_mention`
   - `message.im`
5. **Install to Workspace** → copy `SLACK_BOT_TOKEN`
6. **Basic Information** → App Credentials → copy `SLACK_SIGNING_SECRET`

### 3. Get a Groq API key

Sign up at [console.groq.com](https://console.groq.com) → API Keys → Create key. Free tier gives 14,400 requests/day.

### 4. Configure environment

```bash
cp .env.example .env
```

Fill in `.env`:

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...
GROQ_API_KEY=gsk_...
AUTHOR_SLACK_USER_ID=U...       # Your Slack member ID
AUTHOR_NAME=Animesh
ALLOWED_CHANNEL_IDS=            # Comma-separated channel IDs, empty = all channels
ALLOWED_SAVER_IDS=U...          # Your Slack member ID (who can save to memory)
PORT=3000
```

**Finding your Slack member ID:** Click your profile → three dots → Copy Member ID (`U...`)
**Finding channel IDs:** Right-click channel → View channel details → scroll to bottom

### 5. Run

```bash
npm start          # production
npm run dev        # development (auto-restarts on file changes, Node 18+)
```

Expected output:
```
[app] Allowed savers: U07XXXXXXX
[embeddings] Indexed N sections from knowledge.md
[slack] AnimeshAI bot is running in Socket Mode ⚡
[http] Health check server on port 3000
```

### 6. Invite the bot to a channel

```
/invite @AnimeshAI
```

---

## Usage

### Ask anything
```
@AnimeshAI what's the dunning retry schedule?
@AnimeshAI explain proration for mid-cycle upgrades
```

### Save a learning (you only)
Saves instantly — available in the next query, no restart needed.
```
@AnimeshAI save this: PSR target is 95%+ for UPI flows
@AnimeshAI remember this: Razorpay settlement is T+1 for most merchants
```

### Save full thread context (you only)
Run inside any thread — saves the entire conversation + your note.
```
@AnimeshAI save this: key decision on dunning flow
```

### Save to knowledge base (requires restart to re-index)
```
@AnimeshAI knowledge: # Refund Policy\nCard refunds within 5 business days per RBI mandate
```

---

## Memory Files

| File | Purpose | Restart needed? |
|---|---|---|
| `data/learnings.md` | Quick captures, runtime facts | No — read fresh every query |
| `data/knowledge.md` | Curated domain knowledge | Yes — TF-IDF indexed at startup |

`data/learnings.md` is gitignored — it stays local and accumulates over time.

---

## Corporate Network / SSL Issues

If you're behind a corporate proxy, set in `.env`:

```
NODE_TLS_REJECT_UNAUTHORIZED=0
```

---

## Deploy to Railway (optional)

1. Push to GitHub
2. [railway.app](https://railway.app) → New Project → Deploy from GitHub repo
3. Add all env vars from `.env` in Railway dashboard
4. Add Volume → mount path `/app/data` (learnings persist across deploys)
5. Deploy → check logs for `running ⚡`
6. Kill local bot

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Bot not responding | `/invite @AnimeshAI` in the channel |
| SSL errors | Add `NODE_TLS_REJECT_UNAUTHORIZED=0` to `.env` |
| Save command ignored | Check `ALLOWED_SAVER_IDS` matches your exact Slack member ID |
| Knowledge save not showing | Restart bot after saving to re-index |
| Bot responds in wrong channels | Check `ALLOWED_CHANNEL_IDS` — must be channel IDs not names |
| "Invalid credentials" on start | Verify all 4 required tokens in `.env` are filled |
