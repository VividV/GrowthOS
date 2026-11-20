-- ============================================================================
-- 0003 GROWTH OS BUSINESS FUNCTIONS
-- Pattern: app.do_*  = internal implementation (takes explicit actor, no auth checks)
--          public.*  = API wrapper: authenticates, checks permission + subscription,
--                      then delegates. All run in a single transaction.
-- ============================================================================

create or replace function app.org_today(p_org uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (now() at time zone coalesce((select timezone from public.organizations where id = p_org), 'Africa/Lagos'))::date
$$;

create or replace function app.require_auth() returns uuid
language plpgsql stable set search_path = '' as $$
declare v uuid := auth.uid();
begin
  if v is null then perform app.raise('GO403', 'Not authenticated'); end if;
  return v;
end $$;

-- ---------------------------------------------------------------------------
-- Plan limits (enforced on insert, regardless of client)
-- ---------------------------------------------------------------------------
create or replace function app.enforce_plan_limit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_key text := tg_argv[0];
  v_limit int;
  v_count int;
  v_label text;
begin
  v_limit := app.entitlement_limit(new.organization_id, v_key);
  if v_limit is null then return new; end if;  -- unlimited

  if v_key = 'max_customers' then
    select count(*) into v_count from public.customers where organization_id = new.organization_id and archived_at is null;
    v_label := 'customers';
  elsif v_key = 'max_products' then
    select count(*) into v_count from public.products where organization_id = new.organization_id and archived_at is null;
    v_label := 'products';
  elsif v_key = 'max_orders_per_month' then
    select count(*) into v_count from public.orders
      where organization_id = new.organization_id
        and date_trunc('month', order_date) = date_trunc('month', app.org_today(new.organization_id));
    v_label := 'orders this month';
  elsif v_key = 'max_users' then
    select count(*) into v_count from public.organization_members where organization_id = new.organization_id and status = 'active';
    v_label := 'team members';
  else
    return new;
  end if;

  if v_count >= v_limit then
    perform app.raise('GO402', format('Your plan allows %s %s. Upgrade your plan to add more.', v_limit, v_label));
  end if;
  return new;
end $$;

create trigger customers_plan_limit before insert on public.customers
  for each row execute function app.enforce_plan_limit('max_customers');
create trigger products_plan_limit before insert on public.products
  for each row execute function app.enforce_plan_limit('max_products');
create trigger orders_plan_limit before insert on public.orders
  for each row execute function app.enforce_plan_limit('max_orders_per_month');
create trigger members_plan_limit before insert on public.organization_members
  for each row when (new.role <> 'owner')
  execute function app.enforce_plan_limit('max_users');

-- ---------------------------------------------------------------------------
-- Workspace creation & onboarding
-- ---------------------------------------------------------------------------
create or replace function app.seed_org_defaults(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.business_profiles (organization_id) values (p_org) on conflict do nothing;
  insert into public.expense_categories (organization_id, name, is_system)
  select p_org, n, true from unnest(array['Rent', 'Salaries', 'Transport', 'Marketing', 'Utilities', 'Packaging', 'Other']) n
  on conflict do nothing;
end $$;

-- p: {name, category, description, country, currency, timezone, business_email, phone, address,
--     business_type, products_sold, product_count_range, employee_count_range}
create or replace function public.create_workspace(p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := app.require_auth();
  v_org uuid;
begin
  if (select count(*) from public.organization_members where user_id = v_user and role = 'owner') >= 10 then
    perform app.raise('GO400', 'You have reached the maximum number of workspaces');
  end if;

  v_org := app.create_organization(v_user, p ->> 'name', p ->> 'category', p ->> 'description',
                                   p ->> 'country', p ->> 'currency', p ->> 'timezone', false);
  perform app.seed_org_defaults(v_org);

  update public.business_profiles set
    business_email = nullif(trim(p ->> 'business_email'), ''),
    phone = nullif(trim(p ->> 'phone'), ''),
    address = nullif(trim(p ->> 'address'), ''),
    business_type = nullif(p ->> 'business_type', ''),
    products_sold = nullif(trim(p ->> 'products_sold'), ''),
    product_count_range = nullif(p ->> 'product_count_range', ''),
    employee_count_range = nullif(p ->> 'employee_count_range', ''),
    onboarding_completed_at = now()
  where organization_id = v_org;

  update public.profiles set default_organization_id = v_org where id = v_user;
  perform app.log_audit(v_org, 'workspace.created', 'organization', v_org::text, jsonb_build_object('name', p ->> 'name'));
  return v_org;
end $$;

-- ---------------------------------------------------------------------------
-- Stock ledger primitive
-- ---------------------------------------------------------------------------
create or replace function app.apply_stock_movement(
  p_variant uuid, p_type text, p_qty_change int, p_reserved_change int,
  p_reason text, p_order uuid, p_actor uuid
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v record;
  v_allow_negative boolean;
  v_new_on_hand int;
  v_new_reserved int;
begin
  select pv.*, p.name as product_name into v
  from public.product_variants pv join public.products p on p.id = pv.product_id
  where pv.id = p_variant for update of pv;
  if not found then perform app.raise('GO404', 'Product variant not found'); end if;

  select bp.allow_negative_stock into v_allow_negative
  from public.business_profiles bp where bp.organization_id = v.organization_id;

  v_new_on_hand := v.quantity_on_hand + coalesce(p_qty_change, 0);
  v_new_reserved := v.quantity_reserved + coalesce(p_reserved_change, 0);

  if v_new_reserved < 0 then v_new_reserved := 0; end if;

  if not coalesce(v_allow_negative, false) then
    if v_new_on_hand < 0 then
      perform app.raise('GO409', format('Insufficient stock for %s (%s): %s on hand', v.product_name, v.sku, v.quantity_on_hand));
    end if;
    if coalesce(p_reserved_change, 0) > 0 and v_new_on_hand - v_new_reserved < 0 then
      perform app.raise('GO409', format('Insufficient stock for %s (%s): %s available', v.product_name, v.sku,
                                        v.quantity_on_hand - v.quantity_reserved));
    end if;
  end if;

  perform set_config('app.stock_write', 'on', true);
  update public.product_variants set quantity_on_hand = v_new_on_hand, quantity_reserved = v_new_reserved
  where id = p_variant;
  perform set_config('app.stock_write', 'off', true);

  insert into public.inventory_movements (organization_id, product_id, variant_id, movement_type,
    quantity_change, reserved_change, quantity_after, reserved_after, reason, order_id, created_by)
  values (v.organization_id, v.product_id, p_variant, p_type,
    coalesce(p_qty_change, 0), v_new_reserved - v.quantity_reserved, v_new_on_hand, v_new_reserved, p_reason, p_order, p_actor);
end $$;

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create or replace function app.generate_sku(p_org uuid, p_name text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_base text; v_sku text; i int := 0;
begin
  v_base := upper(left(regexp_replace(coalesce(p_name, 'ITEM'), '[^A-Za-z0-9]', '', 'g'), 6));
  if v_base = '' then v_base := 'ITEM'; end if;
  loop
    v_sku := v_base || '-' || lpad((floor(random() * 9000) + 1000)::int::text, 4, '0');
    exit when not exists (select 1 from public.product_variants where organization_id = p_org and lower(sku) = lower(v_sku));
    i := i + 1;
    if i > 20 then v_sku := v_base || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8); exit; end if;
  end loop;
  return v_sku;
end $$;

create or replace function app.do_add_variant(p_org uuid, p_product uuid, v jsonb, p_actor uuid, p_is_default boolean)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_qty int := coalesce((v ->> 'opening_quantity')::int, 0);
  v_sku text := nullif(trim(v ->> 'sku'), '');
  v_name text;
begin
  if v_qty < 0 then perform app.raise('GO400', 'Opening quantity cannot be negative'); end if;
  if v_sku is null then v_sku := app.generate_sku(p_org, (select name from public.products where id = p_product)); end if;
  if exists (select 1 from public.product_variants where organization_id = p_org and lower(sku) = lower(v_sku)) then
    perform app.raise('GO409', format('SKU %s is already in use', v_sku));
  end if;
  v_name := coalesce(nullif(trim(v ->> 'name'), ''),
             nullif((select string_agg(value, ' / ' order by case lower(key) when 'colour' then 1 when 'color' then 1 when 'size' then 2
                                                              when 'length' then 3 else 4 end, key)
                    from jsonb_each_text(coalesce(v -> 'options', '{}'::jsonb))), ''),
             'Default');

  insert into public.product_variants (organization_id, product_id, name, options, sku, cost_price, selling_price,
                                       low_stock_threshold, is_default)
  values (p_org, p_product, v_name, coalesce(v -> 'options', '{}'::jsonb), v_sku,
          nullif(v ->> 'cost_price', '')::numeric, nullif(v ->> 'selling_price', '')::numeric,
          nullif(v ->> 'low_stock_threshold', '')::int, p_is_default)
  returning id into v_id;

  if v_qty > 0 then
    perform app.apply_stock_movement(v_id, 'opening', v_qty, 0, 'Opening stock', null, p_actor);
  end if;
  return v_id;
end $$;

-- p: {name, sku, description, category_id, image_path, cost_price, selling_price, low_stock_threshold,
--     is_active, opening_quantity, variants: [{name, options, sku, cost_price, selling_price, opening_quantity}]}
create or replace function app.do_create_product(p_org uuid, p jsonb, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_product uuid;
  v_has_variants boolean := coalesce(jsonb_typeof(p -> 'variants') = 'array' and jsonb_array_length(p -> 'variants') > 0, false);
  v jsonb;
begin
  if coalesce(trim(p ->> 'name'), '') = '' then perform app.raise('GO400', 'Product name is required'); end if;
  if not app.same_org(p_org, 'product_categories', nullif(p ->> 'category_id', '')::uuid) then
    perform app.raise('GO400', 'Invalid category');
  end if;

  insert into public.products (organization_id, category_id, name, sku, description, image_path, cost_price,
                               selling_price, low_stock_threshold, has_variants, is_active, created_by)
  values (p_org, nullif(p ->> 'category_id', '')::uuid, trim(p ->> 'name'), nullif(trim(p ->> 'sku'), ''),
          nullif(p ->> 'description', ''), nullif(p ->> 'image_path', ''),
          coalesce(nullif(p ->> 'cost_price', '')::numeric, 0), coalesce(nullif(p ->> 'selling_price', '')::numeric, 0),
          coalesce(nullif(p ->> 'low_stock_threshold', '')::int, 5), v_has_variants,
          coalesce((p ->> 'is_active')::boolean, true), p_actor)
  returning id into v_product;

  if v_has_variants then
    for v in select * from jsonb_array_elements(p -> 'variants') loop
      perform app.do_add_variant(p_org, v_product, v, p_actor, false);
    end loop;
  else
    perform app.do_add_variant(p_org, v_product,
      jsonb_build_object('name', 'Default', 'sku', p ->> 'sku', 'opening_quantity', coalesce(p ->> 'opening_quantity', '0')),
      p_actor, true);
  end if;
  return v_product;
end $$;

create or replace function public.create_product(p_org uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); v_id uuid;
begin
  perform app.assert_permission(p_org, 'products.write');
  perform app.assert_writable(p_org);
  v_id := app.do_create_product(p_org, p, v_user);
  perform app.log_audit(p_org, 'product.created', 'product', v_id::text, jsonb_build_object('name', p ->> 'name'));
  return v_id;
end $$;

create or replace function public.add_product_variant(p_product uuid, v jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); v_org uuid; v_id uuid; v_had boolean;
begin
  select organization_id, has_variants into v_org, v_had from public.products where id = p_product;
  if v_org is null then perform app.raise('GO404', 'Product not found'); end if;
  perform app.assert_permission(v_org, 'products.write');
  perform app.assert_writable(v_org);
  v_id := app.do_add_variant(v_org, p_product, v, v_user, false);
  if not v_had then
    -- converting a simple product: retire the hidden default variant if it has no stock or history
    update public.products set has_variants = true where id = p_product;
    update public.product_variants set is_active = false, archived_at = now()
    where product_id = p_product and is_default and quantity_on_hand = 0 and quantity_reserved = 0;
  end if;
  return v_id;
end $$;

-- p_type: purchase (+), damage (-), adjustment (signed). p_quantity is the change for adjustment.
create or replace function public.adjust_stock(p_variant uuid, p_type text, p_quantity int, p_reason text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); v_org uuid; v_change int;
begin
  select organization_id into v_org from public.product_variants where id = p_variant;
  if v_org is null then perform app.raise('GO404', 'Product variant not found'); end if;
  perform app.assert_permission(v_org, 'inventory.adjust');
  perform app.assert_writable(v_org);
  if p_quantity is null or p_quantity = 0 then perform app.raise('GO400', 'Quantity must not be zero'); end if;

  v_change := case p_type
    when 'purchase' then abs(p_quantity)
    when 'damage' then -abs(p_quantity)
    when 'adjustment' then p_quantity
    else null end;
  if v_change is null then perform app.raise('GO400', 'Invalid adjustment type'); end if;
  if p_type in ('adjustment', 'damage') and coalesce(trim(p_reason), '') = '' then
    perform app.raise('GO400', 'A reason is required for adjustments');
  end if;
  perform app.apply_stock_movement(p_variant, p_type, v_change, 0, nullif(trim(p_reason), ''), null, v_user);
end $$;

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create or replace function app.recalc_order(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o record;
  v_paid numeric(14,2);
  v_refunded numeric(14,2);
  v_net numeric(14,2);
  v_status text;
begin
  select * into o from public.orders where id = p_order for update;
  select coalesce(sum(amount) filter (where kind = 'payment'), 0), coalesce(sum(amount) filter (where kind = 'refund'), 0)
    into v_paid, v_refunded
  from public.payments where order_id = p_order and voided_at is null;

  v_net := case when o.status = 'cancelled' then 0 else o.total - o.returns_total end;
  v_paid := v_paid - v_refunded;

  v_status := case
    when v_refunded > 0 and v_paid <= 0 then 'refunded'
    when v_paid <= 0 then 'unpaid'
    when v_paid >= v_net then 'paid'
    else 'partially_paid' end;

  update public.orders set
    amount_paid = v_paid,
    amount_refunded = v_refunded,
    balance_due = v_net - v_paid,
    payment_status = v_status
  where id = p_order;
end $$;

-- p: {customer_id, channel, order_date, expected_delivery_date, discount_amount, delivery_fee, notes,
--     delivery_address, items: [{variant_id, quantity, unit_price?, discount_amount?}]}
create or replace function app.do_save_draft_order(p_org uuid, p_order uuid, p jsonb, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_order uuid := p_order;
  v_number text;
  v_prefix text;
  v_next int;
  it jsonb;
  var record;
  v_qty int;
  v_price numeric(14,2);
  v_line_disc numeric(14,2);
  v_subtotal numeric(14,2) := 0;
  v_cost numeric(14,2) := 0;
  v_discount numeric(14,2) := coalesce(nullif(p ->> 'discount_amount', '')::numeric, 0);
  v_delivery numeric(14,2) := coalesce(nullif(p ->> 'delivery_fee', '')::numeric, 0);
  v_customer uuid := nullif(p ->> 'customer_id', '')::uuid;
begin
  if coalesce(jsonb_typeof(p -> 'items'), '') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    perform app.raise('GO400', 'An order needs at least one item');
  end if;
  if v_discount < 0 or v_delivery < 0 then perform app.raise('GO400', 'Discount and delivery fee cannot be negative'); end if;
  if not app.same_org(p_org, 'customers', v_customer) then perform app.raise('GO400', 'Invalid customer'); end if;

  if v_order is null then
    update public.business_profiles set next_order_number = next_order_number + 1
    where organization_id = p_org returning next_order_number - 1, order_prefix into v_next, v_prefix;
    if v_next is null then perform app.raise('GO404', 'Business profile missing'); end if;
    v_number := v_prefix || '-' || v_next::text;

    insert into public.orders (organization_id, order_number, customer_id, channel, order_date, expected_delivery_date,
                               notes, delivery_address, created_by)
    values (p_org, v_number, v_customer, nullif(p ->> 'channel', ''),
            coalesce(nullif(p ->> 'order_date', '')::date, app.org_today(p_org)),
            nullif(p ->> 'expected_delivery_date', '')::date, nullif(p ->> 'notes', ''),
            nullif(p ->> 'delivery_address', ''), p_actor)
    returning id into v_order;
  else
    if not exists (select 1 from public.orders where id = v_order and organization_id = p_org and status = 'draft') then
      perform app.raise('GO409', 'Only draft orders can be edited');
    end if;
    update public.orders set customer_id = v_customer, channel = nullif(p ->> 'channel', ''),
      order_date = coalesce(nullif(p ->> 'order_date', '')::date, order_date),
      expected_delivery_date = nullif(p ->> 'expected_delivery_date', '')::date,
      notes = nullif(p ->> 'notes', ''), delivery_address = nullif(p ->> 'delivery_address', '')
    where id = v_order;
    delete from public.order_items where order_id = v_order;
  end if;

  for it in select * from jsonb_array_elements(p -> 'items') loop
    v_qty := (it ->> 'quantity')::int;
    if v_qty is null or v_qty <= 0 then perform app.raise('GO400', 'Item quantity must be at least 1'); end if;

    select vs.*, pv.name as vname into var
    from public.variant_stock vs join public.product_variants pv on pv.id = vs.variant_id
    where vs.variant_id = (it ->> 'variant_id')::uuid and vs.organization_id = p_org;
    if not found then perform app.raise('GO400', 'Invalid product in order'); end if;
    if not var.is_sellable then perform app.raise('GO400', format('%s is not available for sale', var.product_name)); end if;

    v_price := coalesce(nullif(it ->> 'unit_price', '')::numeric, var.selling_price);
    v_line_disc := coalesce(nullif(it ->> 'discount_amount', '')::numeric, 0);
    if v_price < 0 or v_line_disc < 0 then perform app.raise('GO400', 'Prices and discounts cannot be negative'); end if;
    if v_line_disc > round(v_price * v_qty, 2) then perform app.raise('GO400', 'Line discount exceeds line value'); end if;

    insert into public.order_items (organization_id, order_id, product_id, variant_id, product_name, variant_name, sku,
                                    quantity, unit_price, unit_cost, discount_amount, line_total)
    values (p_org, v_order, var.product_id, var.variant_id, var.product_name,
            case when var.has_variants then var.vname end, var.sku,
            v_qty, v_price, var.cost_price, v_line_disc, round(v_price * v_qty - v_line_disc, 2));

    v_subtotal := v_subtotal + round(v_price * v_qty - v_line_disc, 2);
    v_cost := v_cost + round(var.cost_price * v_qty, 2);
  end loop;

  if v_discount > v_subtotal then perform app.raise('GO400', 'Order discount exceeds the subtotal'); end if;

  update public.orders set subtotal = v_subtotal, discount_amount = v_discount, delivery_fee = v_delivery,
    total = v_subtotal - v_discount + v_delivery, cost_total = v_cost
  where id = v_order;
  perform app.recalc_order(v_order);
  return v_order;
end $$;

create or replace function app.do_confirm_order(p_order uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o record; it record; v_policy text;
begin
  select * into o from public.orders where id = p_order for update;
  if o.status <> 'draft' then perform app.raise('GO409', 'Only draft orders can be confirmed'); end if;
  select stock_policy into v_policy from public.business_profiles where organization_id = o.organization_id;

  for it in select * from public.order_items where order_id = p_order order by id loop
    if v_policy = 'deduct_on_confirm' then
      perform app.apply_stock_movement(it.variant_id, 'sale', -it.quantity, 0, 'Order ' || o.order_number, p_order, p_actor);
    else
      perform app.apply_stock_movement(it.variant_id, 'reservation', 0, it.quantity, 'Order ' || o.order_number, p_order, p_actor);
    end if;
  end loop;

  update public.orders set status = 'confirmed', confirmed_at = now(),
    stock_state = case when v_policy = 'deduct_on_confirm' then 'deducted' else 'reserved' end
  where id = p_order;
  perform app.recalc_order(p_order);
end $$;

-- Converts reserved stock into an actual deduction (goods leave the shop).
create or replace function app.do_fulfil_stock(p_order uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o record; it record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.stock_state <> 'reserved' then return; end if;
  for it in select * from public.order_items where order_id = p_order order by id loop
    perform app.apply_stock_movement(it.variant_id, 'sale', -it.quantity, -it.quantity, 'Order ' || o.order_number, p_order, p_actor);
  end loop;
  update public.orders set stock_state = 'deducted' where id = p_order;
end $$;

create or replace function app.do_update_order_status(p_order uuid, p_status text, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  o record;
  rank_from int; rank_to int;
begin
  select * into o from public.orders where id = p_order for update;
  if p_status not in ('processing', 'ready', 'dispatched', 'delivered') then
    perform app.raise('GO400', 'Use confirm or cancel for that status change');
  end if;
  rank_from := array_position(array['confirmed', 'processing', 'ready', 'dispatched', 'delivered'], o.status);
  rank_to := array_position(array['confirmed', 'processing', 'ready', 'dispatched', 'delivered'], p_status);
  if rank_from is null then perform app.raise('GO409', format('A %s order cannot change status', o.status)); end if;
  if rank_to <= rank_from then perform app.raise('GO409', format('Cannot move an order from %s back to %s', o.status, p_status)); end if;

  if p_status in ('dispatched', 'delivered') then
    perform app.do_fulfil_stock(p_order, p_actor);
  end if;

  update public.orders set status = p_status,
    dispatched_at = case when p_status in ('dispatched', 'delivered') then coalesce(dispatched_at, now()) else dispatched_at end,
    delivered_at = case when p_status = 'delivered' then now() else delivered_at end
  where id = p_order;
end $$;

create or replace function app.do_cancel_order(p_order uuid, p_reason text, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare o record; it record;
begin
  select * into o from public.orders where id = p_order for update;
  if o.status in ('cancelled', 'delivered') then
    perform app.raise('GO409', case when o.status = 'delivered' then 'Delivered orders cannot be cancelled — record a return instead'
                                    else 'Order is already cancelled' end);
  end if;
  if exists (select 1 from public.order_returns where order_id = p_order) then
    perform app.raise('GO409', 'Orders with returns cannot be cancelled');
  end if;

  for it in select * from public.order_items where order_id = p_order order by id loop
    if o.stock_state = 'reserved' then
      perform app.apply_stock_movement(it.variant_id, 'reservation_release', 0, -it.quantity, 'Cancelled ' || o.order_number, p_order, p_actor);
    elsif o.stock_state = 'deducted' then
      perform app.apply_stock_movement(it.variant_id, 'cancellation_restock', it.quantity, 0, 'Cancelled ' || o.order_number, p_order, p_actor);
    end if;
  end loop;

  update public.orders set status = 'cancelled', cancelled_at = now(), cancel_reason = nullif(trim(p_reason), ''),
    stock_state = case when stock_state = 'none' then 'none' else 'released' end
  where id = p_order;
  perform app.recalc_order(p_order);
end $$;

create or replace function app.do_record_payment(
  p_order uuid, p_kind text, p_amount numeric, p_method text, p_reference text, p_paid_at timestamptz,
  p_notes text, p_actor uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare o record; v_id uuid;
begin
  select * into o from public.orders where id = p_order for update;
  if p_amount is null or p_amount <= 0 then perform app.raise('GO400', 'Amount must be greater than zero'); end if;
  if round(p_amount, 2) <> p_amount then perform app.raise('GO400', 'Amount can have at most 2 decimal places'); end if;

  if p_kind = 'payment' then
    if o.status in ('draft', 'cancelled') then
      perform app.raise('GO409', 'Payments can only be recorded on confirmed orders');
    end if;
    if p_amount > o.balance_due then
      perform app.raise('GO400', format('Payment exceeds the outstanding balance of %s', o.balance_due));
    end if;
  elsif p_kind = 'refund' then
    if p_amount > o.amount_paid then
      perform app.raise('GO400', format('Refund exceeds the amount paid (%s)', o.amount_paid));
    end if;
  else
    perform app.raise('GO400', 'Invalid payment kind');
  end if;

  insert into public.payments (organization_id, order_id, customer_id, kind, amount, method, reference, paid_at, notes, recorded_by)
  values (o.organization_id, p_order, o.customer_id, p_kind, p_amount, coalesce(nullif(p_method, ''), 'bank_transfer'),
          nullif(trim(p_reference), ''), coalesce(p_paid_at, now()), nullif(trim(p_notes), ''), p_actor)
  returning id into v_id;
  perform app.recalc_order(p_order);
  return v_id;
end $$;

-- line items -> credit (pro-rated share of the order-level discount), restock optional
create or replace function app.do_record_return(p_order uuid, p jsonb, p_actor uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  o record; it jsonb; oi record;
  v_return uuid; v_qty int; v_factor numeric; v_credit numeric(14,2); v_total_credit numeric(14,2) := 0;
  v_cost numeric(14,2) := 0;
  v_restock boolean := coalesce((p ->> 'restock')::boolean, true);
begin
  select * into o from public.orders where id = p_order for update;
  if o.status not in ('dispatched', 'delivered') then
    perform app.raise('GO409', 'Returns can only be recorded for dispatched or delivered orders');
  end if;
  if coalesce(jsonb_typeof(p -> 'items'), '') <> 'array' or jsonb_array_length(p -> 'items') = 0 then
    perform app.raise('GO400', 'Select at least one item to return');
  end if;
  v_factor := case when o.subtotal > 0 then (o.subtotal - o.discount_amount) / o.subtotal else 1 end;

  insert into public.order_returns (organization_id, order_id, return_date, reason, restocked, credit_amount, created_by)
  values (o.organization_id, p_order, coalesce(nullif(p ->> 'return_date', '')::date, app.org_today(o.organization_id)),
          nullif(trim(p ->> 'reason'), ''), v_restock, 0, p_actor)
  returning id into v_return;

  for it in select * from jsonb_array_elements(p -> 'items') loop
    v_qty := (it ->> 'quantity')::int;
    select * into oi from public.order_items where id = (it ->> 'order_item_id')::uuid and order_id = p_order for update;
    if not found then perform app.raise('GO400', 'Item does not belong to this order'); end if;
    if v_qty is null or v_qty <= 0 or v_qty > oi.quantity - oi.returned_quantity then
      perform app.raise('GO400', format('Invalid return quantity for %s', oi.product_name));
    end if;

    v_credit := round(oi.line_total / oi.quantity * v_qty * v_factor, 2);
    v_total_credit := v_total_credit + v_credit;
    insert into public.order_return_items (organization_id, return_id, order_item_id, quantity, credit_amount)
    values (o.organization_id, v_return, oi.id, v_qty, v_credit);
    update public.order_items set returned_quantity = returned_quantity + v_qty where id = oi.id;

    if v_restock then
      v_cost := v_cost + round(oi.unit_cost * v_qty, 2);
      perform app.apply_stock_movement(oi.variant_id, 'return', v_qty, 0, 'Return on ' || o.order_number, p_order, p_actor);
    end if;
  end loop;

  update public.order_returns set credit_amount = v_total_credit, cost_reversed = v_cost where id = v_return;
  update public.orders set returns_total = returns_total + v_total_credit where id = p_order;
  perform app.recalc_order(p_order);
  return v_return;
end $$;

-- ---- public order API ----------------------------------------------------
create or replace function app.order_org(p_order uuid) returns uuid
language plpgsql stable security definer set search_path = '' as $$
declare v uuid;
begin
  select organization_id into v from public.orders where id = p_order;
  if v is null then perform app.raise('GO404', 'Order not found'); end if;
  return v;
end $$;

create or replace function public.save_draft_order(p_org uuid, p_order uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth();
begin
  perform app.assert_permission(p_org, 'orders.write');
  perform app.assert_writable(p_org);
  return app.do_save_draft_order(p_org, p_order, p, v_user);
end $$;

-- One-shot create (+ optional confirm and initial payment) — used by quick order on mobile.
-- p additionally accepts: confirm boolean, payment {amount, method, reference}
create or replace function public.create_order(p_org uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); v_order uuid; v_amount numeric;
begin
  perform app.assert_permission(p_org, 'orders.write');
  perform app.assert_writable(p_org);
  v_order := app.do_save_draft_order(p_org, null, p, v_user);
  if coalesce((p ->> 'confirm')::boolean, false) then
    perform app.do_confirm_order(v_order, v_user);
    v_amount := nullif(p #>> '{payment,amount}', '')::numeric;
    if v_amount is not null and v_amount > 0 then
      perform app.assert_permission(p_org, 'payments.record');
      perform app.do_record_payment(v_order, 'payment', v_amount, p #>> '{payment,method}', p #>> '{payment,reference}',
                                    null, null, v_user);
    end if;
  end if;
  return v_order;
end $$;

create or replace function public.confirm_order(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); v_org uuid := app.order_org(p_order);
begin
  perform app.assert_permission(v_org, 'orders.write');
  perform app.assert_writable(v_org);
  perform app.do_confirm_order(p_order, v_user);
end $$;

create or replace function public.update_order_status(p_order uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); v_org uuid := app.order_org(p_order);
begin
  perform app.assert_permission(v_org, 'orders.write');
  perform app.assert_writable(v_org);
  perform app.do_update_order_status(p_order, p_status, v_user);
end $$;

create or replace function public.cancel_order(p_order uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); v_org uuid := app.order_org(p_order);
begin
  perform app.assert_permission(v_org, 'orders.cancel');
  perform app.assert_writable(v_org);
  perform app.do_cancel_order(p_order, p_reason, v_user);
  perform app.log_audit(v_org, 'order.cancelled', 'order', p_order::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.delete_draft_order(p_order uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); v_org uuid := app.order_org(p_order);
begin
  perform app.assert_permission(v_org, 'orders.write');
  perform app.assert_writable(v_org);
  if not exists (select 1 from public.orders where id = p_order and status = 'draft') then
    perform app.raise('GO409', 'Only draft orders can be deleted');
  end if;
  delete from public.orders where id = p_order;
end $$;

create or replace function public.record_payment(
  p_order uuid, p_amount numeric, p_method text, p_reference text default null,
  p_paid_at timestamptz default null, p_notes text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); v_org uuid := app.order_org(p_order);
begin
  perform app.assert_permission(v_org, 'payments.record');
  perform app.assert_writable(v_org);
  if p_paid_at is not null and p_paid_at > now() + interval '1 day' then
    perform app.raise('GO400', 'Payment date cannot be in the future');
  end if;
  return app.do_record_payment(p_order, 'payment', p_amount, p_method, p_reference, p_paid_at, p_notes, v_user);
end $$;

create or replace function public.record_refund(
  p_order uuid, p_amount numeric, p_method text, p_reason text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); v_org uuid := app.order_org(p_order); v_id uuid;
begin
  perform app.assert_permission(v_org, 'payments.refund');
  perform app.assert_writable(v_org);
  v_id := app.do_record_payment(p_order, 'refund', p_amount, p_method, null, null, p_reason, v_user);
  perform app.log_audit(v_org, 'payment.refunded', 'order', p_order::text, jsonb_build_object('amount', p_amount, 'reason', p_reason));
  return v_id;
end $$;

create or replace function public.void_payment(p_payment uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); pay record;
begin
  select * into pay from public.payments where id = p_payment;
  if not found then perform app.raise('GO404', 'Payment not found'); end if;
  perform app.assert_permission(pay.organization_id, 'payments.refund');
  perform app.assert_writable(pay.organization_id);
  if pay.voided_at is not null then perform app.raise('GO409', 'Payment already voided'); end if;
  if coalesce(trim(p_reason), '') = '' then perform app.raise('GO400', 'A reason is required'); end if;
  update public.payments set voided_at = now(), void_reason = trim(p_reason) where id = p_payment;
  perform app.recalc_order(pay.order_id);
  perform app.log_audit(pay.organization_id, 'payment.voided', 'payment', p_payment::text,
                        jsonb_build_object('amount', pay.amount, 'reason', p_reason, 'recorded_by', pay.recorded_by));
end $$;

create or replace function public.record_return(p_order uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); v_org uuid := app.order_org(p_order); v_id uuid;
begin
  perform app.assert_permission(v_org, 'orders.cancel');
  perform app.assert_writable(v_org);
  v_id := app.do_record_return(p_order, p, v_user);
  perform app.log_audit(v_org, 'order.returned', 'order', p_order::text, p);
  return v_id;
end $$;

-- ---------------------------------------------------------------------------
-- Expenses / income: voiding (no hard deletes on financial records)
-- ---------------------------------------------------------------------------
create or replace function public.void_financial_record(p_table text, p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); v_org uuid;
begin
  if p_table not in ('expenses', 'income_records') then perform app.raise('GO400', 'Invalid record type'); end if;
  execute format('select organization_id from public.%I where id = $1', p_table) into v_org using p_id;
  if v_org is null then perform app.raise('GO404', 'Record not found'); end if;
  perform app.assert_permission(v_org, 'finance.write');
  perform app.assert_writable(v_org);
  execute format('update public.%I set voided_at = now() where id = $1 and voided_at is null', p_table) using p_id;
  perform app.log_audit(v_org, p_table || '.voided', p_table, p_id::text);
end $$;

-- ---------------------------------------------------------------------------
-- Team management
-- ---------------------------------------------------------------------------
create or replace function public.create_invitation(p_org uuid, p_email text, p_role text, p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); v_id uuid;
begin
  if not app.has_permission(p_org, 'members.manage') then perform app.raise('GO403', 'You cannot manage team members'); end if;
  perform app.assert_writable(p_org);
  if p_role not in ('admin', 'manager', 'staff', 'viewer') then perform app.raise('GO400', 'Invalid role'); end if;
  if p_role = 'admin' and app.member_role(p_org) <> 'owner' then perform app.raise('GO403', 'Only the owner can invite admins'); end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then perform app.raise('GO400', 'Invalid email address'); end if;
  if exists (select 1 from public.organization_members m join public.profiles pr on pr.id = m.user_id
             where m.organization_id = p_org and lower(pr.email) = lower(p_email)) then
    perform app.raise('GO409', 'This person is already a member');
  end if;
  -- seat check up-front so the inviter gets immediate feedback
  if app.entitlement_limit(p_org, 'max_users') is not null and
     (select count(*) from public.organization_members where organization_id = p_org and status = 'active')
       >= app.entitlement_limit(p_org, 'max_users') then
    perform app.raise('GO402', 'Your plan has no free seats. Upgrade to add team members.');
  end if;
  update public.organization_invitations set revoked_at = now()
    where organization_id = p_org and lower(email) = lower(p_email) and accepted_at is null and revoked_at is null;
  insert into public.organization_invitations (organization_id, email, role, token_hash, invited_by)
  values (p_org, lower(trim(p_email)), p_role, p_token_hash, v_user) returning id into v_id;
  perform app.log_audit(p_org, 'member.invited', 'invitation', v_id::text, jsonb_build_object('email', p_email, 'role', p_role));
  return v_id;
end $$;

create or replace function public.accept_invitation(p_token_hash text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); inv record; v_email text;
begin
  select * into inv from public.organization_invitations where token_hash = p_token_hash for update;
  if not found or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at < now() then
    perform app.raise('GO404', 'This invitation is invalid or has expired');
  end if;
  select email into v_email from auth.users where id = v_user;
  if lower(v_email) <> lower(inv.email) then
    perform app.raise('GO403', 'This invitation was sent to a different email address');
  end if;
  insert into public.organization_members (organization_id, user_id, role, invited_by)
  values (inv.organization_id, v_user, inv.role, inv.invited_by)
  on conflict (organization_id, user_id) do update set status = 'active', role = excluded.role;
  update public.organization_invitations set accepted_at = now() where id = inv.id;
  update public.profiles set default_organization_id = coalesce(default_organization_id, inv.organization_id) where id = v_user;
  return inv.organization_id;
end $$;

create or replace function public.update_member(p_member uuid, p_role text, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); m record; v_my_role text;
begin
  select * into m from public.organization_members where id = p_member for update;
  if not found then perform app.raise('GO404', 'Member not found'); end if;
  if not app.has_permission(m.organization_id, 'members.manage') then perform app.raise('GO403', 'You cannot manage team members'); end if;
  v_my_role := app.member_role(m.organization_id);
  if m.role = 'owner' then perform app.raise('GO403', 'The workspace owner cannot be changed here'); end if;
  if coalesce(p_role, m.role) not in ('admin', 'manager', 'staff', 'viewer') then perform app.raise('GO400', 'Invalid role'); end if;
  if (m.role = 'admin' or p_role = 'admin') and v_my_role <> 'owner' then perform app.raise('GO403', 'Only the owner can manage admins'); end if;
  if m.user_id = v_user then perform app.raise('GO403', 'You cannot change your own role'); end if;
  update public.organization_members set role = coalesce(p_role, role), status = coalesce(p_status, status) where id = p_member;
  perform app.log_audit(m.organization_id, 'member.updated', 'member', p_member::text,
                        jsonb_build_object('role', p_role, 'status', p_status, 'previous_role', m.role));
end $$;

create or replace function public.remove_member(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); m record;
begin
  select * into m from public.organization_members where id = p_member;
  if not found then perform app.raise('GO404', 'Member not found'); end if;
  if m.role = 'owner' then perform app.raise('GO403', 'The workspace owner cannot be removed'); end if;
  if m.user_id <> v_user then
    if not app.has_permission(m.organization_id, 'members.manage') then perform app.raise('GO403', 'You cannot manage team members'); end if;
    if m.role = 'admin' and app.member_role(m.organization_id) <> 'owner' then perform app.raise('GO403', 'Only the owner can remove admins'); end if;
  end if;
  delete from public.organization_members where id = p_member;
  update public.follow_up_tasks set assigned_to = null where organization_id = m.organization_id and assigned_to = m.user_id
    and status in ('open', 'in_progress');
  perform app.log_audit(m.organization_id, 'member.removed', 'member', p_member::text, jsonb_build_object('user_id', m.user_id));
end $$;

-- Lock down: internal app.* functions are not callable by clients.
revoke execute on all functions in schema app from public, anon;
grant execute on all functions in schema app to authenticated, service_role;
