<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Cloud Agent

Node 22 and npm are already on the image. `npm ci` installs dependencies. The app is Next.js 16 with a local Supabase stack (native runtime, no Docker).

On boot, the environment start script:

- starts Supabase with `SUPABASE_EXPERIMENTAL_STACK=1` and `supabase start --runtime native --eager`
- sets `SUPABASE_AUTH_EMAIL_ENABLE_SIGNUP=true` so email/password login works; `[auth].enable_signup` stays false, so public signup stays off
- writes gitignored `.env.local` (`ALLOWED_USER_EMAIL` is `dev@rahyar.local`; the password is `LOCAL_DEV_PASSWORD`)
- runs `npm run dev` on port 3000

Checks: `npm run lint`, `npm test`. Health: `GET /api/health`. Bale, web push, FRED, GapGPT, and cron stay unused unless those secrets exist.
