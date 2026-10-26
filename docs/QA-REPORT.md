# QA, security and database-integrity audit

**Run:** 2026-10-26 · **Commit:** `49a36e4` + this change (uncommitted) ·
**Production:** https://sac-scan-track.vercel.app, Supabase `SAC_Management` (`ngwmqa…`, ap-south-1)

## 0. Bottom line

- **Nothing was written to production.** Production was touched only by page loads, `GET`s, and
  `SELECT`s on schema metadata and aggregate counts (section 2.3).
- **The live inventory is consistent today.** Every invariant I could check read-only holds
  (section 4).
- **Three P1 database-permission defects.** Any signed-in member can bypass the borrowing rules by
  writing to `borrow_records` directly. Anyone on the internet can request an account and then
  read every member's email, roll number and phone. The proof is the live policy and permission
  definitions. These were **not exploited**, because that would have meant writing to production.
- **All state-changing tests are BLOCKED.** The only Supabase project is production, `.env` on
  localhost also points at production, and Docker isn't installed, so a local Supabase isn't
  possible either. The full database suite (19 tests, including concurrency and the three P1
  regressions) is written and refuses to run until an isolated test project exists (section 6).

| Suite | Result |
|---|---|
| Typecheck (`tsc --noEmit`) | ✅ pass |
| Unit (Vitest, 5 files) | ✅ 39 / 39 pass (1 expected-fail documents QA-006) |
| Production smoke (Playwright, read-only) | ✅ 22 / 22 pass (desktop + Pixel 7) |
| Database / RLS / concurrency (Vitest, 19 tests) | ⛔ **BLOCKED**: no isolated database |
| Signed-in E2E flows | ⛔ **BLOCKED**: same reason |
| Lint | ⚠️ 5,141 CRLF line-ending errors + ~500 other Prettier formatting errors (pre-existing), 0 real code issues |
| Production build (`vite build`) | ✅ pass |

---

## 1. Repository state

- Branch `main` = `origin/main` at `49a36e4`. `lovable/main` has diverged (19 commits not here,
  12 here not there).
- Pre-existing uncommitted edit to `docs/DEPLOY-STATUS.md`: preserved and not touched.
- Before this run there were no tests, no test runner and no CI.
- Two lockfiles. This change updates `package-lock.json` only, so `bun.lock` is now stale for the
  new dev dependencies.

## 2. Environment isolation

| Environment | Classification | Evidence |
|---|---|---|
| `https://sac-scan-track.vercel.app` | **Production** | DEPLOY-STATUS.md, Vercel deployment list |
| `http://localhost:8080` | **Production DB** | `.env` `SUPABASE_URL`/`VITE_SUPABASE_URL` = project ref `ngwmqa…`, the production project |
| Supabase projects reachable | **Production only** | Supabase MCP `list_projects` → one project, `SAC_Management` |
| Local Supabase | **Unavailable** | `docker` not installed |

> ⚠️ **QA-013 (P2, process risk):** the dev server on `localhost` reads and writes the
> production database. Anything clicked while signed in locally (borrow, count, approve) changes
> real data. Give local development its own Supabase project.

### 2.3 What was done against production (all read-only)

- Page loads and `GET`s from the Playwright smoke suite (no sign-in, no form submissions).
- `GET /api/cron/daily` without and with a wrong bearer token, expecting refusal (it refuses
  before doing any work).
- `SELECT`s on `pg_proc`, `pg_policies`, `information_schema`, `cron.job` and aggregate counts.
  No personal data was selected. The only data read was schema column names and counts.
- Supabase security advisors.

## 3. Defects

Status key: **Confirmed** = proven by evidence · **Found+fixed** = fixed in this change ·
**Suspected** = reasoned from code, not reproduced.

### QA-001 · P1 · Members can rewrite their own loan rows directly · Confirmed (static)

