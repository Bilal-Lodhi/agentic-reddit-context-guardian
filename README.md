# 🛡️ Context Guardian

**AI-powered Reddit moderation agent.** Detects adversarial toxicity, leetspeak bypasses, and obfuscated hate speech in real time — directly from Devvit's serverless runtime.

Built for the **Reddit Mod Tools & Migrated Apps Hackathon**.

---

## ⚡ How It Works

```
New comment posted
       │
       ▼
Devvit onCommentCreate trigger fires
       │
       ▼
Gemini 2.5 Flash evaluates the comment
  (direct fetch → generativelanguage.googleapis.com)
       │
       ├─ Safe ──────────────────────────────────────────────────► Logged to Redis audit trail
       │
       └─ Violation ──► Reported via Reddit's native report API ─► Logged to Redis audit trail
```

Everything runs inside Devvit's serverless runtime. No external backend. No database server. No Render.

---

## 🧪 150-Adversarial Stress Test

Context Guardian was evaluated against a 150-request concurrent stress harness designed to break moderation detectors:

| Metric | Result |
|---|---|
| **Overall Accuracy** | **98.7%** |
| **HTTP Success Rate** | **100%** (150/150) |
| **False Positives** (safe flagged) | 0 of 50 |
| **False Negatives** (toxic missed) | 0 of 50 |
| **Adversarial Missed** | 2 of 50 |
| **Elapsed Time** | 50.56s |
| **Avg Latency** | 2056ms |

### Payload Categories

| Category | Count | Expected | Missed |
|---|---|---|---|
| Safe conversation | 50 | `violatesRules: false` | 0 |
| Direct toxicity | 50 | `violatesRules: true` | 0 |
| Leetspeak, homoglyphs, token splitting | 50 | `violatesRules: true` | 2 |

---

## 🛠️ Quick Start for Judges

### 1. Install & Build

```bash
git clone https://github.com/Bilal-Lodhi/agentic-reddit-context-guardian.git
cd agentic-reddit-context-guardian
npm install
npm run build
```

### 2. Set Your Gemini API Key

> ⚠️ The setting is named `openrouterApiKey` for legacy reasons but **requires a Google Gemini API key** (free at [aistudio.google.com](https://aistudio.google.com)). Your key is encrypted at rest by Reddit and never exposed to users.

```bash
npx devvit settings set openrouterApiKey YOUR_GEMINI_API_KEY
```

### 3. Playtest on Reddit Sandbox

```bash
npx devvit login
npx devvit playtest
```

Post any comment in the sandbox subreddit — the bot evaluates it instantly.

### 4. View the Audit Log

Open the **"View Audit Log"** menu item from any post, comment, or subreddit page. All evaluated comments are shown in a filterable table with verdicts and reasons.

---

## 📁 Project Structure

```
mod-helper56/
├── devvit.json              # App manifest (settings, permissions, triggers, menus)
├── src/
│   ├── main.tsx             # Devvit app entry point
│   ├── server/
│   │   ├── context-guardian.ts   # Core: onCommentCreate → Gemini → Redis → Report
│   │   ├── routes/
│   │   │   ├── triggers.ts       # Devvit trigger handlers
│   │   │   ├── api.ts            # Audit log API for the frontend
│   │   │   ├── menu.ts           # Subreddit menu actions
│   │   │   └── forms.ts          # Form submissions
│   │   └── index.ts
│   ├── client/
│   │   ├── splah.html            # Inline view (Reddit feed)
│   │   ├── game.html             # Expanded view
│   │   └── audit.tsx             # Audit log viewer (React + Tailwind)
│   └── shared/
│       ├── openrouter-config.ts  # Gemini model config & request builder
│       └── api.ts                # Shared TypeScript types
└── tools/                        # Shared tsconfig files
```

---

## 🔧 Tech Stack

| Layer | Technology |
|---|---|
| Platform | Devvit (Reddit's native app framework) |
| Frontend | React 19, Tailwind CSS 4, Vite |
| API Transport | tRPC v11, Hono |
| AI Model | Google Gemini 2.5 Flash (native API) |
| Audit Storage | Devvit Redis (30-day TTL) |
| Permissions | `generativelanguage.googleapis.com` — globally allowlisted by Devvit |

---

## 📄 License

See [LICENSE](./LICENSE).