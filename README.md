# Learning-Service

A hosted multi-user learning session backend. Users authenticate with Google, get a JWT, and all their learning data (sessions, Q&A cards, scores, weak areas) is stored per-user in Neon PostgreSQL. Claude (VS Code extension) connects to the `/mcp` endpoint and uses MCP tools to read and write learning data instead of touching local files.

## Stack

- **Runtime:** Node.js + TypeScript (`ts-node --transpile-only`), deployed as a Render web service
- **Database:** Neon PostgreSQL (`@neondatabase/serverless`)
- **Auth:** Google OAuth 2.0 → JWT (1-year expiry)
- **MCP transport:** Streamable HTTP at `/mcp`

## Project structure

```
api/
  auth/google.ts       GET /auth/google
  auth/callback.ts     GET /auth/callback
  me.ts                GET + PUT /api/me
  mcp.ts               POST /mcp  (all MCP tools)
lib/
  db.ts                Neon client
  auth.ts              JWT helpers + Google OAuth
  tools/               One file per MCP tool
scripts/
  setup.ts             One-time user setup CLI
schema.sql             All 5 tables
vercel.json            Route config
.env.example           Required env var names
```

## Prerequisites

- [Node.js 20+](https://nodejs.org)
- A [Neon](https://neon.tech) project
- A [Google Cloud OAuth 2.0](https://console.cloud.google.com) app (Web application type)

---

## Deployment (Render)

### 1. Create the database schema

```bash
psql "$DATABASE_URL" -f schema.sql
```

### 2. Configure Google OAuth

In [Google Cloud Console](https://console.cloud.google.com):

1. Create a project → APIs & Services → Credentials → Create OAuth 2.0 Client ID
2. Application type: **Web application**
3. Authorized redirect URI: `https://<your-render-url>/auth/callback`
4. Note down the **Client ID** and **Client Secret**

### 3. Deploy to Render

1. Create a new **Web Service** on [render.com](https://render.com)
2. Connect your GitHub repo
3. Set these settings:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Add environment variables (see table below)
5. Click **Deploy**

---

## Local development

```bash
npm install
cp .env.example .env  # fill in values
npm run dev
```

---

## User setup (run once per user)

Each user who wants to connect Claude to this service runs the setup script once:

```bash
LEARNING_MCP_URL=https://<your-vercel-url>/mcp npx ts-node scripts/setup.ts
```

The script will:

1. Open Google login in your browser
2. Wait for the OAuth callback on `localhost:9876`
3. Ask what you're learning for (role / goal)
4. Ask your level (`beginner` / `intermediate` / `senior`)
5. Write to `.env` in the current directory:
   ```
   LEARNING_TOKEN=<jwt>
   LEARNING_MCP_URL=https://<your-vercel-url>/mcp
   ```
6. Merge into `~/.claude/settings.json`:
   ```json
   {
     "mcpServers": {
       "learning": {
         "url": "https://<your-vercel-url>/mcp",
         "headers": { "Authorization": "Bearer <jwt>" }
       }
     }
   }
   ```

After setup, open VS Code, start a new Claude session, and say:

> **Start a learning session on [your topic]**

---

## REST API

All `/api/*` routes require `Authorization: Bearer <jwt>`.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/auth/google` | Redirects to Google OAuth consent screen |
| `GET` | `/auth/callback` | Exchanges code, upserts user, redirects with JWT |
| `GET` | `/api/me` | Returns user profile |
| `PUT` | `/api/me` | Updates `role`, `level`, `learningGoal` |

---

## MCP tools

All tool calls require `Authorization: Bearer <jwt>`. The server extracts `userId` from the JWT before every DB operation.

| Tool | Description |
|------|-------------|
| `get_user_context` | User profile + all active sessions summary |
| `get_session(topic_slug)` | Full session data; returns `null` if not found |
| `create_session(topic_slug, topic_name, syllabus_topics[])` | Create a new session |
| `update_session(topic_slug, patch)` | Partial update: notes, score, topics, concepts |
| `add_qa_card(topic_slug, card)` | Add a Q&A card to a session |
| `update_qa_attempts(card_id, attempt)` | Record a practice attempt |
| `record_score(topic_slug, score, note?)` | Log a readiness score |
| `get_score_history(topic_slug?)` | Score history for one or all topics |
| `get_weak_areas(topic_slug?)` | Weak areas for one or all topics |
| `upsert_weak_area(topic_slug, sub_topic, description)` | Add or update a weak area |
| `remove_weak_area(topic_slug, sub_topic)` | Remove a resolved weak area |

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth app client secret |
| `GOOGLE_REDIRECT_URI` | `https://<your-vercel-url>/auth/callback` |
| `JWT_SECRET` | Random 64-char secret (`openssl rand -hex 32`) |