- **Where:** production RLS policy `borrow_records :: "borrow update own or admin"`
  (`USING`/`WITH CHECK auth.uid() = user_id`). Role `authenticated` holds `UPDATE` on
  `borrow_records`, and no trigger guards the table.
- **Reproduction (test DB only):** a signed-in member sends
  `PATCH /rest/v1/borrow_records?id=eq.<own loan>` with the public anon key and their JWT. The
  body can be any of:
  - `{"due_at":"2099-01-01","extended_count":0}`: unlimited extensions, never overdue
  - `{"returned_at":"<now>"}`: loan disappears without stock coming back, so the parts stay out
    with no record
  - `{"quantity":1}` then `return_component`: 3 of 4 units vanish from stock
  - `{"component_id":"<other part>"}` then `return_component`: inflates another part's available
    stock
- **Expected:** members change loans only through `borrow_component` / `return_component` /
  `extend_borrow`.
- **Database impact:** breaks invariants 4, 5, 9, 12 and `total = available + out`.
- **Regression test:** `tests/db/inventory.db.test.ts` › *QA-001*.

### QA-002 · P1 · Members can insert loans that never took stock · Confirmed (static)

- **Where:** policy `borrow_records :: "borrow insert own"` (`WITH CHECK auth.uid() = user_id`,
  no `is_approved`) plus the `INSERT` grant.
