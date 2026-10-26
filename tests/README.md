# Tests

| Command | What it runs | Touches a database? |
|---|---|---|
| `npm test` | Vitest unit tests in `tests/unit` | No |
| `npm run test:smoke` | Playwright, read-only, public pages of `SMOKE_BASE_URL` (default: production) | No writes, no sign-in |
| `npm run test:db` | Real RPCs, RLS and concurrency in `tests/db` | **Isolated test project only** |
| `npm run typecheck` | `tsc --noEmit` | No |

Reports go to `test-results/` (JUnit XML + Playwright HTML in `test-results/playwright-html`).

## Database safety checklist

`tests/db/guard.ts` enforces this before any write. If anything fails, the run stops as **BLOCKED**.

- [ ] `TEST_SUPABASE_URL`, `TEST_SUPABASE_ANON_KEY`, `TEST_SUPABASE_SERVICE_ROLE_KEY` are set
      (from `.env.test`, never the app's `.env`)
- [ ] `SAC_TEST_DB_CONFIRM=isolated-test-project` was set by a person
- [ ] The URL is not a known production ref (`ngwmqatnrkuxhszxcjds`, `ioadezusvonzohoyepnu`)
- [ ] The URL is not the database in the app's `.env`
- [ ] The database contains `public.qa_sentinel` with `kind = 'isolated-test'` (create it by hand
      in the test project only)

Fixtures are synthetic (`qa-<run>-<label>@example.test`, rack `QA-<run>`). Cleanup deletes only
the ids that run created, children first, and is safe to repeat.
**Never** point `test:db` at production, and never use the service role to "prove" a member
restriction. Member assertions always go through a signed-in anon-key client.

## Feature → test traceability

| Feature | Unit | DB (isolated) | Smoke | Status |
|---|---|---|---|---|
| Quantity / days input | number-input (8) | qty 0/−1, days 0/91 | — | ✅ unit · ⛔ db |
| Borrow + stock decrement | — | 7 tests | — | ⛔ |
| Concurrent borrow | — | 2 tests | — | ⛔ |
| Return / duplicate return / damage | — | 3 tests | — | ⛔ |
| Extensions (limit, ownership) | — | 2 tests | — | ⛔ |
| Damage reports / write-off once | — | 1 test | — | ⛔ |
| RLS: loan tampering, contact-data leak | — | QA-001/002/003 | — | ⛔ (expected to fail until fixed) |
| AI identify firewall | identify-reply (12) | — | — | ✅ |
| Duplicate-part warning | similar (9) | — | — | ✅ |
| CSV export | csv (6) | — | — | ✅ (QA-006 documented) |
| Due dates | queries (4) | — | — | ✅ |
| Auth redirects, admin gate, 404 | — | — | 9 | ✅ |
| Manifest / no service worker | — | — | 2 | ✅ |
| Secrets not in bundle, cron auth | — | — | 2 | ✅ |
| Responsive / keyboard | — | — | 8 (desktop + mobile) | ✅ |
| Stock counting, additions, part requests, admin panel, reminders, exports auth | — | not yet | — | ⛔ not written |
