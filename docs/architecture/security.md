# Security review

| Area | Control | Where |
|---|---|---|
| Authentication | Supabase Auth, HTTP-only cookies via `@supabase/ssr`; middleware validates the JWT with `getUser()` on every request | `packages/database/src/middleware.ts` |
| Tenant isolation | RLS on every tenant table; membership + permission + product entitlement; rows can't change workspace (trigger); cross-workspace foreign references rejected | migrations 0002; `supabase/tests/tenant-isolation.test.mjs` |
| Authorisation | Role → permission matrix enforced in SQL (`app.assert_permission`) and mirrored in the UI; server actions re-check | migrations 0001/0003; `packages/permissions` |
| Business integrity | Money/stock operations are atomic SQL functions; ledgers append-only; voids audited | migration 0003 |
| Subscription enforcement | Read-only on expiry enforced by RLS/functions; plan limits by triggers | migrations 0001/0003 |
| Secrets | Service-role, Paystack, Anthropic, Resend keys are server-only env vars; `serviceRoleKey()` throws in the browser; `/setup` shows presence only | `packages/database/src/env.ts` |
| Payments | No card data stored; HMAC-SHA512 webhook verification with constant-time compare; server-side transaction verification before activation; idempotent event ledger | `packages/billing`, `api/webhooks/paystack` |
| AI | Model sees only tool output; tools validate input (strict Zod), check permission, use the user's RLS-scoped client; conversations private to their owner; usage capped per plan | `apps/growth-os/src/server/ai` |
| Input validation | Zod on every server action/route; DB CHECK constraints; PostgREST filter input sanitised | `apps/growth-os/src/server/*` |
| Uploads | Size limit, magic-byte sniffing (PNG/JPEG/WebP only, no SVG), random object names, private bucket + signed URLs, storage RLS | `src/lib/image-validation.ts`, migration 0007 |
| Rate limiting | DB-backed fixed window (login, sign-up, reset, demo, AI, exports, invites) | `src/server/rate-limit.ts` |
| CSRF | Next.js server-action origin checks; explicit Origin check on the JSON AI endpoint; SameSite=Lax cookies | `api/ai/chat` |
| Open redirects | `safeRedirect()` for all `next` parameters | `packages/auth/src/validation.ts` |
| CSV export | Permission + plan gated; formula-injection neutralised | `api/export`, `src/lib/csv.ts` |
| Headers | HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy | `next.config.ts` |
| Internal admin | Separate app; staff role required; no RLS path into tenant business tables; aggregates only; every change audited | `apps/platform-admin` |
| Error monitoring | Unexpected errors logged to `app_errors` (admin → Errors); user-facing messages never leak internals | `src/server/errors.ts` |

## Known limitations / recommended next steps

* Add Sentry (or similar) alongside `app_errors` for stack traces and alerting.
* Enable CAPTCHA on sign-up and anonymous sign-ins in Supabase before public launch.
* Add a Content-Security-Policy once third-party scripts (PostHog) are finalised.
* Consider Upstash/Redis for rate limiting at higher traffic (DB limiter is fine at launch scale).
