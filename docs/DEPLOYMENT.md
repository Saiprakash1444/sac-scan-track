# Deploying SAC Scan & Track to Vercel

Target: **≤ 40 users.** Every service below stays inside a free tier at that scale.

Architecture context is in [`../CONTEXT.md`](../CONTEXT.md). Read §7 (two auth systems)
and §10 (env vars) before starting.

---

## Overview

```
GitHub repo ──▶ Vercel (build + host)
                  │
                  ├──▶ Supabase          Postgres + Auth + RLS   (self-owned, free)
                  ├──▶ Google AI Studio   vision, primary        (free)
                  └──▶ OpenRouter         vision, fallback       (free, optional)
```

Lovable keeps committing to the repo; Vercel deploys from it. The two coexist —
see §6.

---

## Step 1 — Create the Supabase project

1. <https://supabase.com/dashboard> → **New project**
2. Region: pick the one nearest the club (`ap-south-1` for India)
3. Save the database password somewhere safe
4. Wait for provisioning (~2 min)

### Apply the schema

All 11 migrations are in `supabase/migrations/`. Two ways:

**CLI (recommended — reproducible):**

```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-new-project-ref>
supabase db push
```

**Dashboard (no CLI):** SQL Editor → paste each file from `supabase/migrations/`
in **filename order** (they are timestamp-prefixed) → Run. Order matters: later
migrations `ALTER` tables the earlier ones create.

### Enable pg_cron

Database → Extensions → search `pg_cron` → enable.

Then re-run `20260806120000_schedule_return_reminders.sql`. It is guarded: if
pg_cron is missing it prints a notice and skips, so the reminder job silently
would not exist. Verify:

```sql
SELECT jobname, schedule, active FROM cron.job;
-- expect: sac-return-reminders | 30 3 * * * | t
```

> The schedule is `30 3 * * *` UTC = **09:00 IST**. pg_cron is always UTC.

### Configure auth URLs

Authentication → URL Configuration:

- **Site URL:** `https://<your-app>.vercel.app` — one value, no trailing slash, no path
- **Redirect URLs:** one per line —
  ```
  https://<your-app>.vercel.app/**
  https://<vercel-project-name>-*.vercel.app/**
  http://localhost:8080/**
  ```

The dev server is **port 8080**, not Vite's default 5173 — the Lovable preset pins it
with `strictPort: true`.

The middle line covers Vercel **preview deployments**, which get a fresh subdomain per
push (`<project>-git-<branch>-<scope>.vercel.app`). Without it, auth works in production
but breaks on every preview.

⚠️ Skipping this breaks email confirmation links. `auth.tsx` passes
`emailRedirectTo: window.location.origin` on signup, and Supabase rejects any origin not
on this allowlist.

---

## Step 2 — Get the vision API keys

### Primary: Google AI Studio (required)

<https://aistudio.google.com/apikey> → Create API key. No credit card.
Image input is billed **free of charge** on Flash models.

### Fallback: OpenRouter (optional but recommended)

<https://openrouter.ai/keys> → create a key. Free accounts get ~50 requests/day —
plenty as a backstop when Gemini is rate limited.

`openrouter/free` is a *router*, not a fixed model: it auto-selects among
currently-free models filtered by capability, so it survives model deprecations
without a code change.

---

## Step 3 — Deploy to Vercel

1. <https://vercel.com/new> → import the GitHub repo
2. Framework preset should auto-detect **TanStack Start**. Leave build settings alone —
   `vite.config.ts` already pins `nitro: { preset: "vercel" }`, which emits
   `.vercel/output/` in Build Output API v3 format.
3. Add environment variables (Settings → Environment Variables), applying each to
   **Production, Preview and Development**:

| Variable | Value | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | `https://<ref>.supabase.co` | no — public |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon key | no — public |
| `SUPABASE_URL` | same URL | no |
| `SUPABASE_PUBLISHABLE_KEY` | anon key | no |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key | **YES** |
| `SAC_ADMIN_PASSWORD` | long random passphrase | **YES** |
| `ADMIN_SESSION_SECRET` | `openssl rand -base64 32` | **YES** |
| `GEMINI_API_KEY` | AI Studio key | **YES** |
| `AI_FALLBACK_API_KEY` | OpenRouter key | **YES** |
| `AI_FALLBACK_URL` | `https://openrouter.ai/api/v1/chat/completions` | no |
| `AI_FALLBACK_MODEL` | `openrouter/free` | no |
| `AI_FALLBACK_NAME` | `openrouter` | no |

> ⚠️ Anything prefixed `VITE_` is **inlined into the browser bundle** at build time
> and is public by definition. Never prefix a secret with `VITE_`.
>
> ⚠️ `SUPABASE_SERVICE_ROLE_KEY` **bypasses Row Level Security**. It is the single
> most dangerous value here.

