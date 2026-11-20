# Implementation Plan & Progress Log

Status legend: ✅ done & tested · 🟡 built, needs external credentials to exercise · ⬜ not started

## Phase 1 — Foundation
1. Monorepo (pnpm workspaces), strict TS base config, shared Tailwind preset & design tokens.
2. Supabase migrations: extensions, `app` helper schema, profiles, organizations, members, platform products,
   entitlements, plans, subscriptions, audit log, notifications.
3. Permission matrix in SQL (`role_permissions`) + TypeScript mirror with a parity test.
4. RLS on every tenant-owned table; helper functions `app.is_member`, `app.has_permission`, `app.is_writable`.
5. Auth screens: register, login, forgot/reset password, email verification callback, account settings.
6. Workspace creation (`create_workspace` RPC → org + owner membership + entitlement + 7-day trial).
7. DB test harness that runs migrations against a throwaway Postgres DB and impersonates users.

## Phase 2 — Core operations
Customers (CRUD/archive/search/filter/CSV import with preview & dedupe/export), products + variants, categories,
inventory movements & adjustments, orders (draft → confirmed → … → delivered/cancelled), returns, order numbers,
printable summary, dashboard with live figures and charts.

## Phase 3 — Finance & productivity
Payments (partial, refunds), expenses + custom categories, other income, profit reporting, follow-up tasks
(suggested + manual, snooze, assign, daily overview).

## Phase 4 — AI
Provider abstraction, 10 business-data tools, assistant UI with history, usage logging & plan limits.

## Phase 5 — Commercial
Plans/entitlements, trial lifecycle, Paystack checkout + webhook (signature + idempotency), billing page,
upgrade/downgrade/cancel, payment history, read-only mode on expiry.

## Phase 6 — Experience
Demo workspace (seed + reset), mobile navigation & patterns, PWA manifest + service worker, landing page,
transactional emails.

## Phase 7 — Quality
Security review, tests, deployment docs.
