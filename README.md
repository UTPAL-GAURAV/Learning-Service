# Learning-Service

A hosted multi-user learning session backend. Users authenticate with Google, get a JWT, and all their learning data (sessions, Q&A cards, scores, weak areas) is stored per-user in Neon PostgreSQL. Clients call the REST API directly using the JWT.

## Stack

- **Runtime:** Node.js + TypeScript (`ts-node --transpile-only`), deployed as a Render web service
- **Database:** Neon PostgreSQL (`@neondatabase/serverless`)
- **Auth:** Google OAuth 2.0 → JWT (1-year expiry)

## Project structure

```
api/
  auth/google.ts       GET /auth/google
  auth/callback.ts     GET /auth/callback
  me.ts                GET + PUT /api/me
  sessions.ts          GET + POST + PATCH /api/sessions
  weak-areas.ts        GET + POST + DELETE /api/weak-areas
lib/
  db.ts                Neon client
  auth.ts              JWT helpers + Google OAuth
scripts/
  setup.ts             One-time user setup CLI
schema.sql             All 5 tables
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

Each user who wants to connect to this service runs the setup script once:

```bash
npx ts-node scripts/setup.ts
```

The script will:

1. Open Google login in your browser
2. Wait for the OAuth callback on a local port
3. Ask what you're learning for (role / goal / level)
4. Save the JWT token to `~/.learning-service/config.json`

---

## REST API

All `/api/*` routes require `Authorization: Bearer <jwt>`.

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/auth/google` | Redirects to Google OAuth consent screen |
| `GET` | `/auth/callback` | Exchanges code, upserts user, redirects to frontend with `#token=<jwt>` |
| `GET` | `/api/me` | Returns user profile |
| `PUT` | `/api/me` | Updates `role`, `level`, `learningGoal` |
| `GET` | `/api/sessions` | All sessions for the user (with last score + weak area count) |
| `GET` | `/api/sessions/:topicSlug` | Full session data for one topic |
| `POST` | `/api/sessions` | Create a new session |
| `PATCH` | `/api/sessions/:topicSlug` | Partial update of a session |
| `POST` | `/api/sessions/:topicSlug/cards` | Add a Q&A card |
| `PATCH` | `/api/cards/:cardId/attempts` | Record a practice attempt |
| `POST` | `/api/sessions/:topicSlug/scores` | Log a readiness score |
| `GET` | `/api/sessions/:topicSlug/scores` | Score history for one topic |
| `GET` | `/api/weak-areas` | All weak areas (filter by `?topic=slug`) |
| `POST` | `/api/weak-areas` | Add or update a weak area |
| `DELETE` | `/api/weak-areas/:topicSlug/:subTopic` | Remove a weak area |

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string |
| `GOOGLE_CLIENT_ID` | Google OAuth app client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth app client secret |
| `GOOGLE_REDIRECT_URI` | `https://<your-render-url>/auth/callback` |
| `JWT_SECRET` | Random 64-char secret (`node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`) |
| `FRONTEND_URL` | Allowed CORS origin |
