-- ============================================================================
-- 0004 REPORTING
-- Single source of truth for every number shown in the dashboard, finance
-- pages and AI assistant. Definitions (all dates in the workspace timezone):
--
--   gross_sales      Σ order.total for non-draft, non-cancelled orders dated in range
--                    (after line + order discounts, including delivery fees)
--   returns          Σ return credits with return_date in range
--   net_sales        gross_sales − returns                      ("Revenue")
--   cash_received    Σ payments − Σ refunds with paid_at in range (voided excluded)
--   outstanding      Σ positive balance_due on open orders (as of now, all dates)
--   cogs             Σ item cost snapshots of orders in range − cost reversed by restocked returns in range
--   gross_profit     net_sales − cogs
--   expenses         Σ non-voided expenses dated in range
--   other_income     Σ non-voided other income dated in range
--   net_profit       gross_profit + other_income − expenses      ("Estimated net profit")
--
-- Unpaid orders count towards sales but never towards cash received.
-- ============================================================================

create or replace function app.assert_report_access(p_org uuid, p_permission text) returns void
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_permission(p_org, p_permission);
end $$;

create or replace function app.validate_range(p_from date, p_to date) returns void
language plpgsql immutable set search_path = '' as $$
begin
  if p_from is null or p_to is null then perform app.raise('GO400', 'A date range is required'); end if;
  if p_from > p_to then perform app.raise('GO400', 'Start date must be before end date'); end if;
  if p_to - p_from > 3660 then perform app.raise('GO400', 'Date range is too large'); end if;
end $$;

