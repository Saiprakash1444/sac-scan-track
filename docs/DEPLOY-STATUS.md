# Deployment status — running log

Live state of the migration off Lovable Cloud onto Vercel + self-owned Supabase.
**Update this file as things change.** Architecture reference: [`../CONTEXT.md`](../CONTEXT.md).
Step-by-step runbook: [`DEPLOYMENT.md`](DEPLOYMENT.md).

Last updated: **2026-08-06**

> 🔐 **No secret values in this file — it is committed.** Real values live in `.env`
> (gitignored) and in Vercel → Settings → Environment Variables.

---

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Database | **New self-owned Supabase project** | Lovable Cloud may not expose the service_role key; a fresh project is free at this scale and fully owned |
| Lovable | **Keep git sync, move services off** | Lovable keeps committing to the club repo; Vercel builds from ours |
| Vision AI | **Gemini primary + generic fallback** | Hugging Face free tier is $0.10/mo *in credits* — would be exhausted in a handful of scans. Gemini bills image input at "free of charge" on Flash models |
| Git remote | **Own repo, club repo kept as `lovable`** | Ownership of the deploy without losing a path back to the club repo |
| That first push | **Left in place** | Commit is authored by Sai, changes are additive, and Lovable force-overrides the build preset in its own builds |

---

## Accounts / resources

| Thing | Value |
|---|---|
| GitHub (ours, `origin`) | `https://github.com/Saiprakash1444/sac-scan-track` |
| GitHub (club, `lovable`) | `https://github.com/Michellemariya/sac-scan-track` |
| Supabase project | `SAC_Management` · ref `ngwmqatnrkuxhszxcjds` · `ap-south-1` (Mumbai) |
| Supabase URL | `https://ngwmqatnrkuxhszxcjds.supabase.co` — note **`.co`**, not `.com` |
| Vercel project | `sac-scan-track`, scope `saiprakash1444s-projects` |
| Vercel production URL | ⏳ **not yet recorded** — Settings → Domains, the one *without* a hash |
| Old Lovable project | `ioadezusvonzohoyepnu` — abandoned |

---

## Progress

### ✅ Done — code (commit `5a07b7d`, pushed to both remotes)

- **Vercel target pinned** — `nitro: { preset: "vercel" }` in `vite.config.ts`.
  Verified: build emits `.vercel/output/` (Build Output API v3, `framework: nitro`).
  Safe alongside Lovable, which force-overrides preset/output back to Cloudflare
  inside its own builds — confirmed in the preset's own type docs.
- **Vision provider chain** — new `src/lib/ai-vision.server.ts`.
  Gemini → generic fallback → Lovable, all OpenAI-compatible `chat/completions`.
  Resolved from env at call time; unset keys skipped, not failed. Fails over on
  non-2xx, empty 200, network error, or 30s timeout. Reports the *worst* failure
  seen so "all rate limited" isn't masked by one 500. Logs
  `[vision] <provider> failed <status>` per attempt.
- **`identify.functions.ts`** now calls it via `await import()` so keys stay server-side.
  Prompt, id whitelist, defensive JSON parsing and field clamps **unchanged**.
- **Reminder cron scheduled** — migration `20260806120000`, daily `30 3 * * *` UTC
  (09:00 IST), plus the two indexes the sweep and `deleteComponent` read.
- **`.env` untracked + gitignored**; `.env.example` documents all 13 vars.
- **`.gitattributes`** added — repo was CRLF, which broke `npm run lint` everywhere.
- **Docs** — `CONTEXT.md`, `docs/DEPLOYMENT.md`, `supabase/ALL_MIGRATIONS.sql`
  (all 11 migrations concatenated for one-paste setup).

**Verified:** `tsc --noEmit` exit 0 · production build succeeds · **zero** occurrences of
`GEMINI_API_KEY`, `SERVICE_ROLE`, `SAC_ADMIN_PASSWORD`, `ADMIN_SESSION_SECRET` or
`node:crypto` across the 26 client JS chunks (leak check confirmed non-vacuous — the
same grep *does* find the public Supabase URL).

### ✅ Done — Supabase

- Project created, Mumbai region
- Migrations applied
- Reached the Authentication step

### ⏳ In progress — Vercel

