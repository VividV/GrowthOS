-- ============================================================================
-- 0001 PLATFORM CORE
-- Shared, product-agnostic tables: identity, workspaces, membership,
-- permissions, product entitlements, plans, subscriptions, audit, notifications.
-- ============================================================================

create extension if not exists pgcrypto;

-- Private helper schema (not exposed through the Data API).
create schema if not exists app;
grant usage on schema app to authenticated, service_role;
revoke all on schema app from anon;

-- ---------------------------------------------------------------------------
-- Generic helpers
-- ---------------------------------------------------------------------------
create or replace function app.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Application error codes (SQLSTATE, 5 chars) mapped to friendly messages in the app:
--   GO400 validation · GO402 subscription/plan limit · GO403 forbidden · GO404 not found · GO409 conflict (e.g. stock)
create or replace function app.raise(code text, message text) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception using errcode = code, message = message;
end $$;

-- ---------------------------------------------------------------------------
-- Profiles (1:1 with auth.users) and internal platform staff
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text,
  avatar_url text,
  default_organization_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function app.set_updated_at();

-- Internal staff of the parent company. Never writable from the client.
create table public.platform_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('super_admin', 'support', 'billing', 'analyst')),
  created_at timestamptz not null default now()
);

create or replace function app.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''), new.email)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();

-- Keep profile email in sync when a user changes / confirms their email.
create or replace function app.handle_user_email_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end $$;
create trigger on_auth_user_email_changed after update of email on auth.users
  for each row execute function app.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- SaaS product catalogue (Growth OS is the first product)
-- ---------------------------------------------------------------------------
create table public.platform_products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z0-9-]+$'),
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.platform_products (code, name, description)
values ('growth-os', 'Growth OS', 'The AI-powered operating system for small and growing businesses.');

-- ---------------------------------------------------------------------------
-- Workspaces
-- ---------------------------------------------------------------------------
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug text not null unique,
  category text,
  description text,
  country text not null default 'NG',
  currency text not null default 'NGN' check (currency ~ '^[A-Z]{3}$'),
  timezone text not null default 'Africa/Lagos',
  is_demo boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create trigger organizations_updated_at before update on public.organizations
  for each row execute function app.set_updated_at();

alter table public.profiles
  add constraint profiles_default_org_fk foreign key (default_organization_id)
  references public.organizations(id) on delete set null;

create table public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'manager', 'staff', 'viewer')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);
create index organization_members_user_idx on public.organization_members(user_id);
create trigger organization_members_updated_at before update on public.organization_members
  for each row execute function app.set_updated_at();

create table public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role text not null check (role in ('admin', 'manager', 'staff', 'viewer')),
  token_hash text not null unique,
  invited_by uuid references auth.users(id) on delete set null,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index organization_invitations_org_idx on public.organization_invitations(organization_id);

-- ---------------------------------------------------------------------------
-- Permissions: role -> permission matrix (mirrored in packages/permissions)
-- ---------------------------------------------------------------------------
create table public.role_permissions (
  role text not null,
  permission text not null,
  primary key (role, permission)
);