-- Core computation without permission checks (used by wrappers below and by tests).
create or replace function app.sales_figures(p_org uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz text := (select timezone from public.organizations where id = p_org);
  r jsonb;
begin
  with o as (
    select * from public.orders
    where organization_id = p_org and order_date between p_from and p_to and status not in ('draft', 'cancelled')
  ), pay as (
    select coalesce(sum(amount) filter (where kind = 'payment'), 0) as received,
           coalesce(sum(amount) filter (where kind = 'refund'), 0) as refunded
    from public.payments
    where organization_id = p_org and voided_at is null
      and (paid_at at time zone v_tz)::date between p_from and p_to
  ), ret as (
    select coalesce(sum(credit_amount), 0) as credit, coalesce(sum(cost_reversed), 0) as cost_reversed, count(*) as n
    from public.order_returns where organization_id = p_org and return_date between p_from and p_to
  )
  select jsonb_build_object(
    'order_count', (select count(*) from o),
    'gross_sales', (select coalesce(sum(total), 0) from o),
    'discounts', (select coalesce(sum(discount_amount), 0) + coalesce((select sum(oi.discount_amount) from public.order_items oi where oi.order_id in (select id from o)), 0) from o),
    'delivery_fees', (select coalesce(sum(delivery_fee), 0) from o),
    'returns', (select credit from ret),
    'return_count', (select n from ret),
    'net_sales', (select coalesce(sum(total), 0) from o) - (select credit from ret),
    'payments_received', (select received from pay),
    'refunds', (select refunded from pay),
    'cash_received', (select received - refunded from pay),
    'cogs', (select coalesce(sum(cost_total), 0) from o) - (select cost_reversed from ret),
    'outstanding_on_period_orders', (select coalesce(sum(greatest(balance_due, 0)), 0) from o),
    'outstanding_total', (select coalesce(sum(greatest(balance_due, 0)), 0) from public.orders
                          where organization_id = p_org and status not in ('draft', 'cancelled')),
    'customers_owing', (select count(distinct customer_id) from public.orders
                        where organization_id = p_org and status not in ('draft', 'cancelled') and balance_due > 0),
    'average_order_value', (select case when count(*) > 0 then round(sum(total) / count(*), 2) else 0 end from o),
    'items_missing_cost', (select count(*) from public.order_items oi where oi.order_id in (select id from o) and oi.unit_cost = 0)
  ) into r;
  return r;
end $$;

-- Sales + operational summary. Permission: reports.read
create or replace function public.report_sales_summary(p_org uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s jsonb;
begin
  perform app.assert_report_access(p_org, 'reports.read');
  perform app.validate_range(p_from, p_to);
  s := app.sales_figures(p_org, p_from, p_to);
  return (s - 'cogs' - 'items_missing_cost') || jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'currency', (select currency from public.organizations where id = p_org),
    'orders_by_status', coalesce((select jsonb_object_agg(status, n) from (
        select status, count(*) n from public.orders
        where organization_id = p_org and order_date between p_from and p_to group by status) x), '{}'::jsonb),
    'open_orders', (select jsonb_build_object(
        'confirmed', count(*) filter (where status = 'confirmed'),
        'processing', count(*) filter (where status = 'processing'),
        'ready', count(*) filter (where status = 'ready'),
        'dispatched', count(*) filter (where status = 'dispatched'))
      from public.orders where organization_id = p_org),
    'total_customers', (select count(*) from public.customers where organization_id = p_org and archived_at is null),
    'new_customers', (select count(*) from public.customers c join public.organizations og on og.id = c.organization_id
                      where c.organization_id = p_org and c.archived_at is null
                        and (c.created_at at time zone og.timezone)::date between p_from and p_to),
    'low_stock_count', (select count(*) from public.variant_stock vs where vs.organization_id = p_org and vs.is_sellable
                        and vs.quantity_available <= vs.low_stock_threshold)
  );
end $$;

-- Full P&L style summary. Permission: finance.read
create or replace function public.report_financial_summary(p_org uuid, p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare s jsonb; v_exp numeric(14,2); v_inc numeric(14,2); v_gross numeric(14,2); v_net_sales numeric(14,2);
begin
  perform app.assert_report_access(p_org, 'finance.read');
  perform app.validate_range(p_from, p_to);
  s := app.sales_figures(p_org, p_from, p_to);
  select coalesce(sum(amount), 0) into v_exp from public.expenses
    where organization_id = p_org and voided_at is null and expense_date between p_from and p_to;
  select coalesce(sum(amount), 0) into v_inc from public.income_records
    where organization_id = p_org and voided_at is null and income_date between p_from and p_to;
  v_net_sales := (s ->> 'net_sales')::numeric;
  v_gross := v_net_sales - (s ->> 'cogs')::numeric;
  return s || jsonb_build_object(
    'period', jsonb_build_object('from', p_from, 'to', p_to),
    'currency', (select currency from public.organizations where id = p_org),
    'gross_profit', v_gross,
    'gross_margin_pct', case when v_net_sales > 0 then round(v_gross / v_net_sales * 100, 1) end,
    'operating_expenses', v_exp,
    'other_income', v_inc,
    'net_profit', v_gross + v_inc - v_exp,
    'expense_count', (select count(*) from public.expenses where organization_id = p_org and voided_at is null
                      and expense_date between p_from and p_to)
  );
end $$;

-- Time series for charts. bucket: day | week | month
create or replace function public.report_timeseries(p_org uuid, p_from date, p_to date, p_bucket text default 'day')
returns table (bucket date, sales numeric, cash_received numeric, expenses numeric, orders bigint)
language plpgsql stable security definer set search_path = '' as $$
declare v_tz text; v_finance boolean;
begin
  perform app.assert_report_access(p_org, 'reports.read');
  perform app.validate_range(p_from, p_to);
  if p_bucket not in ('day', 'week', 'month') then perform app.raise('GO400', 'Invalid bucket'); end if;
  v_tz := (select timezone from public.organizations where id = p_org);
  v_finance := app.has_permission(p_org, 'finance.read');
  return query
  with b as (
    select distinct date_trunc(p_bucket, d)::date as bucket
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  )
  select b.bucket,
    coalesce((select sum(o.total) from public.orders o where o.organization_id = p_org
      and o.status not in ('draft', 'cancelled') and date_trunc(p_bucket, o.order_date)::date = b.bucket
      and o.order_date between p_from and p_to), 0)
    - coalesce((select sum(r.credit_amount) from public.order_returns r where r.organization_id = p_org
      and date_trunc(p_bucket, r.return_date)::date = b.bucket and r.return_date between p_from and p_to), 0),
    coalesce((select sum(case when p.kind = 'payment' then p.amount else -p.amount end) from public.payments p
      where p.organization_id = p_org and p.voided_at is null
      and date_trunc(p_bucket, (p.paid_at at time zone v_tz)::date)::date = b.bucket
      and (p.paid_at at time zone v_tz)::date between p_from and p_to), 0),
    case when v_finance then coalesce((select sum(e.amount) from public.expenses e where e.organization_id = p_org
      and e.voided_at is null and date_trunc(p_bucket, e.expense_date)::date = b.bucket
      and e.expense_date between p_from and p_to), 0) end,
    (select count(*) from public.orders o where o.organization_id = p_org and o.status not in ('draft', 'cancelled')
      and date_trunc(p_bucket, o.order_date)::date = b.bucket and o.order_date between p_from and p_to)
  from b order by b.bucket;
end $$;

-- Top products. p_sort: revenue | quantity | profit (profit requires finance.read)
create or replace function public.report_top_products(p_org uuid, p_from date, p_to date, p_limit int default 5, p_sort text default 'revenue')
returns table (product_id uuid, product_name text, quantity bigint, revenue numeric, cogs numeric, profit numeric, margin_pct numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_finance boolean;
begin
  perform app.assert_report_access(p_org, 'reports.read');
  perform app.validate_range(p_from, p_to);
  if p_sort not in ('revenue', 'quantity', 'profit') then perform app.raise('GO400', 'Invalid sort'); end if;
  v_finance := app.has_permission(p_org, 'finance.read');
  if p_sort = 'profit' and not v_finance then perform app.raise('GO403', 'You do not have permission to view profit'); end if;
  return query
  select x.product_id, x.product_name, x.quantity, x.revenue,
         case when v_finance then x.cogs end, case when v_finance then x.revenue - x.cogs end,
         case when v_finance and x.revenue > 0 then round((x.revenue - x.cogs) / x.revenue * 100, 1) end
  from (
    select oi.product_id, max(p.name) as product_name,
           sum(oi.quantity - oi.returned_quantity)::bigint as quantity,
           sum(round(oi.line_total / oi.quantity * (oi.quantity - oi.returned_quantity)
               * case when o.subtotal > 0 then (o.subtotal - o.discount_amount) / o.subtotal else 1 end, 2)) as revenue,
           sum(oi.unit_cost * (oi.quantity - oi.returned_quantity)) as cogs
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.products p on p.id = oi.product_id
    where o.organization_id = p_org and o.status not in ('draft', 'cancelled') and o.order_date between p_from and p_to
    group by oi.product_id
  ) x
  order by case p_sort when 'quantity' then x.quantity::numeric when 'profit' then x.revenue - x.cogs else x.revenue end desc
  limit least(greatest(coalesce(p_limit, 5), 1), 50);
end $$;

create or replace function public.report_low_stock(p_org uuid, p_limit int default 20)
returns table (variant_id uuid, product_id uuid, product_name text, variant_name text, sku text,
               quantity_on_hand int, quantity_reserved int, quantity_available int, low_stock_threshold int)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_report_access(p_org, 'products.read');
  return query
  select vs.variant_id, vs.product_id, vs.product_name, case when vs.has_variants then vs.variant_name end, vs.sku,
         vs.quantity_on_hand, vs.quantity_reserved, vs.quantity_available, vs.low_stock_threshold
  from public.variant_stock vs
  where vs.organization_id = p_org and vs.is_sellable and vs.quantity_available <= vs.low_stock_threshold
  order by vs.quantity_available asc, vs.product_name
  limit least(greatest(coalesce(p_limit, 20), 1), 200);
end $$;

create or replace function public.report_customer_balances(p_org uuid, p_limit int default 20)
returns table (customer_id uuid, customer_name text, phone text, open_orders bigint, outstanding numeric, oldest_order_date date)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_report_access(p_org, 'customers.read');
  perform app.assert_report_access(p_org, 'orders.read');
  return query
  select c.id, c.full_name, c.phone, count(o.id), sum(o.balance_due), min(o.order_date)
  from public.orders o join public.customers c on c.id = o.customer_id
  where o.organization_id = p_org and o.status not in ('draft', 'cancelled') and o.balance_due > 0
  group by c.id
  order by sum(o.balance_due) desc
  limit least(greatest(coalesce(p_limit, 20), 1), 200);
end $$;

create or replace function public.report_expense_breakdown(p_org uuid, p_from date, p_to date)
returns table (category_id uuid, category_name text, total numeric, entries bigint)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_report_access(p_org, 'finance.read');
  perform app.validate_range(p_from, p_to);
  return query
  select c.id, c.name, sum(e.amount), count(*)
  from public.expenses e join public.expense_categories c on c.id = e.category_id
  where e.organization_id = p_org and e.voided_at is null and e.expense_date between p_from and p_to
  group by c.id order by sum(e.amount) desc;
end $$;

-- Customers whose last purchase is older than p_days (or who never purchased).
create or replace function public.report_inactive_customers(p_org uuid, p_days int default 60, p_limit int default 20)
returns table (customer_id uuid, customer_name text, phone text, last_purchase_date date, total_orders bigint, total_spent numeric)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_report_access(p_org, 'customers.read');
  return query
  select c.id, c.full_name, c.phone, max(o.order_date), count(o.id), coalesce(sum(o.total - o.returns_total), 0)
  from public.customers c
  left join public.orders o on o.customer_id = c.id and o.status not in ('draft', 'cancelled')
  where c.organization_id = p_org and c.archived_at is null
  group by c.id
  having count(o.id) > 0 and max(o.order_date) < app.org_today(p_org) - greatest(coalesce(p_days, 60), 1)
  order by coalesce(sum(o.total - o.returns_total), 0) desc
  limit least(greatest(coalesce(p_limit, 20), 1), 200);
end $$;

create or replace function public.report_customer_history(p_org uuid, p_customer uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform app.assert_report_access(p_org, 'customers.read');
  perform app.assert_report_access(p_org, 'orders.read');
  if not exists (select 1 from public.customers where id = p_customer and organization_id = p_org) then
    perform app.raise('GO404', 'Customer not found');
  end if;
  return (
    select jsonb_build_object(
      'customer', (select jsonb_build_object('id', c.id, 'name', c.full_name, 'code', c.customer_code, 'phone', c.phone,
                     'email', c.email, 'location', c.location, 'since', c.created_at::date)
                   from public.customers c where c.id = p_customer),
      'summary', (select jsonb_build_object('total_orders', cs.total_orders, 'total_spent', cs.total_spent,
                     'outstanding_balance', cs.outstanding_balance, 'last_purchase_date', cs.last_purchase_date)
                  from public.customer_summaries cs where cs.id = p_customer),
      'recent_orders', coalesce((select jsonb_agg(x) from (
          select o.order_number, o.order_date, o.status, o.payment_status, o.total, o.balance_due,
                 (select string_agg(oi.product_name || ' ×' || oi.quantity, ', ') from public.order_items oi where oi.order_id = o.id) as items
          from public.orders o where o.customer_id = p_customer and o.status <> 'draft'
          order by o.order_date desc, o.created_at desc limit 10) x), '[]'::jsonb),
      'favourite_products', coalesce((select jsonb_agg(x) from (
          select oi.product_name, sum(oi.quantity) as quantity
          from public.order_items oi join public.orders o on o.id = oi.order_id
          where o.customer_id = p_customer and o.status not in ('draft', 'cancelled')
          group by oi.product_name order by sum(oi.quantity) desc limit 5) x), '[]'::jsonb)
    )
  );
end $$;

create or replace function public.report_recent_activity(p_org uuid, p_limit int default 15)
returns table (kind text, occurred_at timestamptz, title text, detail text, amount numeric, ref_id uuid)
language plpgsql stable security definer set search_path = '' as $$
declare v_lim int := least(greatest(coalesce(p_limit, 15), 1), 100);
begin
  perform app.assert_report_access(p_org, 'orders.read');
  return query
  select * from (
    (select 'order'::text, o.created_at, 'Order ' || o.order_number, coalesce(c.full_name, 'Walk-in customer') || ' · ' || o.status,
            o.total, o.id
     from public.orders o left join public.customers c on c.id = o.customer_id
     where o.organization_id = p_org and o.status <> 'draft' order by o.created_at desc limit v_lim)
    union all
    (select case when p.kind = 'refund' then 'refund' else 'payment' end, p.created_at,
            case when p.kind = 'refund' then 'Refund on ' else 'Payment for ' end || o.order_number,
            coalesce(c.full_name, 'Walk-in customer') || ' · ' || replace(p.method, '_', ' '), p.amount, o.id
     from public.payments p join public.orders o on o.id = p.order_id left join public.customers c on c.id = p.customer_id
     where p.organization_id = p_org and p.voided_at is null order by p.created_at desc limit v_lim)
    union all
    (select 'customer'::text, c.created_at, 'New customer', c.full_name, null::numeric, c.id
     from public.customers c where c.organization_id = p_org and c.archived_at is null order by c.created_at desc limit v_lim)
  ) a order by 2 desc limit v_lim;
end $$;

-- ---------------------------------------------------------------------------
-- Follow-up suggestions (not inserted — the user accepts them into tasks)
-- ---------------------------------------------------------------------------
create or replace function public.suggest_follow_ups(p_org uuid)
returns table (suggestion_key text, kind text, title text, reason text, customer_id uuid, customer_name text,
               order_id uuid, priority text, amount numeric)
language plpgsql stable security definer set search_path = '' as $$
declare v_today date;
begin
  perform app.assert_report_access(p_org, 'tasks.read');
  perform app.assert_report_access(p_org, 'orders.read');
  v_today := app.org_today(p_org);
  return query
  select s.* from (
    -- outstanding balances on confirmed+ orders older than 2 days
    select 'balance:' || o.id as sk, 'outstanding_payment' as k, 'Collect payment for ' || o.order_number as t,
           format('%s %s outstanding since %s', (select currency from public.organizations where id = p_org), o.balance_due, o.order_date) as r,
           o.customer_id as cid, c.full_name as cname, o.id as oid,
           case when v_today - o.order_date > 14 then 'high' else 'medium' end as pr, o.balance_due as amt
    from public.orders o left join public.customers c on c.id = o.customer_id
    where o.organization_id = p_org and o.status not in ('draft', 'cancelled') and o.balance_due > 0
      and o.order_date <= v_today - 2
    union all
    -- abandoned enquiries: draft orders untouched for 3+ days
    select 'draft:' || o.id, 'abandoned_enquiry', 'Follow up on enquiry ' || o.order_number,
           format('Draft order not confirmed since %s', o.updated_at::date), o.customer_id, c.full_name, o.id, 'medium', o.total
    from public.orders o left join public.customers c on c.id = o.customer_id
    where o.organization_id = p_org and o.status = 'draft' and o.updated_at < now() - interval '3 days'
    union all
    -- pending orders: past expected delivery or open for 5+ days
    select 'pending:' || o.id, 'pending_order', 'Update customer on ' || o.order_number,
           case when o.expected_delivery_date < v_today then format('Expected delivery was %s', o.expected_delivery_date)
                else format('Order %s since %s', o.status, o.confirmed_at::date) end,
           o.customer_id, c.full_name, o.id,
           case when o.expected_delivery_date < v_today then 'high' else 'medium' end, o.total
    from public.orders o left join public.customers c on c.id = o.customer_id
    where o.organization_id = p_org and o.status in ('confirmed', 'processing', 'ready')
      and (o.expected_delivery_date < v_today or o.confirmed_at < now() - interval '5 days')
    union all
    -- repeat purchase due: 2+ orders and the average gap has elapsed
    select 'repeat:' || x.customer_id || ':' || x.last_date, 'repeat_purchase', 'Repeat purchase due: ' || x.full_name,
           format('Buys about every %s days; last order %s', x.avg_gap, x.last_date), x.customer_id, x.full_name, null::uuid, 'low', null::numeric
    from (
      select c.id as customer_id, c.full_name, max(o.order_date) as last_date,
             ((max(o.order_date) - min(o.order_date)) / nullif(count(*) - 1, 0))::int as avg_gap
      from public.customers c join public.orders o on o.customer_id = c.id and o.status not in ('draft', 'cancelled')
      where c.organization_id = p_org and c.archived_at is null
      group by c.id having count(*) >= 2
    ) x
    where x.avg_gap between 7 and 120 and x.last_date + x.avg_gap <= v_today and x.last_date > v_today - 120
    union all
    -- lapsed: purchased before, nothing in 60 days
    select 'lapsed:' || ic.customer_id || ':' || ic.last_purchase_date, 'inactive_customer', 'Re-engage ' || ic.customer_name,
           format('No purchase since %s (%s orders, %s spent)', ic.last_purchase_date, ic.total_orders, ic.total_spent),
           ic.customer_id, ic.customer_name, null::uuid, 'low', ic.total_spent
    from public.report_inactive_customers(p_org, 60, 20) ic
  ) s
  where not exists (
    select 1 from public.follow_up_tasks t
    where t.organization_id = p_org and t.suggestion_key = s.sk and t.status in ('open', 'in_progress')
  )
  limit 50;
end $$;