- Project imported, first deployment built successfully
- ❌ **Deployment Protection is ON** — `sac-scan-track-eiuueg2uw-….vercel.app`
  302s to `vercel.com/sso-api`. Nobody but the Vercel account owner can open it.
  → **Settings → Deployment Protection → Vercel Authentication → Disabled**
- ❌ Production URL not yet identified (Settings → Domains)
- ❓ Function region — defaults to `iad1` (Washington DC) while Supabase is in Mumbai.
  → **Settings → Functions → Region → Mumbai (bom1)**, then redeploy. Every SSR
  render and server function otherwise crosses the Pacific twice per query.

### ⏳ Not started

- [ ] Supabase → Authentication → URL Configuration (needs the real Vercel URL first):
  - **Site URL:** `https://<production>.vercel.app` (no trailing slash, no path)
  - **Redirect URLs:**
    ```
    https://sac-scan-track.vercel.app/**
    https://sac-scan-track-*.vercel.app/**
    http://localhost:8080/**
    ```
    The middle line covers every preview/deployment hash — Supabase's `*` matches
    up to a `.` or `/`, so it spans the hyphenated scope suffix.
- [ ] Verify `cron.job` has an active `sac-return-reminders` row (needs pg_cron enabled)
- [ ] Bootstrap first admin — sign up → `/admin` password → Members → approve self →
      then `INSERT INTO public.user_roles (user_id, role) SELECT id, 'admin' FROM
      auth.users WHERE email = '…' ON CONFLICT DO NOTHING;` for `/dashboard`
- [ ] Smoke test: sign up · approve · find · scan · borrow · return

---

## Gotchas found the hard way

| Thing | Detail |
|---|---|
| **Google sign-in is broken** | `@lovable.dev/cloud-auth-js` calls `https://oauth.lovable.app` — a Lovable-hosted broker tied to Lovable Cloud. Will not work against a self-owned Supabase project. **Email/password is unaffected.** Fix or remove: see `DEPLOYMENT.md`. |
| **Supabase domain is `.co`** | `supabase.com` is the dashboard; `supabase.co` is the API. Copy the Project URL from the dashboard rather than typing it — a wrong char gives a DNS failure that looks like an unrelated runtime bug. |
| **Dev server is port 8080** | Not Vite's default 5173. The Lovable preset pins it with `strictPort: true`. Matters for the localhost redirect entry. |
| **Two lockfiles** | `bun.lock` *and* `package-lock.json`. Vercel picks a package manager from the lockfile, so override **Install Command → `npm install`** for determinism, or delete `bun.lock`. Build was verified with npm. |
| **`npm run lint` fails repo-wide** | ~200 prettier "Delete ␍" errors per file. Pre-existing CRLF checkout, **not** a code defect. Doesn't block Vercel (which runs `vite build`). `.gitattributes` fixes new checkouts; `git add --renormalize .` fixes the existing tree. |
| **`VITE_*` are build-time** | Baked into the JS bundle. Changing them requires a **redeploy**, not a restart. |
| **Deployment URLs ≠ production URL** | `<project>-<hash>-<scope>.vercel.app` changes every push. Never put one in Supabase's Site URL. |
| **Supabase free tier pauses** | After 7 days idle. During term breaks someone should open the app. |

---

## Still open from the original audit

Not blockers for launch — see `CONTEXT.md` §9 for the full list.

- 🔴 `adminForceReturn` duplicates `return_component` in TypeScript with four
  **un-locked** queries → logic drift + a check-then-act race on `quantity_available`
- 🔴 Zero tests
- 🟠 Single shared admin password grants service-role access; no rate limit on `unlockAdmin`
- 🟡 Raw Postgres error text reaches the browser
- 🟡 No rate limit on `identifyComponent` — one member can drain the AI quota
- 🟡 `sitemap[.]xml.ts` has `BASE_URL = ""` → emits invalid relative `<loc>`
- ⚪ PWA has no service worker despite the offline banner implying otherwise
- ⚪ `README.md` is still a raw paste of the original chat prompt

---

## Session notes

- Vercel MCP was connected mid-session but **not visible** to it — MCP servers are
  picked up at session start. Restart Claude Code to use it.
- Corrections made in-flight: dev port is 8080 not 5173; the value shown in Supabase
  Settings → General is the Project **ID**, and the URL is that ID + `.supabase.co`.
