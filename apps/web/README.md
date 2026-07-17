# @zarax/web

The production dashboard — the UI customers use to manage their ZaraX voice agents.

## Stack

Next.js 14 (App Router), shadcn/ui + Tailwind CSS, React Query (TanStack Query),
react-hook-form + zod, next-themes (dark/light/system).

## Architecture — why there's a `/api` folder in a frontend app

`apps/gateway` (the intended long-term single entry point for all clients — see
`docs/architecture.md`) doesn't exist yet. Rather than have the browser call
`services/api` directly (which would mean shipping the backend URL and, worse, the raw
JWT to client-side JavaScript — an XSS risk), this app's own Next.js **Route Handlers**
(`src/app/api/**`) act as a thin server-side proxy:

```
Browser → (this app's) /api/agents → services/api's /v1/agents
          ↑ React Query calls this   ↑ Route Handler calls this, using the
            (same-origin, no CORS)     access token from an httpOnly cookie
```

- The browser **never sees the access/refresh tokens** — they live in httpOnly,
  secure cookies (`src/lib/auth-cookies.ts`), set once at login and read only
  server-side.
- Route Handlers do **not** duplicate any business logic — they parse the request,
  forward it to `services/api` via `src/lib/server-api-client.ts` (which also handles
  transparent access-token refresh on a 401), and relay the response. All validation,
  versioning, RBAC, and audit logging still happens in `services/api`.
- When `apps/gateway` ships, migrating is a one-line change: `BACKEND_URL` in
  `.env` moves from pointing at `services/api` to pointing at the gateway. Nothing in
  `src/app/api/**` needs to change, since the gateway is meant to expose the same
  contract.

## Structure

```
src/
├── app/
│   ├── login/page.tsx             # public
│   ├── signup/page.tsx             # public
│   ├── forgot-password/page.tsx    # public
│   ├── reset-password/page.tsx     # public (reads ?token=)
│   ├── verify-email/page.tsx       # public (reads ?token=, auto-submits)
│   ├── (dashboard)/                # everything behind middleware.ts's auth check
│   │   ├── agents/                  # list / new / [id] edit / [id]/versions (rollback)
│   │   └── profile/                 # profile info, change password, active sessions
│   └── api/                         # server-side proxy to services/api (see above)
├── components/
│   ├── ui/                          # shadcn/ui primitives (hand-vendored source, not an npm package)
│   ├── agents/                      # agent-specific components (form, list, version timeline)
│   ├── profile/                     # profile form, change-password form, sessions list
│   ├── organization/                # organization switcher
│   └── layout/                      # sidebar, header
├── hooks/                           # React Query hooks — the only place data-fetching logic lives
├── lib/                             # API clients, cookie helpers, types, cn() utility
└── middleware.ts                    # redirects to /login if no session cookie is present
```

## Design notes

The palette is a deliberate choice, not the shadcn default: a deep signal-teal primary
(an audio/real-time-signal motif, fitting a voice-agent platform) instead of the
ubiquitous indigo/violet "AI SaaS" look — see the comment block at the top of
`src/app/globals.css`. The one place this dashboard spends real visual craft is the
version-history timeline (`src/components/agents/version-history.tsx`); everything else
(forms, tables) stays quiet and disciplined, appropriate for a tool used daily.

## What's intentionally not built yet

- **Real email delivery** — password-reset and email-verification tokens are fully
  real; actual sending isn't wired to a provider yet. See `services/api`'s README
  ("Email delivery — what's real and what isn't"). The dev-mode link is surfaced via
  a toast so the flow is fully testable today.
- **Advanced agent config** (enabled tools, fallback providers, webhook URLs) — the
  form covers the core fields (prompt, provider, model, RAG toggle); the remaining
  `AgentConfig` fields are set via direct API calls until an "advanced settings"
  section is prioritized.

## Local development

```bash
cp .env.example .env
pnpm --filter @zarax/web dev
```

Requires `services/api` running locally (see its own README) at the URL configured in
`BACKEND_URL`.

## Docker

```bash
docker build -f apps/web/Dockerfile -t zarax-web .
```
