-- ============================================================================
-- 0005 BILLING
-- Plan catalogue (editable from the admin panel) + service-role-only functions
-- used by the Paystack webhook. Proof of payment = verified webhook +
-- server-side transaction verification; browser callbacks never activate plans.
-- ============================================================================

insert into public.subscription_plans (product_id, code, name, description, price, sort_order, is_public, features)
select pp.id, x.code, x.name, x.description, x.price, x.sort_order, x.is_public, x.features::jsonb
from public.platform_products pp,
(values
  ('starter', 'Starter', 'For solo sellers getting organised.', 3500, 1, true,
   '["1 user","50 products","100 customers","100 orders / month","Basic inventory & reports","Limited AI insights"]'),
  ('growth', 'Growth', 'For growing teams that need the full toolkit.', 7500, 2, true,
   '["3 users","500 products","Unlimited customers & orders","Advanced inventory & reports","More AI assistant usage","CSV exports"]'),
  ('pro', 'Pro', 'For established businesses that run on data.', 15000, 3, true,
   '["10 users","Unlimited products, customers & orders","Advanced reporting","Highest AI allowance","Priority support","Additional business insights"]'),
  ('demo', 'Demo', 'Internal plan for demonstration workspaces.', 0, 99, false, '[]')
) as x(code, name, description, price, sort_order, is_public, features)
where pp.code = 'growth-os';

insert into public.plan_entitlements (plan_id, key, enabled, limit_value)
select sp.id, e.key, e.enabled, e.limit_value
from public.subscription_plans sp
join (values
  ('starter', 'max_users', true, 1), ('starter', 'max_products', true, 50), ('starter', 'max_customers', true, 100),
  ('starter', 'max_orders_per_month', true, 100), ('starter', 'ai_messages_per_month', true, 20),
  ('starter', 'csv_export', false, null), ('starter', 'csv_import', true, null),
  ('starter', 'advanced_inventory', false, null), ('starter', 'advanced_reports', false, null),
  ('starter', 'priority_support', false, null), ('starter', 'advanced_insights', false, null),

  ('growth', 'max_users', true, 3), ('growth', 'max_products', true, 500), ('growth', 'max_customers', true, null),
  ('growth', 'max_orders_per_month', true, null), ('growth', 'ai_messages_per_month', true, 150),
  ('growth', 'csv_export', true, null), ('growth', 'csv_import', true, null),
  ('growth', 'advanced_inventory', true, null), ('growth', 'advanced_reports', true, null),
  ('growth', 'priority_support', false, null), ('growth', 'advanced_insights', false, null),

  ('pro', 'max_users', true, 10), ('pro', 'max_products', true, null), ('pro', 'max_customers', true, null),
  ('pro', 'max_orders_per_month', true, null), ('pro', 'ai_messages_per_month', true, 500),
  ('pro', 'csv_export', true, null), ('pro', 'csv_import', true, null),
  ('pro', 'advanced_inventory', true, null), ('pro', 'advanced_reports', true, null),
  ('pro', 'priority_support', true, null), ('pro', 'advanced_insights', true, null),

  ('demo', 'max_users', true, 1), ('demo', 'max_products', true, null), ('demo', 'max_customers', true, null),
  ('demo', 'max_orders_per_month', true, null), ('demo', 'ai_messages_per_month', true, 25),
  ('demo', 'csv_export', true, null), ('demo', 'csv_import', true, null),
  ('demo', 'advanced_inventory', true, null), ('demo', 'advanced_reports', true, null),
  ('demo', 'priority_support', false, null), ('demo', 'advanced_insights', true, null)
) as e(plan_code, key, enabled, limit_value) on e.plan_code = sp.code;

-- ---------------------------------------------------------------------------
-- Workspace context: one call that gives the app everything it needs to
-- authorise and render a request (role, permissions, plan, limits, usage).
-- ---------------------------------------------------------------------------
create or replace function public.workspace_context(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); v_role text; r jsonb;
begin
  v_role := app.member_role(p_org);
  if v_role is null then perform app.raise('GO403', 'You are not a member of this workspace'); end if;

  select jsonb_build_object(
    'organization', jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug, 'currency', o.currency,
        'timezone', o.timezone, 'country', o.country, 'category', o.category, 'is_demo', o.is_demo),
    'role', v_role,
    'permissions', (select coalesce(jsonb_agg(permission order by permission), '[]'::jsonb) from public.role_permissions where role = v_role),
    'has_growth_os', app.has_product(p_org, 'growth-os'),
    'subscription', (
      select jsonb_build_object('state', app.subscription_state(p_org), 'status', s.status, 'plan_code', sp.code,
          'plan_name', sp.name, 'price', sp.price, 'trial_ends_at', s.trial_ends_at, 'current_period_end', s.current_period_end,
          'cancel_at_period_end', s.cancel_at_period_end, 'pending_plan_id', s.pending_plan_id)
      from public.subscriptions s join public.subscription_plans sp on sp.id = s.plan_id
      where s.organization_id = p_org),
    'entitlements', (select coalesce(jsonb_object_agg(pe.key, jsonb_build_object('enabled', pe.enabled, 'limit', pe.limit_value)), '{}'::jsonb)
                     from public.plan_entitlements pe where pe.plan_id = app.effective_plan_id(p_org)),
    'writable', app.is_writable(p_org),
    'business', (select jsonb_build_object('logo_path', bp.logo_path, 'stock_policy', bp.stock_policy,
                   'allow_negative_stock', bp.allow_negative_stock, 'onboarded', bp.onboarding_completed_at is not null)
                 from public.business_profiles bp where bp.organization_id = p_org)
  ) into r
  from public.organizations o where o.id = p_org;
  return r;
