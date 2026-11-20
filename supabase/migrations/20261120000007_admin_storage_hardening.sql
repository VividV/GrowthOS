-- ============================================================================
-- 0007 PLATFORM ADMIN, STORAGE, PRIVILEGE HARDENING
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Internal administration (service role only; the admin app verifies the
-- caller is platform staff before using these). Aggregates only — no access
-- to tenant business records.
-- ---------------------------------------------------------------------------
create or replace function public.my_platform_role() returns text
language sql stable security definer set search_path = '' as $$
  select role from public.platform_staff where user_id = auth.uid()
$$;

create or replace function public.admin_log(p_actor uuid, p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb, p_org uuid default null)
returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_logs (organization_id, actor_id, actor_type, action, entity_type, entity_id, metadata)
  values (p_org, p_actor, 'platform_admin', p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb))
$$;

create or replace view public.admin_workspace_overview as
select
  o.id, o.name, o.country, o.currency, o.is_demo, o.created_at, o.archived_at,
  (select p.email from public.profiles p where p.id = o.created_by) as owner_email,
  s.status as subscription_status, app.subscription_state(o.id) as subscription_state,
  sp.code as plan_code, sp.name as plan_name, sp.price as plan_price, s.trial_ends_at, s.current_period_end,
  (select count(*) from public.organization_members m where m.organization_id = o.id and m.status = 'active') as members,
  (select count(*) from public.customers c where c.organization_id = o.id) as customer_count,
  (select count(*) from public.products pr where pr.organization_id = o.id) as product_count,
  (select count(*) from public.orders od where od.organization_id = o.id and od.status <> 'draft') as order_count,
  (select coalesce(sum(u.estimated_cost_usd), 0) from public.ai_usage_logs u where u.organization_id = o.id
     and u.created_at >= date_trunc('month', now())) as ai_cost_this_month_usd
from public.organizations o
left join public.subscriptions s on s.organization_id = o.id
left join public.subscription_plans sp on sp.id = s.plan_id;

create or replace function public.admin_platform_metrics() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'workspaces', (select count(*) from public.organizations where not is_demo),
    'demo_workspaces', (select count(*) from public.organizations where is_demo),
    'trialing', (select count(*) from public.organizations o where not o.is_demo and app.subscription_state(o.id) = 'trialing'),
    'active', (select count(*) from public.organizations o where not o.is_demo and app.subscription_state(o.id) in ('active', 'past_due')),
    'expired', (select count(*) from public.organizations o where not o.is_demo and app.subscription_state(o.id) = 'expired'),
    'mrr', (select coalesce(sum(sp.price), 0) from public.subscriptions s join public.subscription_plans sp on sp.id = s.plan_id
            where app.subscription_state(s.organization_id) in ('active', 'past_due')),
    'revenue_30d', (select coalesce(sum(amount), 0) from public.payment_transactions where status = 'success' and paid_at > now() - interval '30 days'),
    'ai_requests_30d', (select count(*) from public.ai_usage_logs where created_at > now() - interval '30 days'),
    'ai_cost_30d_usd', (select coalesce(sum(estimated_cost_usd), 0) from public.ai_usage_logs where created_at > now() - interval '30 days'),
    'open_support_requests', (select count(*) from public.support_requests where status in ('open', 'in_progress')),
    'errors_24h', (select count(*) from public.app_errors where created_at > now() - interval '24 hours'),
    'signups_by_day', (select coalesce(jsonb_agg(x order by x.day), '[]'::jsonb) from (
        select (created_at at time zone 'Africa/Lagos')::date as day, count(*) as n from public.profiles
        where created_at > now() - interval '30 days' group by 1) x)
  )
$$;

revoke all on public.admin_workspace_overview from anon, authenticated;
grant select on public.admin_workspace_overview to service_role;
revoke execute on function public.admin_platform_metrics() from public, anon, authenticated;
revoke execute on function public.admin_log(uuid, text, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.admin_platform_metrics() to service_role;
grant execute on function public.admin_log(uuid, text, text, text, jsonb, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Storage (only on Supabase, where the storage schema exists).
-- Path convention: <organization_id>/<folder>/<file>. Private bucket, signed URLs.
-- ---------------------------------------------------------------------------
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present — skipping bucket setup (plain Postgres test run)';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('business-assets', 'business-assets', false, 5242880, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy business_assets_read on storage.objects for select to authenticated
    using (bucket_id = 'business-assets' and app.is_member(((storage.foldername(name))[1])::uuid))
  $p$;
  execute $p$
    create policy business_assets_write on storage.objects for insert to authenticated
    with check (bucket_id = 'business-assets' and (
      app.growth_write(((storage.foldername(name))[1])::uuid, 'products.write')
      or app.growth_write(((storage.foldername(name))[1])::uuid, 'settings.manage')))
  $p$;
  execute $p$
    create policy business_assets_update on storage.objects for update to authenticated
    using (bucket_id = 'business-assets' and (
      app.growth_write(((storage.foldername(name))[1])::uuid, 'products.write')
      or app.growth_write(((storage.foldername(name))[1])::uuid, 'settings.manage')))
  $p$;
  execute $p$
    create policy business_assets_delete on storage.objects for delete to authenticated
    using (bucket_id = 'business-assets' and (
      app.growth_write(((storage.foldername(name))[1])::uuid, 'products.write')
      or app.growth_write(((storage.foldername(name))[1])::uuid, 'settings.manage')))
  $p$;
end $$;

-- ---------------------------------------------------------------------------
-- Privilege hardening (applied last so it covers every object above)
-- ---------------------------------------------------------------------------
-- Anonymous users: only the public plan catalogue.
revoke all on all tables in schema public from anon;
grant select on public.platform_products, public.subscription_plans, public.plan_entitlements to anon;
revoke execute on all functions in schema public from anon, public;

-- Internal app.* functions: callable only from inside SECURITY DEFINER code and RLS policies.
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function
  app.is_member(uuid), app.member_role(uuid), app.has_permission(uuid, text), app.has_product(uuid, text),
  app.subscription_state(uuid, text), app.is_writable(uuid), app.growth_read(uuid, text), app.growth_write(uuid, text),
  app.same_org(uuid, text, uuid), app.assignable(uuid, uuid), app.is_platform_staff(text[]),
  app.effective_plan_id(uuid, text), app.entitlement_limit(uuid, text), app.entitlement_enabled(uuid, text),
  app.raise(text, text), app.require_auth()
to authenticated;
grant execute on all functions in schema app to service_role;

-- Re-grant client RPCs to signed-in users (service-only ones stay revoked above).
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig, p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname not like 'billing\_%' and p.proname not like 'admin\_%' and p.proname <> 'rate_limit_hit'
  loop
    execute format('grant execute on function %s to authenticated', f.sig);
  end loop;
end $$;
grant execute on all functions in schema public to service_role;
