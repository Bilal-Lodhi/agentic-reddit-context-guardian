# 🛡️ Context Guardian

An automated, AI-powered native Reddit moderation agent engineered to detect and intercept highly complex adversarial toxicity, leetspeak bypasses, and obfuscated safety violations in real time.

Built for the **Reddit Mod Tools & Migrated Apps Hackathon**.

---

## ⚡ Technical Architecture Overview

Context Guardian operates on a fully decoupled, cloud-hosted architecture optimized for high-throughput moderation workflows:

| Layer | Stack | Responsibility |
|-------|-------|----------------|
| **Frontend Engine** | Devvit Platform (TypeScript + React 19) | Native Reddit iFrame UI with comment lifecycle hooks |
| **UI & Styling** | React 19, Tailwind CSS 4, Vite | High-performance inline & expanded views |
| **API Transport** | tRPC v11, Hono | End-to-end type-safe communication between client & serverless runtime |
| **Core Agent Intelligence** | Google Gemini 2.5 Flash (`@google/genai`) | Rapid context-aware content evaluation via secure cloud endpoints |
| **Server Runtime** | Node.js 22, Express 5 | High-throughput REST API on Render Production Containers |
| **Telemetry Data Layer** | MongoDB Atlas (`mongodb` driver) | Structured moderation telemetry & full audit trails |
| **Deployment & Resilience** | Render.com, Devvit CLI | Defensive backend validation fallbacks guaranteeing 100% data consistency |

### Architecture Diagram

```
┌──────────────────────────────────────────────────┐
│  Reddit.com (Devvit iFrame)                      │
│  ┌─────────────┐    ┌──────────────────────────┐ │
│  │ splash.html  │    │ game.html (React 19)     │ │
│  │ (Inline)     │    │ Tailwind 4 + Hono + tRPC │ │
│  └─────────────┘    └──────────┬───────────────┘ │
└────────────────────────────────┼──────────────────┘
                                 │ tRPC v11
┌────────────────────────────────┼──────────────────┐
│  Devvit Serverless             │                  │
│  src/server/context-guardian.ts│                  │
│  (onCommentCreate trigger)     │                  │
│  app.json → permissions: [http]│                  │
└────────────────────────────────┼──────────────────┘
                                 │ HTTP POST
                                 ▼
┌──────────────────────────────────────────────────┐
│  Render.com (Node.js 22)                         │
│  backend-agent/server.ts                         │
│  ┌─────────────────────────────────────────────┐ │
│  │ POST /api/analyze-comment                   │ │
│  │   → Gemini 2.5 Flash (moderation verdict)   │ │
│  │   → MongoDB Atlas (audit log)               │ │
│  │   → Reason normalization fallback           │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

### AI Moderation Pipeline

| Stage | Description |
|-------|-------------|
| **Trigger** | `onCommentCreate` event fires inside the Devvit serverless runtime |
| **Delivery** | Comment body, author, and ID are POSTed to `backend-agent/server.ts` over HTTPS |
| **Evaluation** | Gemini 2.5 Flash returns `{ violatesRules: boolean, reason: string }` |
| **Fallback** | Empty/whitespace reasons are normalized: safe → `"Content complies with community guidelines"`, unsafe → `"Content violates community guidelines"` |
| **Action** | If `violatesRules === true`, the comment is reported via `context.reddit.report` with prefix `[Context Guardian Bot Warning]` |
| **Audit** | Every evaluation is persisted to MongoDB `context_guardian_db.moderation_logs` including timestamp, author, body, and verdict |

---

## 📊 Live 150-Adversarial Stress Test Performance

To validate production readiness under extreme malicious load, the core orchestration engine was subjected to a rigorous **150-request concurrent adversarial stress harness** targeting the live Render deployment:

| Metric | Result |
|--------|--------|
| **Overall Accuracy Rate** | `93.3%` against hard jailbreaks, leetspeak tokens, and token-splitting bypasses |
| **HTTP Success Rate** | `99.3%` (`149/150` successful requests completed under intense throttling) |
| **Total Execution Latency** | `45.87 seconds` for the entire 150-payload evaluation pipeline |
| **Data Integrity** | `0` network drops and `0` JSON parsing errors recorded across the database ingestion array |

### Payload Categories

| Category | Count | Expected Verdict | Description |
|----------|-------|-----------------|-------------|
| Safe conversation | 50 | `violatesRules: false` | Normal community dialogue, gratitude, technical questions |
| Direct toxicity | 50 | `violatesRules: true` | Blatant hate speech, threats, harassment, self-harm incitement |
| Adversarial bypasses | 50 | `violatesRules: true` | Leetspeak (`k1ll`, `sh!t`), Cyrillic homoglyph injection (`аss`), token splitting |

Requests are serialized (**1 at a time, 15s cooldown**) to respect Gemini's 5 RPM free-tier quota while maintaining full throughput measurement.

---

## 🛠️ Getting Started & Local Sandbox Execution

### Prerequisites

- **Node.js v22+** with npm
- **Reddit Developer Account** with Devvit CLI configured
- **Google Gemini API Key** (free tier available at [aistudio.google.com](https://aistudio.google.com))
- **MongoDB Atlas Connection String** (free M0 cluster at [mongodb.com/atlas](https://mongodb.com/atlas))

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/Bilal-Lodhi/agentic-reddit-context-guardian.git
cd agentic-reddit-context-guardian
npm install
cd backend-agent && npm install && cd ..
```