insert into public.role_permissions (role, permission)
select r, p from (values
  -- owner: everything
  ('owner','customers.read'),('owner','customers.write'),('owner','customers.delete'),('owner','customers.import'),
  ('owner','products.read'),('owner','products.write'),('owner','products.delete'),('owner','inventory.adjust'),
  ('owner','orders.read'),('owner','orders.write'),('owner','orders.cancel'),('owner','payments.record'),('owner','payments.refund'),
  ('owner','finance.read'),('owner','finance.write'),('owner','reports.read'),
  ('owner','tasks.read'),('owner','tasks.write'),('owner','tasks.assign'),('owner','ai.use'),
  ('owner','members.manage'),('owner','settings.manage'),('owner','billing.manage'),('owner','audit.read'),
  ('owner','data.export'),('owner','demo.reset'),
  -- admin: everything except billing
  ('admin','customers.read'),('admin','customers.write'),('admin','customers.delete'),('admin','customers.import'),
  ('admin','products.read'),('admin','products.write'),('admin','products.delete'),('admin','inventory.adjust'),
  ('admin','orders.read'),('admin','orders.write'),('admin','orders.cancel'),('admin','payments.record'),('admin','payments.refund'),
  ('admin','finance.read'),('admin','finance.write'),('admin','reports.read'),
  ('admin','tasks.read'),('admin','tasks.write'),('admin','tasks.assign'),('admin','ai.use'),
  ('admin','members.manage'),('admin','settings.manage'),('admin','audit.read'),('admin','data.export'),('admin','demo.reset'),
  -- manager: runs operations and finance, no workspace administration
  ('manager','customers.read'),('manager','customers.write'),('manager','customers.delete'),('manager','customers.import'),
  ('manager','products.read'),('manager','products.write'),('manager','products.delete'),('manager','inventory.adjust'),
  ('manager','orders.read'),('manager','orders.write'),('manager','orders.cancel'),('manager','payments.record'),('manager','payments.refund'),
  ('manager','finance.read'),('manager','finance.write'),('manager','reports.read'),
  ('manager','tasks.read'),('manager','tasks.write'),('manager','tasks.assign'),('manager','ai.use'),('manager','data.export'),
  -- staff: front-line sales; no finance, no deletes, no exports
  ('staff','customers.read'),('staff','customers.write'),
  ('staff','products.read'),('staff','inventory.adjust'),
  ('staff','orders.read'),('staff','orders.write'),('staff','payments.record'),
  ('staff','tasks.read'),('staff','tasks.write'),('staff','ai.use'),
  -- viewer: read-only (e.g. an accountant)
  ('viewer','customers.read'),('viewer','products.read'),('viewer','orders.read'),
  ('viewer','finance.read'),('viewer','reports.read'),('viewer','tasks.read')
) as t(r, p);

-- ---------------------------------------------------------------------------
-- Product entitlements (which workspace may use which product)
-- ---------------------------------------------------------------------------
create table public.organization_products (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.platform_products(id) on delete restrict,
  status text not null default 'active' check (status in ('active', 'suspended')),
  enabled_at timestamptz not null default now(),
  primary key (organization_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Plans, entitlements, subscriptions, payments
-- ---------------------------------------------------------------------------
create table public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.platform_products(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  price numeric(14,2) not null check (price >= 0),
  currency text not null default 'NGN',
  billing_interval text not null default 'monthly' check (billing_interval in ('monthly', 'annually')),
  paystack_plan_code text,
  features jsonb not null default '[]'::jsonb,   -- marketing bullet points
  is_public boolean not null default true,        -- shown on pricing page / checkout
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, code)
);
create trigger subscription_plans_updated_at before update on public.subscription_plans
  for each row execute function app.set_updated_at();

-- limit_value NULL = unlimited. enabled=false switches a feature off.
create table public.plan_entitlements (
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  key text not null,
  enabled boolean not null default true,
  limit_value integer check (limit_value is null or limit_value >= 0),
  primary key (plan_id, key)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.platform_products(id) on delete restrict,
  plan_id uuid not null references public.subscription_plans(id) on delete restrict,
  status text not null check (status in ('trialing', 'active', 'past_due', 'canceled', 'expired')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  pending_plan_id uuid references public.subscription_plans(id) on delete set null,
  paystack_customer_code text,
  paystack_subscription_code text,
  paystack_email_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, product_id)
);
create index subscriptions_status_idx on public.subscriptions(status);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function app.set_updated_at();

create table public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  subscription_id uuid references public.subscriptions(id) on delete set null,
  plan_id uuid references public.subscription_plans(id) on delete set null,
  provider text not null default 'paystack',
  reference text not null unique,
  amount numeric(14,2) not null check (amount >= 0),
  currency text not null default 'NGN',
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'abandoned', 'reversed')),
  channel text,
  paid_at timestamptz,
  initiated_by uuid references auth.users(id) on delete set null,
  failure_reason text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payment_transactions_org_idx on public.payment_transactions(organization_id, created_at desc);
create trigger payment_transactions_updated_at before update on public.payment_transactions
  for each row execute function app.set_updated_at();

-- Webhook idempotency ledger: one row per distinct provider event.
create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  event_key text not null,
  event_type text not null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  error text,
  unique (provider, event_key)
);

