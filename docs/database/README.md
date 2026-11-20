# Database

All schema changes are migrations in `supabase/migrations` (applied in filename order).

| Migration | Contents |
|---|---|
| `…0001_platform_core` | profiles, platform_staff, platform_products, organizations, members, invitations, role_permissions, organization_products (entitlements), subscription_plans, plan_entitlements, subscriptions, payment_transactions, payment_events, ai_usage_logs, notifications, audit_logs, support_requests, app_errors, feature_flags, platform_settings, rate_limits; auth helper functions; platform RLS |
| `…0002_growth_os_schema` | business_profiles, customers, product_categories, products, product_variants, inventory_movements, orders, order_items, payments, order_returns, order_return_items, expense_categories, expenses, income_records, follow_up_tasks, ai_conversations, ai_messages; views `customer_summaries`, `variant_stock`; Growth OS RLS; cross-tenant guards |
| `…0003_growth_os_functions` | plan-limit triggers, `create_workspace`, stock ledger primitive, product/variant creation, stock adjustments, order lifecycle (draft → confirmed → … → delivered / cancelled), payments, refunds, voids, returns, team management |
| `…0004_reports` | `report_*` functions used by dashboard, finance page and AI tools; follow-up suggestions |
| `…0005_billing` | plan catalogue seed, `workspace_context`, `workspace_usage`, `ai_quota`, service-only billing functions |
| `…0006_demo` | demo data generator, `create_demo_workspace`, `reset_demo_workspace` |
| `…0007_admin_storage_hardening` | admin aggregates, storage bucket + policies, final privilege lockdown |

## Rules

* **Every tenant row has `organization_id`** and RLS on every tenant table. Reads require membership + permission + the
  workspace's Growth OS entitlement; writes additionally require an active/trial subscription.
* **Money is `numeric(14,2)`**; quantities are integers. The app never does money arithmetic for storage — SQL does.
* **Ledgers are append-only**: inventory movements, payments and returns cannot be updated or deleted by clients.
  Payments and expenses are corrected by *voiding* (kept, excluded from reports, audited).
* **Stock changes only through `app.apply_stock_movement`** (a trigger rejects direct edits), so
  `Σ movements = quantity_on_hand` always holds (tested).
* `public.*` functions are the API (authenticate + authorise, then call `app.*`); `app.*` functions are internal and not
  executable by clients. `billing_*` / `admin_*` functions are service-role only.
* App error codes (`SQLSTATE`): `GO400` validation · `GO402` subscription/plan limit · `GO403` forbidden · `GO404` not found · `GO409` conflict.

## Reporting definitions

| Figure | Definition |
|---|---|
| Sales recorded (gross) | Σ total of non-draft, non-cancelled orders dated in the period (after discounts, incl. delivery) |
| Revenue (net sales) | Gross sales − return credits in the period |
| Cash received | Σ payments − Σ refunds with `paid_at` in the period (voided excluded). Unpaid orders never count. |
| Outstanding | Σ positive `balance_due` on open orders (all time, as of now) |
| COGS | Σ cost snapshots of items sold in the period − cost of restocked returns |
| Gross profit | Revenue − COGS |
| Estimated net profit | Gross profit + other income − operating expenses |

All periods are calendar dates in the workspace timezone.

## Roles

| Role | Can |
|---|---|
| owner | everything, including billing |
| admin | everything except billing |
| manager | operations + finance, no team/settings/billing |
| staff | customers, orders, payments, stock adjustments, tasks, AI — no finance, deletes or exports |
| viewer | read-only incl. finance (e.g. accountant) |

The TypeScript copy (`packages/permissions`) is checked for parity with the SQL matrix by a test.
