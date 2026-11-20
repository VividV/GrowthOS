# Company Platform — Growth OS

Monorepo for the parent company's SaaS portfolio. The first product is **Growth OS**, the AI-powered operating system
for small and growing businesses (initial market: Nigeria · NGN · Africa/Lagos).

| App | Path | Port | What it is |
|---|---|---|---|
| Growth OS | `apps/growth-os` | 3000 | The product: CRM, orders, inventory, finance, follow-ups, AI assistant, billing |
| Corporate website | `apps/corporate-website` | 3001 | Parent-company site + Growth OS landing page |
| Platform admin | `apps/platform-admin` | 3002 | Internal staff console (aggregates only, audited) |

Shared code lives in `packages/` (`ui`, `database`, `auth`, `permissions`, `billing`, `ai-core`, `notifications`, `analytics`).
Database schema, RLS and business logic live in `supabase/migrations/`. Architecture: [`docs/architecture/README.md`](docs/architecture/README.md).

## Quick start (local)

Requirements: Node ≥ 20.18, pnpm 10, Docker (for the Supabase CLI).

```bash
pnpm install
```

```bash
npx supabase start          # starts Postgres, Auth, Storage, Studio and applies supabase/migrations
```

```bash
cp apps/growth-os/.env.example apps/growth-os/.env.local   # fill in values printed by `supabase start`
```

```bash
pnpm dev                    # Growth OS on http://localhost:3000
```

Confirmation emails are captured locally by Inbucket at http://localhost:54324. Open **/demo** to explore a seeded sample business.

## Tests

```bash
pnpm test         # package + app unit tests, then the Postgres test suite
```

```bash
pnpm test:db      # database tests only (needs a local Postgres; see below)
```

```bash
pnpm typecheck
```

The database suite (`supabase/tests`) creates a throwaway database, applies a small Supabase emulation (`bootstrap.sql`:
roles, `auth.uid()`) plus every migration, then impersonates users exactly like PostgREST does. It covers tenant isolation,
role permissions, inventory ledger integrity, payments/returns, financial reconciliation, billing idempotency, plan limits and
the demo. Set `DATABASE_ADMIN_URL` if your Postgres isn't `postgres://postgres:postgres@localhost:5432/postgres`.

## Deploying

See [`docs/deployment.md`](docs/deployment.md) — Supabase project, Vercel (one project per app), Paystack, Resend, Anthropic,
PostHog, cron, and the go-live checklist.

## Status

Progress, decisions and known gaps: [`docs/product-specifications/implementation-plan.md`](docs/product-specifications/implementation-plan.md).