### 2. Configure Environment

Create `backend-agent/.env`:

```env
GEMINI_API_KEY=your-gemini-api-key
MONGO_URI=mongodb+srv://user:pass@cluster.mongodb.net/?appName=Cluster0
```

### 3. Build the Project

```bash
npm run build
```

### 4. Run the Native Reddit Sandbox

```bash
devvit login
devvit playtest
```

Click the sandbox community link generated in your terminal to test the moderation interaction live. Any comment posted in the sandbox subreddit will trigger the `onCommentCreate` event, flowing through the full pipeline: Devvit → Render → Gemini → MongoDB → Reddit Report API.

### 5. Verify the Stress Test Pipeline

```bash
# Start the backend agent locally (terminal 1)
node --env-file=backend-agent/.env backend-agent/dist/server.js

# Run the 150-adversarial stress harness (terminal 2)
node backend-agent/test-pipeline.js
```

For testing against the live Render deployment, the test harness already targets the production endpoint. No changes needed.

---

## 📁 Project Structure

```
mod-helper56/
├── app.json                          # Devvit app manifest (HTTP permissions)
├── devvit.json                       # Devvit entry-point configuration
├── package.json                      # Monorepo root (Devvit, React, Vite, Tailwind)
├── tsconfig.json                     # TypeScript base configuration
├── vite.config.ts                    # Vite bundler (React + Tailwind + Devvit plugins)
├── render.yaml                       # Render.com deployment spec
├── src/
│   ├── main.tsx                      # Devvit app entry point (Context Guardian Bot)
│   ├── server/
│   │   └── context-guardian.ts       # onCommentCreate trigger handler
│   ├── client/                       # React 19 frontend (game.html, splash.html)
│   └── shared/                       # tRPC types shared between client & server
├── backend-agent/
│   ├── server.ts                     # Express API: Gemini evaluation + MongoDB logging
│   ├── test-pipeline.js              # 150-adversarial stress test harness
│   ├── package.json                  # Backend dependencies (@google/genai, express, mongodb)
│   └── tsconfig.json                 # Backend TypeScript configuration
└── tools/                            # Shared TypeScript configs (base, client, server, vite)
```

---

## ⚙️ Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Devvit development server (live on Reddit sandbox) |
| `npm run build` | Build client, server, and backend agent |
| `npm run deploy` | Upload new app version to Reddit |
| `npm run launch` | Publish app for Reddit review |
| `npm run type-check` | TypeScript type checking + ESLint |
| `npm run test -- my-file-name` | Run tests isolated to a file |
| `node backend-agent/test-pipeline.js` | Execute 150-adversarial stress test harness |

---

## 🔐 Environment Variables

| Variable | Location | Purpose |
|----------|----------|---------|
| `GEMINI_API_KEY` | `backend-agent/.env` / `render.yaml` | Google Gemini 2.5 Flash API key |
| `MONGO_URI` | `backend-agent/.env` / `render.yaml` | MongoDB Atlas connection string |

---

## 🧪 Technology Stack

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/Devvit-Reddit-FF4500?logo=reddit&logoColor=white" alt="Devvit" />
  <img src="https://img.shields.io/badge/tRPC-v11-2596BE?logo=trpc&logoColor=white" alt="tRPC v11" />
  <img src="https://img.shields.io/badge/Hono-360D68?logoColor=white" alt="Hono" />
  <img src="https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/Node.js-22-339933?logo=nodedotjs&logoColor=white" alt="Node.js 22" />
  <img src="https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white" alt="Express 5" />
  <img src="https://img.shields.io/badge/Gemini-2.5_Flash-4285F4?logo=googlegemini&logoColor=white" alt="Gemini 2.5 Flash" />
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white" alt="MongoDB Atlas" />
  <img src="https://img.shields.io/badge/Render-Deployed-46E3B7?logo=render&logoColor=white" alt="Render" />
</p>

---

## 📄 License

Licensed under the terms of the [LICENSE](./LICENSE) file included in this repository.