-- ---------------------------------------------------------------------------
-- AI usage, notifications, audit, support, errors, flags, settings
-- ---------------------------------------------------------------------------
create table public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  product_id uuid references public.platform_products(id) on delete set null,
  conversation_id uuid,
  request_kind text not null default 'chat' check (request_kind in ('chat', 'insight')),
  provider text not null,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  tool_calls integer not null default 0,
  estimated_cost_usd numeric(12,6) not null default 0,
  status text not null default 'ok' check (status in ('ok', 'error')),
  created_at timestamptz not null default now()
);
create index ai_usage_logs_org_idx on public.ai_usage_logs(organization_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,  -- null = every member
  type text not null,
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_org_user_idx on public.notifications(organization_id, user_id, created_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  actor_type text not null default 'user' check (actor_type in ('user', 'platform_admin', 'system')),
  action text not null,
  entity_type text,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_org_idx on public.audit_logs(organization_id, created_at desc);

create table public.support_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  subject text not null check (char_length(subject) between 3 and 200),
  message text not null check (char_length(message) between 5 and 5000),
  status text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger support_requests_updated_at before update on public.support_requests
  for each row execute function app.set_updated_at();

create table public.app_errors (
  id uuid primary key default gen_random_uuid(),
  app text not null,
  message text not null,
  stack text,
  context jsonb not null default '{}'::jsonb,
  user_id uuid,
  organization_id uuid,
  created_at timestamptz not null default now()
);
create index app_errors_created_idx on public.app_errors(created_at desc);

create table public.feature_flags (
  key text primary key check (key ~ '^[a-z0-9_.-]+$'),
  description text,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.feature_flags (key, description, enabled) values
  ('ai_assistant', 'AI business assistant in Growth OS', true),
  ('ai_dashboard_insights', 'Rule-based insights on the dashboard', true),
  ('demo_workspaces', 'Allow users to create demonstration workspaces', true),
  ('csv_import', 'Customer CSV import', true);

-- Non-secret platform configuration (e.g. which AI provider/model is active).
-- API keys are NEVER stored here — only in server environment variables.
create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.platform_settings (key, value) values
  ('ai', '{"provider": "anthropic", "model": "claude-opus-5-5", "max_tool_rounds": 6}'::jsonb);

-- DB-backed fixed-window rate limiter (works across serverless instances).
create table public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (key, window_start)
);

-- ===========================================================================
-- Authorisation helpers (SECURITY DEFINER so RLS policies can call them
-- without recursive policy evaluation).
-- ===========================================================================
create or replace function app.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_members m
    where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active'
  )
$$;

create or replace function app.member_role(p_org uuid) returns text
language sql stable security definer set search_path = '' as $$
  select m.role from public.organization_members m
  where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active'
$$;

create or replace function app.has_permission(p_org uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.organization_members m
    join public.role_permissions rp on rp.role = m.role
    where m.organization_id = p_org and m.user_id = auth.uid() and m.status = 'active'
      and rp.permission = p_permission
  )
$$;

create or replace function app.has_product(p_org uuid, p_product_code text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.organization_products op
    join public.platform_products pp on pp.id = op.product_id
    where op.organization_id = p_org and pp.code = p_product_code and op.status = 'active'
  )
$$;

-- Effective subscription state, computed from timestamps so no cron is needed
-- for correctness. Returns: demo | trialing | active | past_due | expired | none
create or replace function app.subscription_state(p_org uuid, p_product_code text default 'growth-os') returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  s record;
  v_demo boolean;
  grace interval := interval '3 days';
begin
  select is_demo into v_demo from public.organizations where id = p_org;
  if v_demo then return 'demo'; end if;

  select sub.* into s
  from public.subscriptions sub
  join public.platform_products pp on pp.id = sub.product_id
  where sub.organization_id = p_org and pp.code = p_product_code;

  if not found then return 'none'; end if;

  if s.status = 'trialing' then
    return case when s.trial_ends_at > now() then 'trialing' else 'expired' end;
  elsif s.status = 'active' then
    if s.current_period_end is null or s.current_period_end > now() then return 'active'; end if;
    return case when s.current_period_end + grace > now() then 'past_due' else 'expired' end;
  elsif s.status = 'past_due' then
    return case when coalesce(s.current_period_end, now()) + grace > now() then 'past_due' else 'expired' end;
  elsif s.status = 'canceled' then
    return case when s.current_period_end is not null and s.current_period_end > now() then 'active' else 'expired' end;
  end if;
  return 'expired';
end $$;

create or replace function app.is_writable(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.subscription_state(p_org) in ('demo', 'trialing', 'active', 'past_due')
$$;

-- Growth OS read access: member AND workspace entitled to the product.
create or replace function app.growth_read(p_org uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_product(p_org, 'growth-os') and app.has_permission(p_org, p_permission)
$$;

-- Growth OS write access: read access + permission + subscription allows writes.
create or replace function app.growth_write(p_org uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select app.has_product(p_org, 'growth-os') and app.has_permission(p_org, p_permission) and app.is_writable(p_org)
$$;

create or replace function app.assert_permission(p_org uuid, p_permission text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then perform app.raise('GO403', 'Not authenticated'); end if;
  if not app.has_product(p_org, 'growth-os') or not app.has_permission(p_org, p_permission) then
    perform app.raise('GO403', 'You do not have permission to perform this action (' || p_permission || ')');
  end if;
end $$;

create or replace function app.assert_writable(p_org uuid) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_writable(p_org) then
    perform app.raise('GO402', 'Your subscription is inactive. Your data is safe — upgrade to continue making changes.');
  end if;
end $$;

-- Effective plan for an org (demo orgs use the hidden demo plan).
create or replace function app.effective_plan_id(p_org uuid, p_product_code text default 'growth-os') returns uuid
language sql stable security definer set search_path = '' as $$
  select case when o.is_demo then
           (select sp.id from public.subscription_plans sp join public.platform_products pp on pp.id = sp.product_id
             where pp.code = p_product_code and sp.code = 'demo')
         else
           (select sub.plan_id from public.subscriptions sub join public.platform_products pp on pp.id = sub.product_id
             where sub.organization_id = p_org and pp.code = p_product_code)
         end
  from public.organizations o where o.id = p_org
$$;

-- Returns the numeric limit for an entitlement key. NULL = unlimited. 0 when disabled/missing.
create or replace function app.entitlement_limit(p_org uuid, p_key text) returns integer
language sql stable security definer set search_path = '' as $$
  select case
    when pe.plan_id is null then 0
    when not pe.enabled then 0
    else pe.limit_value
  end
  from (select app.effective_plan_id(p_org) as plan_id) ep
  left join public.plan_entitlements pe on pe.plan_id = ep.plan_id and pe.key = p_key
$$;

create or replace function app.entitlement_enabled(p_org uuid, p_key text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select pe.enabled from public.plan_entitlements pe
                   where pe.plan_id = app.effective_plan_id(p_org) and pe.key = p_key), false)
$$;

create or replace function app.is_platform_staff(p_roles text[] default null) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.platform_staff s where s.user_id = auth.uid()
                 and (p_roles is null or s.role = any(p_roles)))
$$;

create or replace function app.log_audit(
  p_org uuid, p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb default '{}'::jsonb,
  p_actor_type text default 'user'
) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (organization_id, actor_id, actor_type, action, entity_type, entity_id, metadata)
  values (p_org, auth.uid(), p_actor_type, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
$$;

-- Fixed-window limiter: returns true when the hit is allowed.
create or replace function public.rate_limit_hit(p_key text, p_window_seconds int, p_max int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into public.rate_limits (key, window_start, hits) values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  delete from public.rate_limits where window_start < now() - interval '1 day';
  return v_hits <= p_max;
end $$;
revoke execute on function public.rate_limit_hit(text, int, int) from anon, authenticated;

-- ===========================================================================
-- Row Level Security — platform tables
-- ===========================================================================
alter table public.profiles enable row level security;
alter table public.platform_staff enable row level security;
alter table public.platform_products enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.organization_invitations enable row level security;
alter table public.role_permissions enable row level security;
alter table public.organization_products enable row level security;
alter table public.subscription_plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.subscriptions enable row level security;
alter table public.payment_transactions enable row level security;
alter table public.payment_events enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.support_requests enable row level security;
alter table public.app_errors enable row level security;
alter table public.feature_flags enable row level security;
alter table public.platform_settings enable row level security;
alter table public.rate_limits enable row level security;

-- Anonymous visitors only ever see the public plan catalogue.
revoke all on all tables in schema public from anon;
grant select on public.platform_products, public.subscription_plans, public.plan_entitlements to anon;

-- profiles: see yourself and teammates; update only safe columns of your own row.
create policy profiles_select on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.organization_members a
    join public.organization_members b on a.organization_id = b.organization_id
    where a.user_id = auth.uid() and a.status = 'active' and b.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, default_organization_id) on public.profiles to authenticated;

create policy platform_staff_self on public.platform_staff for select to authenticated using (user_id = auth.uid());

create policy platform_products_read on public.platform_products for select to anon, authenticated using (is_active);

create policy organizations_select on public.organizations for select to authenticated using (app.is_member(id));
create policy organizations_update on public.organizations for update to authenticated
  using (app.has_permission(id, 'settings.manage')) with check (app.has_permission(id, 'settings.manage'));
revoke update on public.organizations from authenticated;
grant update (name, category, description, country, currency, timezone) on public.organizations to authenticated;

create policy members_select on public.organization_members for select to authenticated using (app.is_member(organization_id));
-- membership changes go through security-definer functions only

create policy invitations_select on public.organization_invitations for select to authenticated
  using (app.has_permission(organization_id, 'members.manage'));

create policy role_permissions_read on public.role_permissions for select to authenticated using (true);

create policy org_products_select on public.organization_products for select to authenticated using (app.is_member(organization_id));

create policy plans_read on public.subscription_plans for select to anon, authenticated using (is_active and is_public);
create policy plan_entitlements_read on public.plan_entitlements for select to anon, authenticated using (
  exists (select 1 from public.subscription_plans p where p.id = plan_id and p.is_active)
);

create policy subscriptions_select on public.subscriptions for select to authenticated using (app.is_member(organization_id));

create policy payment_tx_select on public.payment_transactions for select to authenticated
  using (app.has_permission(organization_id, 'billing.manage'));

create policy ai_usage_select on public.ai_usage_logs for select to authenticated
  using (app.has_permission(organization_id, 'settings.manage') or user_id = auth.uid());

create policy notifications_select on public.notifications for select to authenticated
  using (app.is_member(organization_id) and (user_id is null or user_id = auth.uid()));
create policy notifications_update on public.notifications for update to authenticated
  using (app.is_member(organization_id) and (user_id is null or user_id = auth.uid()))
  with check (app.is_member(organization_id) and (user_id is null or user_id = auth.uid()));
revoke update on public.notifications from authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy audit_select on public.audit_logs for select to authenticated
  using (organization_id is not null and app.has_permission(organization_id, 'audit.read'));

create policy support_insert on public.support_requests for insert to authenticated
  with check (user_id = auth.uid() and (organization_id is null or app.is_member(organization_id)));
create policy support_select on public.support_requests for select to authenticated using (user_id = auth.uid());

create policy flags_read on public.feature_flags for select to authenticated using (true);
-- app_errors, payment_events, platform_settings, rate_limits: service role only (no policies).

-- ===========================================================================
-- Workspace lifecycle RPCs
-- ===========================================================================
create or replace function app.slugify(p text) returns text
language sql immutable set search_path = '' as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p, '')), '[^a-z0-9]+', '-', 'g'))
$$;