- **Reproduction (test DB only):** insert `{component_id, user_id: self, quantity: N, due_at}`,
  then call `return_component` on it.
  - Non-damaged return: `available = LEAST(total, available + N)`. Available jumps back up to the
    total while real units are still out, so others can borrow parts that aren't on the shelf.
  - Damaged return: `total -= N` with `available` unchanged, so `available > total` and real
    stock is written off.
  - Works for **pending** members too (the policy doesn't check approval).
- **Regression test:** *QA-002*.

### QA-003 · P1 · Every member's contact details are readable by anyone who requests an account · Confirmed (static)

- **Where:** policy `profiles :: "profiles readable by signed in"` = `USING (true)` for
  `authenticated`. `profiles` holds `full_name, email, roll_number, phone`. The public
  "Request an account" form (`auth.tsx:176`) creates a pending account and **signs it in
  immediately**.
- **Reproduction (test DB only):** request an account, then call
  `GET /rest/v1/profiles?select=email,phone,roll_number` with the pending session. Every member
  is returned.
- **Impact:** personal data of all 26 profiles is exposed to any internet visitor.
- **Regression test:** *QA-003*.

#### Proposed fix for QA-001/002/003 (not applied; needs your approval)

No app code depends on these permissions. Members never write `borrow_records` directly, and they
read other profiles only through the admin role (`getBorrowLog`, `admin.server.ts`).

```sql
-- Loans change only through the SECURITY DEFINER functions.
DROP POLICY IF EXISTS "borrow insert own" ON public.borrow_records;
DROP POLICY IF EXISTS "borrow update own or admin" ON public.borrow_records;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.borrow_records FROM anon, authenticated;

-- Profiles: your own row, or everything if you hold the admin role.
DROP POLICY IF EXISTS "profiles readable by signed in" ON public.profiles;
CREATE POLICY "profiles read own or admin" ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR public.has_role(auth.uid(), 'admin'));

-- anon has no policies, but drop the default table grants anyway (defence in depth).
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
```

Run the DB suite against a test project with this applied: the QA-001/002/003 tests should turn
green and nothing else should change.

### QA-004 · P2 · Admin force-return is an unlocked read-modify-write · Suspected (code)

- **Where:** `src/lib/admin.server.ts` `adminForceReturn` (about lines 207–252). It reads the loan,
  updates it, reads the component, then writes `available = min(total, read + qty)` as four
  separate un-locked statements.
- **Failure scenarios:**
  - A member borrows between the admin's read and write, so the member's decrement is
    overwritten (lost update) and stock is inflated.
  - Two admins (or a double-click) force-return at once: both see `returned_at IS NULL`, so stock
    is restored twice (capped at the total).
- **Fix:** call `return_component` logic from SQL. For example, add an admin-only
  `admin_return_component(_record_id, _damaged, _note)` SECURITY DEFINER function with the same
  `FOR UPDATE` lock, granted to `service_role` only.
- **Test:** BLOCKED (needs the test DB; the admin path uses the service role and a race harness).

### QA-005 · P2 · Admin panel: one shared password, no attempt limit · Suspected (code)

`unlockAdmin` compares one shared secret and has no lockout or rate limit. The unlocked session
uses the **service role**, which bypasses RLS. Nothing records which admin did what
(`approved_by = "admin-panel"`). Not tested: brute-forcing production is prohibited.

### QA-006 · P3 · CSV exports allow spreadsheet formula injection · Confirmed (unit)

`src/lib/csv.ts` writes member-typed text (part names, request reasons, project names) verbatim.
A value like `=HYPERLINK(...)` runs as a formula when an admin opens the export in Excel.
**Fix:** prefix values starting with `= + - @ \t \r` with `'`.
**Test:** `tests/unit/csv.test.ts` (an `it.fails` marks it until fixed).

### QA-007 · P3 · AI identify crashed on a bare `null` / non-object reply · Found+fixed

If the model replied with valid JSON that isn't an object (`null`, `7`, `[...]`), the handler
read `.id` on it and threw a `TypeError`, so the member saw a server error instead of
"Unrecognised part". The parser now lives in `src/lib/identify-reply.ts` with a type guard. Its
behaviour is otherwise unchanged: the id whitelist and string clamps are identical.
**Test:** `tests/unit/identify-reply.test.ts` (12 cases, including invented ids).

### QA-008 · P3 · Account requests and AI scans have no per-user/IP rate limit · Confirmed (code)

- `requestAccount` has a honeypot and a global cap on pending requests (`MAX_PENDING_REQUESTS`).
  A script can fill that cap and block real applicants until an admin clears the queue.
- `identifyComponent` has no per-member limit, so one member can drain the AI quota.

### Informational

| ID | Item |
|---|---|
| QA-009 | `borrow_component` SQL has no upper bound on quantity (Zod caps at 100 in the server function). Calling the RPC directly can borrow any amount up to stock. Not harmful, but the two layers disagree. |
| QA-010 | Supabase advisor: **leaked-password protection is disabled** (Auth settings). [Docs](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) |
| QA-011 | No service worker, so no offline support. Verified by the smoke test. The scan page's offline banner implies otherwise. |
| QA-012 | `/api/cron/daily` says "see vercel.json", but there is no `vercel.json`, so Vercel's cron is not scheduled. Reminders still run: production `cron.job` has `sac-return-reminders` · `30 3 * * *` · **active** (verified). |
| QA-014 | Supabase advisor lists 7 SECURITY DEFINER functions callable by `authenticated`. Reviewed: all are the intended member API and each checks `auth.uid()` / approval / ownership. `has_role`/`is_approved` can be called for any user id, which reveals whether someone is an admin or approved (minor). |
| — | A secret-scan false alarm was investigated: `sb_secret_` appears 6× in the client bundle, but only as supabase-js's bare prefix check (0 key characters follow). **No secret is exposed.** |

## 4. Production integrity snapshot (read-only, 2026-10-26)

| Check | Result |
|---|---|
| Components | 252 |
| `quantity_available < 0` | 0 ✅ |
| `quantity_available > quantity_total` | 0 ✅ |
| `quantity_total < 0` | 0 ✅ |
| Counted, borrowable parts where `total ≠ available + open loans` | 0 ✅ |
| Open loans | 18 |
| Loans with quantity ≤ 0 / on non-borrowable parts / extended > 3 / returned before borrowed | 0 / 0 / 0 / 0 ✅ |
| Project loans without a project name | 0 ✅ |
| Duplicate QR codes | 0 ✅ |
| Parts still `count_pending` | 170 (stock-take in progress; `member_counting = open`) |
| Profiles | 24 approved, 2 rejected |
| RLS enabled | all 11 public tables ✅ |
| SECURITY DEFINER functions with `search_path` pinned, owned by `postgres` | 11 / 11 ✅ |
| Functions executable by `anon` or `PUBLIC` | 0 ✅ |
| `resolve_damage_report`, `generate_return_reminders` executable by members | no ✅ (service_role only) |

These are counts at one moment. They show no corruption **so far**; they do not show that
corruption can't happen (see QA-001/002).

## 5. Security posture verified

✅ CSRF middleware registered · ✅ protected routes redirect signed-out users (6 routes) ·
✅ `/admin` shows no data before unlock · ✅ cron endpoint refuses missing or wrong tokens ·
✅ no server secrets in the client bundle (checked env names, service-role JWT pattern, secret-key
pattern) · ✅ AI hallucination firewall drops invented, non-string and array ids ·
✅ `guard_profile_approval` blocks self-approval · ✅ member-callable functions check ownership.

## 6. Blocked: what's needed to run the rest

The minimum to unblock every state-changing test:

1. **Create a second Supabase project** (free tier), e.g. `SAC_Test`.
2. Apply `supabase/migrations/*` to it in order. Don't copy production data.
3. In the **test** project only, run:
   `create table public.qa_sentinel (kind text primary key); insert into public.qa_sentinel values ('isolated-test');`
4. Copy `.env.test.example` to `.env.test` and fill in the test project's URL and keys.
5. Run `npm run test:db`.

The suite's guard (`tests/db/guard.ts`) refuses to run if:
- any variable is missing
- the confirm flag isn't set
- the URL is a known production ref
- the URL equals the app's `.env` database
- the sentinel row is missing

This was verified: it blocked with no variables, and it blocked the production ref even with the
confirm flag set.

**Written and waiting (19 tests):**
- borrow decrements exactly once
- over-borrow leaves no partial state
- quantity 0 / −1 and days 0 / 91 rejected
- pending members blocked
- shared bins blocked
- project name required
- **two members racing for the last unit → exactly one wins**
- **4 × 2 units against 5 → never negative and conserved**
- **the same loan returned 3× (2 concurrently) → restored once**
- damaged return writes off the total
- cross-user return/extend refused
- 3-extension limit
- damage report never moves stock; a write-off applies once; members can't resolve
- QA-001 / QA-002 / QA-003 regressions

**Not yet written** (next, once a test DB exists):
- stock-count open/locked and concurrent counts
- member additions (direct/approval)
- part-request transitions
- the admin panel suite (needs a test deployment with its own admin password)
- reminder sweep and time zones
- CSV export authorization
- signed-in Playwright flows
- the QA-004 race harness

## 7. Changes made in this run

| File | Why |
|---|---|
| `src/lib/identify-reply.ts` (new), `src/lib/identify.functions.ts` | Parser extracted for testing; QA-007 guard |
| `tests/unit/*` | 39 unit tests: quantity-input regression, AI firewall, duplicate warning, CSV, dates |
| `tests/db/*`, `vitest.db.config.ts` | Isolated-DB suite with fail-closed guard, synthetic fixtures, id-scoped cleanup |
| `tests/e2e/*`, `playwright.config.ts` | Read-only production smoke + layout |
| `vitest.config.ts`, `package.json` scripts | `test`, `test:db`, `test:smoke`, `typecheck` |
| `.github/workflows/test.yml` | CI: typecheck + unit + read-only smoke; DB job only when a test project is configured |
| `.env.test.example`, `.gitignore` | Placeholders only; test output ignored |

After the change: `tsc` ✅ · unit 39/39 ✅ · smoke 22/22 ✅ · `vite build` ✅ · lint clean on all new/changed files.
`src/components/NumberInput.tsx` changed only in Prettier formatting.
