# Platform Architecture

> Parent company: **[MASTER BRAND — TO BE CONFIRMED]**. Code uses the neutral scope `@platform/*`
> so the brand can be renamed without touching imports.

## 1. Shape: modular monolith in a pnpm monorepo

```
company-platform/
├── apps/
│   ├── growth-os/           Next.js 15 (App Router) – the Growth OS product (port 3000)
│   ├── corporate-website/   Next.js 15 – parent-company site + Growth OS landing page (port 3001)
│   └── platform-admin/      Next.js 15 – internal administration (port 3002)
├── packages/
│   ├── ui/                  Design tokens, Tailwind preset, shadcn-style components
│   ├── database/            Supabase client factories (browser/server/service), env, DB types
│   ├── auth/                Session + workspace context resolution (server only)
│   ├── permissions/         Role → permission matrix (mirrors SQL, tested for parity)
│   ├── billing/             Plan catalogue, entitlement maths, subscription state, Paystack client + webhook verification
│   ├── ai-core/             Provider abstraction (Anthropic / OpenAI-compatible / disabled), tool loop, cost estimation
│   ├── notifications/       Resend transactional email + templates
│   └── analytics/           PostHog wrapper (no-op when unconfigured)
├── supabase/
│   ├── migrations/          Ordered SQL migrations (schema, RLS, business functions, seed config)
│   ├── seed/                Demo data generator (SQL function, callable per workspace)
│   └── tests/               Postgres-level tests: tenant isolation, business logic, reconciliation
└── docs/
```

No microservices. Each app is deployed as its own Vercel project; they share one Supabase project.

## 2. Multi-product, multi-tenant model

| Concept | Table | Notes |
|---|---|---|
| Identity | `auth.users` + `profiles` | One identity across every product |
| Workspace (tenant) | `organizations` | Every business record carries `organization_id` |
| Membership | `organization_members` | user × org × role; users may belong to many orgs |
| SaaS product catalogue | `platform_products` | `growth-os` is the first row; future products are rows, not forks |
| Product entitlement | `organization_products` | Which orgs may use which products — separate from billing |
| Billing | `subscription_plans`, `plan_entitlements`, `subscriptions`, `payment_transactions`, `payment_events` | Plans belong to a product; limits are data, not code |

Growth OS tables (`customers`, `products`, `orders`, …) live in `public` but their RLS policies require
**both** workspace membership **and** that the workspace is entitled to `growth-os`. A future product
gets its own tables and its own entitlement check, so it can never read Growth OS data even with a
valid session.

## 3. Where business rules live

**Rule: anything that moves money or stock is a Postgres function.** Order totals, stock reservation
and deduction, payments, refunds, returns and cancellations run inside single transactions in
`SECURITY DEFINER` functions. Each one starts with `app.assert_permission(org, perm)` and
`app.assert_writable(org)`. This means:

* totals and balances can't be tampered with from the client (the client sends ids + quantities only),
* inventory movements and payments are append-only, so the audit trail is complete,
* the dashboard, the finance page and the AI assistant all call **the same** reporting functions
  (`report_financial_summary`, …), so their numbers always agree.

Plan limits (products, customers, monthly orders, seats) are enforced by `BEFORE INSERT` triggers, so
no client can get around them. Expired subscriptions become **read-only**. Data is never deleted.

## 4. Security layers

1. Supabase Auth session (HTTP-only cookies via `@supabase/ssr`), refreshed in middleware.
2. Server-side `requireWorkspace()` resolves the active org + role, and every server action re-checks permission.
3. RLS on every tenant table (defence in depth – the app uses the user's JWT, not the service key, for tenant data).
4. Service-role key is used only in webhooks, cron jobs and the admin app – never shipped to the browser.
5. Audit log for privileged actions; internal admins have **no** RLS path into tenant business tables.

## 5. AI assistant

`packages/ai-core` defines `AIProvider` and a bounded tool-use loop. Growth OS registers tools
(`get_sales_summary`, …). Each tool validates input with Zod, re-authenticates, checks membership and
permission, and calls RLS-scoped reporting functions. The model only receives tool output, never raw
DB access, and **all arithmetic is done in SQL**. Usage (tokens + estimated cost) is written to
`ai_usage_logs` and checked against the plan's monthly allowance before every request. Dashboard
"insights" are rule-based (no LLM), so they keep working when the AI provider is down.

## 6. Key decisions (ADR summary)

| # | Decision | Why |
|---|---|---|
| 1 | Next.js 15.5 / React 19 / TS 5.9 strict / Tailwind 3.4 | Stable, well-supported line; Tailwind 3 is the most battle-tested shadcn setup |
| 2 | Hand-authored shadcn-style components in `packages/ui` | Shared by all three apps; the shadcn CLI copies per app, which would fork the design system |
| 3 | Business logic in plpgsql | Atomic stock/money ops, one source of truth for reports, testable at DB level |
| 4 | Money = `numeric(14,2)`, NGN default | No floating point; currency stored per org for future markets |
| 5 | Paystack via REST (no SDK) | Small surface; signature verify + verify-transaction before activation |
| 6 | AI provider via REST (no SDK) | Swappable provider, keys server-only |
| 7 | Demo workspace = a real org flagged `is_demo` | Same code paths as real data; clearly badged; resettable |
| 8 | Order stock policy: reserve on confirm, deduct on dispatch | Matches social-commerce workflow; configurable to "deduct on confirm" |