-- Creates org + owner membership + Growth OS entitlement + 7-day trial.
create or replace function app.create_organization(
  p_owner uuid, p_name text, p_category text, p_description text,
  p_country text, p_currency text, p_timezone text, p_is_demo boolean
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_slug text;
  v_product uuid;
  v_plan uuid;
begin
  if p_name is null or char_length(trim(p_name)) < 2 then
    perform app.raise('GO400', 'Business name must be at least 2 characters');
  end if;
  v_slug := left(app.slugify(p_name), 40) || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);

  insert into public.organizations (name, slug, category, description, country, currency, timezone, is_demo, created_by)
  values (trim(p_name), v_slug, p_category, p_description,
          coalesce(nullif(p_country, ''), 'NG'), coalesce(nullif(p_currency, ''), 'NGN'),
          coalesce(nullif(p_timezone, ''), 'Africa/Lagos'), coalesce(p_is_demo, false), p_owner)
  returning id into v_org;

  insert into public.organization_members (organization_id, user_id, role) values (v_org, p_owner, 'owner');

  select id into v_product from public.platform_products where code = 'growth-os';
  insert into public.organization_products (organization_id, product_id) values (v_org, v_product);

  if not coalesce(p_is_demo, false) then
    select id into v_plan from public.subscription_plans where product_id = v_product and code = 'growth';
    insert into public.subscriptions (organization_id, product_id, plan_id, status, trial_started_at, trial_ends_at)
    values (v_org, v_product, v_plan, 'trialing', now(), now() + interval '7 days');
  end if;

  return v_org;
end $$;
