# Implementation plan & progress log

Legend: ✅ built and verified by automated tests · 🟢 built, typechecked, production-built and smoke-tested in a browser ·
🟡 built, needs external credentials to exercise end-to-end · ⬜ not started

## Verification summary (latest run)

| Suite | Result |
|---|---|
| Database (real Postgres 16, users impersonated as PostgREST does) | **100 / 100** passing |
| Package unit tests (billing, permissions, auth, ai-core, notifications, database) | **30 / 30** passing |
| Growth OS app unit tests (date ranges, insights, CSV, upload validation, AI tools, Paystack webhook) | **29 / 29** passing |
| `pnpm typecheck` across all 11 workspace packages | clean |
| `next build` for all three apps | success |
| Browser smoke tests (Chromium): landing page desktop + mobile, auth screens, auth redirect, form validation, login rate limit | pass |

**Not yet exercised end-to-end:** flows that need a running Supabase Auth/PostgREST/Storage (sign-up → onboarding → orders in the
browser), Paystack test-mode checkout, Resend delivery and live Claude responses. Downloading the Supabase service binaries
was not permitted in the build environment, so these require `supabase start` (Docker) or a real Supabase project — see the
go-live checklist in `docs/deployment.md`.

## Phase 1 — Foundation ✅
Monorepo (pnpm), strict TypeScript, shared Tailwind preset/tokens and component library, Supabase migrations, permission matrix
(SQL + TS parity test), RLS everywhere, auth screens (register, login, forgot/reset, verify, account), workspace creation with
7-day trial, DB test harness.

## Phase 2 — Core operations ✅ / 🟢
Dashboard (live figures, charts, date filters incl. custom, rule-based insights) · customers (CRUD, archive, search/filter/sort,
CSV import with preview + dedupe, export, profile with orders/payments/purchase summary/notes/follow-ups) · products with
variants (own SKU/stock/price) · inventory (adjustments, low-stock, full movement history) · orders (draft → delivered,
reserve/deduct stock policies, cancellation releases/restocks, part-payments, refunds, voids, returns, unique numbers, printable summary).

## Phase 3 — Finance & productivity ✅ / 🟢
Expenses with system + custom categories, other income, voiding, profit summary with data-quality warnings, payments ledger,
finance export · follow-ups (manual + suggested, snooze, assign, complete with notes, daily overview).

## Phase 4 — AI ✅ / 🟡
Provider abstraction (`packages/ai-core`, Claude via Anthropic SDK, disabled provider), 11 authorised data tools, assistant
UI with suggested questions/history/sources/errors, usage + cost logging, plan quotas, feature flag kill-switch.
🟡 needs `ANTHROPIC_API_KEY` for live answers.

## Phase 5 — Commercial ✅ / 🟡
Configurable plans/entitlements, trial lifecycle (no auto-charge), Paystack checkout, server-side verification, signed and
idempotent webhook, renewals, failed payments (grace → read-only), cancellation (access to period end), upgrade/downgrade
(downgrade guard), previous Paystack subscription disabled on plan switch, billing page with usage meters and payment history,
server-enforced limits. 🟡 needs Paystack keys.

## Phase 6 — Experience ✅ / 🟢
Demo workspace (seeded via real business functions, badged, resettable; guest access via anonymous sign-in), mobile-first
navigation (bottom bar with quick-create, bottom-sheet dialogs, card lists), PWA (manifest, icons, service worker that never
caches business data, offline page), corporate site + Growth OS landing page, transactional email templates. 🟡 Resend key.

## Phase 7 — Quality 🟢
Security review (`docs/architecture/security.md`), automated tests above, error monitoring (`app_errors` + admin view),
deployment guide. Internal admin panel built (role-gated, aggregates only, audited).

## Decisions log
See `docs/architecture/README.md` §6. Additional decisions made during build:
* Monetary display arithmetic only; all stored/reportable money computed in SQL.
* Demo for unregistered visitors uses Supabase anonymous sign-in; convertible to a real account.
* Plan switch = new paid period from payment date (no proration) — stated in the billing UI.
* Default AI model `claude-opus-5-5` at low effort with server-side refusal fallback; configurable in admin.

## Outstanding / recommended next steps
1. Run the full flow against a real Supabase project (or `supabase start`) and add Playwright E2E for sign-up → order → payment.
2. Paystack test-mode purchase and webhook replay; then live keys.
3. Confirm parent brand name; legal review of privacy policy/terms.
4. Add Sentry, CAPTCHA, and a CSP (see security doc).
5. Performance: add pagination to the inventory list and order builder search for very large catalogues (>2,000 SKUs).
6. Not in scope for v1 (per brief): automatic WhatsApp messaging.