4. Deploy.

---

## Step 4 — Bootstrap the first admin

A fresh database has **no admin**. There are two separate things to grant —
they are unrelated (CONTEXT.md §7):

### a) The `/admin` panel

Nothing to do. It is gated by `SAC_ADMIN_PASSWORD`, not by any database role.
Open `https://<your-app>.vercel.app/admin` and enter the password.

### b) The `/dashboard` role + self-approval

1. Sign up normally in the app. You land on **"Waiting for admin approval"** —
   expected: `handle_new_user()` creates every profile as `pending`.
2. Go to `/admin`, unlock, open the **Members** tab, approve yourself.
3. To also get `/dashboard` (which needs the `admin` row in `user_roles`), run this
   once in the Supabase SQL Editor:

```sql
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin' FROM auth.users WHERE email = 'you@example.com'
ON CONFLICT (user_id, role) DO NOTHING;
```

---

## Step 5 — Verify

| Check | Expected |
|---|---|
| `/` loads | landing page |
| Sign up → `/scan` | "Waiting for admin approval" |
| `/admin` + password | unlocks; Members tab lists you |
| After approving yourself | `/scan`, `/find`, `/my-items` all work |
| `/find` | 6 racks, 28 seeded components |
| `/scan` → photo of any part | identifies it |
| Borrow a part | stock decrements; appears in `/my-items` |
| `SELECT * FROM cron.job;` | one active `sac-return-reminders` row |

**If scanning fails**, check Vercel → Deployment → Functions logs for
`[vision] <provider> failed <status>`. The transport logs every provider attempt
before giving up.

---

## ⚠️ Known issue: the "Continue with Google" button

`src/integrations/lovable/index.ts` routes Google sign-in through
**`https://oauth.lovable.app`** — a Lovable-hosted broker tied to Lovable Cloud
projects (verified in the installed `@lovable.dev/cloud-auth-js` bundle).

**On a self-owned Supabase project this button will not work.** Email/password
sign-in is unaffected and works out of the box, so the app is fully usable
without touching this.

To fix it properly, switch to Supabase's native Google OAuth:

1. Google Cloud Console → create an OAuth 2.0 Client ID (Web application)
2. Authorised redirect URI: `https://<ref>.supabase.co/auth/v1/callback`
3. Supabase → Authentication → Providers → Google → paste client ID + secret
4. Patch `src/routes/auth.tsx`:

```ts
// replace the lovable.auth.signInWithOAuth call in handleGoogle()
const { error } = await supabase.auth.signInWithOAuth({
  provider: "google",
  options: { redirectTo: `${window.location.origin}${destination}` },
});
if (error) {
  toast.error("Google sign-in failed. Try email instead.");
  return;
}
// the browser navigates away; nothing after this runs
```

Then `src/integrations/lovable/index.ts` and the `sac.redirect` sessionStorage
dance in `src/routes/index.tsx` become dead code.

**Alternative:** delete the Google button entirely and run email-only. For a
40-person club that is a legitimate simplification.

---

## §6 — Living alongside Lovable

Setting `nitro: { preset: "vercel" }` is safe. Per the preset's own contract:

> *"Inside a Lovable build the preset and output layout are forced to Cloudflare;
> `preset`/`output`/`cloudflare` overrides apply only outside it."*

So Lovable builds Cloudflare, Vercel builds Vercel, from the same committed config.

What **does** break: the Lovable editor preview points at Lovable Cloud's own
Supabase and its injected `LOVABLE_API_KEY`. Once your env vars point at the new
project, previews inside the Lovable editor will read the old empty database.
The vision transport keeps `LOVABLE_API_KEY` as its last-resort provider
specifically so editor previews can still scan.

**Never force-push** (`AGENTS.md`) — it rewrites history on Lovable's side.

---

## Cost at 40 users

| Service | Free tier | Expected usage | Headroom |
|---|---|---|---|
| Vercel Hobby | 100 GB bandwidth/mo | a few hundred MB | very large |
| Supabase Free | 500 MB DB, 50k MAU | < 10 MB, 40 users | very large |
| Google AI Studio | free image input, ~10–30 RPM | a few scans/day | large |
| OpenRouter | ~50 req/day | fallback only | adequate |

⚠️ Supabase pauses free projects after **7 days of inactivity**. During term
breaks someone should open the app, or the first visit after a break will fail
until it resumes.

---

## Local development

```bash
cp .env.example .env    # then fill it in
npm install
npm run dev
```

`.env` is gitignored. If `git status` still shows it as tracked, untrack it once:

```bash
git rm --cached .env
```
