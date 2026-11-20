# Deployment guide

Production topology: **one Supabase project** shared by all apps, and **one Vercel project per app**
(`apps/growth-os`, `apps/corporate-website`, `apps/platform-admin`), each with its *Root Directory* set to the app folder.

## 1. Supabase

1. Create a project (region close to Nigeria, e.g. `eu-west`/Frankfurt). Note the URL, anon key and service-role key.
2. Apply migrations from your machine:
   ```bash
   npx supabase link --project-ref YOUR_REF
   ```
   ```bash
   npx supabase db push
   ```
   Migrations are idempotent per file and ordered by timestamp. Never edit production schema by hand — add a new migration.
3. **Authentication → URL configuration**: Site URL `https://app.yourdomain.com`; redirect URL `https://app.yourdomain.com/auth/confirm`.
4. **Authentication → Email templates**: use the token-hash links handled by `/auth/confirm`, e.g. for *Confirm signup*:
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding`
   (Recovery: `type=recovery&next=/reset-password`; Email change: `type=email_change&next=/settings/account`.)
5. **Authentication → SMTP**: point at Resend (`smtp.resend.com`, port 465, user `resend`, password = Resend API key) so auth
   emails come from your domain.
6. **Authentication → Providers**: enable *Anonymous sign-ins* if you want visitors to try the demo without registering
   (the app rate-limits demo creation per IP; consider enabling CAPTCHA). If disabled, "Explore the demo" asks visitors to register first.
7. **Storage**: the `business-assets` bucket and its RLS policies are created by migration `…0007` (private bucket, 5 MB, PNG/JPEG/WebP).
8. Make yourself a platform admin: run `supabase/seed/make-platform-admin.sql` (edit the email) in the SQL editor after registering.

## 2. Growth OS (`apps/growth-os`)

Environment variables (see `.env.example`):

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Public; RLS protects data |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | **Server only.** Webhooks, cron, AI message/usage logging, rate limiter |
| `NEXT_PUBLIC_APP_URL` | yes | e.g. `https://app.yourdomain.com` (email links, Paystack callback) |
| `CRON_SECRET` | yes | Random 32+ chars; Vercel Cron sends it automatically |
| `PAYSTACK_SECRET_KEY` | for paid plans | Checkout, verification, webhook signatures |
| `ANTHROPIC_API_KEY` | for AI | Without it the assistant shows "not configured"; everything else works |
| `RESEND_API_KEY`, `EMAIL_FROM` | recommended | Product emails (welcome, invites, receipts, reminders) |
| `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | optional | Product analytics (no business data is sent) |

Vercel settings: Framework *Next.js*; Install command `pnpm install --frozen-lockfile`; Root Directory `apps/growth-os`.
`vercel.json` registers the daily cron (`/api/cron/daily`). Visit `/setup` after deploying to see which integrations are configured
(values are never shown) and `/api/health` for uptime monitoring.

## 3. Paystack

1. Dashboard → Settings → API Keys & Webhooks: copy the **secret key** into `PAYSTACK_SECRET_KEY`.
2. Webhook URL: `https://app.yourdomain.com/api/webhooks/paystack`. Signatures (HMAC-SHA512) are verified on every request.
3. *(Optional, for automatic monthly renewal)* create three Monthly plans in Paystack (₦3,500 / ₦7,500 / ₦15,000) and paste their
   `PLN_…` codes into **Platform admin → Plans**. Without plan codes each payment buys one month and the customer renews manually.
4. Test end-to-end with test keys and Paystack's test cards before switching to live keys.

How billing is trusted: checkout creates a *pending* transaction → Paystack redirects to `/api/billing/callback` → the server
**verifies the reference with Paystack's API** before applying it. The webhook does the same independently. Both paths are
idempotent (unique reference + `payment_events` ledger). Trials never auto-charge. Expired subscriptions become read-only;
data is never deleted.

## 4. Corporate website (`apps/corporate-website`)

`NEXT_PUBLIC_COMPANY_NAME` (parent brand — still to be confirmed), `NEXT_PUBLIC_GROWTH_OS_APP_URL`, and optionally the Supabase
URL + anon key so the pricing section reads live plans (falls back to the seeded prices). Fully static, revalidated hourly.

## 5. Platform admin (`apps/platform-admin`)

Same Supabase variables including the service-role key. Deploy on a separate, non-indexed domain (e.g. `admin.yourdomain.com`),
ideally behind Vercel password protection / SSO as an extra layer. Access requires a `platform_staff` row; staff roles are
`super_admin`, `support`, `billing`, `analyst`. Every change is written to `audit_logs`.

## 6. AI provider

Default model: `claude-opus-5-5` via the Anthropic SDK, with server-side refusal fallbacks enabled. Change provider/model in
**Platform admin → AI**. Monthly AI message allowances per plan are in `plan_entitlements.ai_messages_per_month`.
Each request's tokens and estimated USD cost are logged in `ai_usage_logs`.

## 7. Go-live checklist

- [ ] Migrations applied; `pnpm test:db` passing against a copy of the schema
- [ ] Auth URLs, email templates and SMTP configured; sign-up → verify → onboarding tested
- [ ] Paystack webhook URL set; test-mode purchase activates a plan; live keys swapped in
- [ ] `CRON_SECRET` set and cron visible in Vercel
- [ ] Platform admin account created; admin app on a protected domain
- [ ] Privacy policy & terms reviewed by a lawyer (NDPA 2023)
- [ ] Brand name confirmed (`NEXT_PUBLIC_COMPANY_NAME`)
- [ ] Backups (Supabase PITR) enabled; uptime monitor on `/api/health`