end $$;

-- Usage counters for plan-limit displays.
create or replace function public.workspace_usage(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not app.is_member(p_org) then perform app.raise('GO403', 'You are not a member of this workspace'); end if;
  return jsonb_build_object(
    'users', (select count(*) from public.organization_members where organization_id = p_org and status = 'active'),
    'products', (select count(*) from public.products where organization_id = p_org and archived_at is null),
    'customers', (select count(*) from public.customers where organization_id = p_org and archived_at is null),
    'orders_this_month', (select count(*) from public.orders where organization_id = p_org
                          and date_trunc('month', order_date) = date_trunc('month', app.org_today(p_org))),
    'ai_messages_this_month', (select count(*) from public.ai_usage_logs where organization_id = p_org and request_kind = 'chat'
                               and status = 'ok' and created_at >= date_trunc('month', now()))
  );
end $$;

create or replace function public.ai_quota(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_limit int; v_used int;
begin
  if not app.has_permission(p_org, 'ai.use') then perform app.raise('GO403', 'You cannot use the AI assistant'); end if;
  v_limit := app.entitlement_limit(p_org, 'ai_messages_per_month');
  select count(*) into v_used from public.ai_usage_logs
    where organization_id = p_org and request_kind = 'chat' and status = 'ok' and created_at >= date_trunc('month', now());
  return jsonb_build_object('limit', v_limit, 'used', v_used,
    'remaining', case when v_limit is null then null else greatest(v_limit - v_used, 0) end,
    'allowed', app.is_writable(p_org) and (v_limit is null or v_used < v_limit));
end $$;

-- ---------------------------------------------------------------------------
-- Service-role-only billing operations
-- ---------------------------------------------------------------------------
create or replace function public.billing_create_checkout(p_org uuid, p_plan_code text, p_reference text, p_user uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_plan record; v_sub uuid; v_usage jsonb; e record;
begin
  select sp.* into v_plan from public.subscription_plans sp join public.platform_products pp on pp.id = sp.product_id
  where pp.code = 'growth-os' and sp.code = p_plan_code and sp.is_active and sp.is_public;
  if not found then perform app.raise('GO400', 'Unknown plan'); end if;
  select id into v_sub from public.subscriptions where organization_id = p_org;

  -- Downgrade guard: current usage must fit the target plan.
  v_usage := jsonb_build_object(
    'max_users', (select count(*) from public.organization_members where organization_id = p_org and status = 'active'),
    'max_products', (select count(*) from public.products where organization_id = p_org and archived_at is null),
    'max_customers', (select count(*) from public.customers where organization_id = p_org and archived_at is null));
  for e in select key, limit_value from public.plan_entitlements where plan_id = v_plan.id and key in ('max_users','max_products','max_customers') loop
    if e.limit_value is not null and (v_usage ->> e.key)::int > e.limit_value then
      perform app.raise('GO409', format('Your workspace has %s %s; the %s plan allows %s. Reduce usage before switching.',
        v_usage ->> e.key, replace(replace(e.key, 'max_', ''), '_', ' '), v_plan.name, e.limit_value));
    end if;
  end loop;

  insert into public.payment_transactions (organization_id, subscription_id, plan_id, reference, amount, currency, status, initiated_by)
  values (p_org, v_sub, v_plan.id, p_reference, v_plan.price, v_plan.currency, 'pending', p_user);
  return jsonb_build_object('amount', v_plan.price, 'currency', v_plan.currency, 'plan_name', v_plan.name,
                            'paystack_plan_code', v_plan.paystack_plan_code);
end $$;

-- Apply a verified successful charge. Idempotent on reference.
-- Returns: activated | renewed | already_processed | amount_mismatch | unknown_reference
create or replace function public.billing_apply_charge_success(
  p_reference text, p_amount numeric, p_currency text, p_paid_at timestamptz, p_channel text,
  p_customer_code text, p_subscription_code text, p_paystack_plan_code text, p_raw jsonb
) returns text
language plpgsql security definer set search_path = '' as $$
declare
  tx record; sub record; v_plan uuid; v_start timestamptz; v_result text;
begin
  select * into tx from public.payment_transactions where reference = p_reference for update;

  if not found then
    -- Recurring charge created by Paystack: locate subscription by code, else by customer.
    select * into sub from public.subscriptions
      where (p_subscription_code is not null and paystack_subscription_code = p_subscription_code)
         or (p_customer_code is not null and paystack_customer_code = p_customer_code)
      order by updated_at desc limit 1 for update;
    if not found then return 'unknown_reference'; end if;
    select id into v_plan from public.subscription_plans where paystack_plan_code = p_paystack_plan_code;
    insert into public.payment_transactions (organization_id, subscription_id, plan_id, reference, amount, currency, status)
    values (sub.organization_id, sub.id, coalesce(v_plan, sub.plan_id), p_reference, p_amount, coalesce(p_currency, 'NGN'), 'pending')
    returning * into tx;
    v_result := 'renewed';
  else
    if tx.status = 'success' then return 'already_processed'; end if;
    select * into sub from public.subscriptions where id = tx.subscription_id for update;
    v_result := 'activated';
  end if;

  if p_amount < tx.amount then
    update public.payment_transactions set status = 'failed', failure_reason = 'Amount mismatch', raw = p_raw where id = tx.id;
    return 'amount_mismatch';
  end if;

  update public.payment_transactions set status = 'success', paid_at = coalesce(p_paid_at, now()), channel = p_channel, raw = p_raw
  where id = tx.id;

  -- Extend from the end of a still-running paid period on renewals of the same plan; otherwise start now.
  v_start := case when v_result = 'renewed' and sub.status = 'active' and sub.current_period_end > now()
                       and sub.plan_id = tx.plan_id then sub.current_period_end
                  else coalesce(p_paid_at, now()) end;

  update public.subscriptions set
    plan_id = tx.plan_id,
    status = 'active',
    current_period_start = v_start,
    current_period_end = v_start + interval '1 month',
    cancel_at_period_end = false,
    canceled_at = null,
    pending_plan_id = null,
    paystack_customer_code = coalesce(p_customer_code, paystack_customer_code),
    paystack_subscription_code = coalesce(p_subscription_code, paystack_subscription_code)
  where id = sub.id;

  insert into public.audit_logs (organization_id, actor_type, action, entity_type, entity_id, metadata)
  values (sub.organization_id, 'system', 'subscription.' || v_result, 'payment_transaction', tx.id::text,
          jsonb_build_object('reference', p_reference, 'amount', p_amount));
  insert into public.notifications (organization_id, type, title, body, link)
  values (sub.organization_id, 'billing', 'Payment received',
          'Your subscription is active until ' || to_char(v_start + interval '1 month', 'DD Mon YYYY') || '.', '/settings/billing');
  return v_result;
end $$;

create or replace function public.billing_attach_subscription(p_customer_code text, p_subscription_code text, p_email_token text, p_paystack_plan_code text)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  update public.subscriptions set paystack_subscription_code = p_subscription_code, paystack_email_token = p_email_token
  where id = (select id from public.subscriptions where paystack_customer_code = p_customer_code order by updated_at desc limit 1)
  returning id into v_id;
  return case when v_id is null then 'unknown_customer' else 'attached' end;
end $$;

create or replace function public.billing_mark_failed(p_subscription_code text, p_customer_code text, p_reason text) returns text
language plpgsql security definer set search_path = '' as $$
declare sub record;
begin
  select * into sub from public.subscriptions
  where (p_subscription_code is not null and paystack_subscription_code = p_subscription_code)
     or (p_customer_code is not null and paystack_customer_code = p_customer_code)
  order by updated_at desc limit 1;
  if not found then return 'unknown_subscription'; end if;
  update public.subscriptions set status = 'past_due' where id = sub.id and status = 'active';
  insert into public.notifications (organization_id, type, title, body, link)
  values (sub.organization_id, 'billing', 'Payment failed',
          'We could not renew your subscription. Update your payment to avoid interruption.', '/settings/billing');
  insert into public.audit_logs (organization_id, actor_type, action, metadata)
  values (sub.organization_id, 'system', 'subscription.payment_failed', jsonb_build_object('reason', p_reason));
  return 'marked_past_due';
end $$;

create or replace function public.billing_mark_canceled(p_subscription_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_org uuid;
begin
  update public.subscriptions set status = 'canceled', cancel_at_period_end = true, canceled_at = coalesce(canceled_at, now())
  where paystack_subscription_code = p_subscription_code and status in ('active', 'past_due')
  returning organization_id into v_org;
  if v_org is null then return 'unknown_subscription'; end if;
  insert into public.audit_logs (organization_id, actor_type, action) values (v_org, 'system', 'subscription.canceled');
  return 'canceled';
end $$;

-- Mark stale state (status column) to match computed state; used by the daily cron.
create or replace function public.billing_sweep_expired() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with x as (
    update public.subscriptions s set status = 'expired'
    where s.status in ('trialing', 'active', 'past_due', 'canceled')
      and app.subscription_state(s.organization_id) = 'expired'
    returning 1)
  select count(*) into n from x;
  return n;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'billing_create_checkout(uuid,text,text,uuid)',
    'billing_apply_charge_success(text,numeric,text,timestamptz,text,text,text,text,jsonb)',
    'billing_attach_subscription(text,text,text,text)',
    'billing_mark_failed(text,text,text)',
    'billing_mark_canceled(text)',
    'billing_sweep_expired()']
  loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
