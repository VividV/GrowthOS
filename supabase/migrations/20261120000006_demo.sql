-- ============================================================================
-- 0006 DEMONSTRATION WORKSPACES
-- A demo is a real organization flagged is_demo = true, populated through the
-- same business functions as real data (so numbers obey the same rules).
-- Fictional data only. Badged in the UI. Resettable.
-- ============================================================================

create or replace function app.seed_demo_data(p_org uuid, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_today date := app.org_today(p_org);
  cat_fashion uuid; cat_beauty uuid; cat_hair uuid; cat_acc uuid;
  cat_rent uuid; cat_sal uuid; cat_trans uuid; cat_mkt uuid; cat_util uuid; cat_pack uuid;
  cust uuid[] := '{}';
  c uuid;
  prod jsonb;
  i int;
  v_order uuid;
  v_items jsonb;
  v_variants uuid[];
  v_status text;
  v_total numeric;
  v_days int;
  r record;
begin
  perform setseed(0.42);

  insert into public.product_categories (organization_id, name) values (p_org, 'Fashion') returning id into cat_fashion;
  insert into public.product_categories (organization_id, name) values (p_org, 'Beauty & Skincare') returning id into cat_beauty;
  insert into public.product_categories (organization_id, name) values (p_org, 'Hair') returning id into cat_hair;
  insert into public.product_categories (organization_id, name) values (p_org, 'Accessories') returning id into cat_acc;

  -- 20 fictional customers
  for r in select * from (values
    ('Chiamaka Okafor', '08031234501', 'chiamaka.okafor@example.com', 'Lekki, Lagos', 'instagram', 58),
    ('Tunde Bakare', '08051234502', 'tunde.bakare@example.com', 'Ikeja, Lagos', 'whatsapp', 57),
    ('Aisha Bello', '08061234503', null, 'Wuse II, Abuja', 'instagram', 55),
    ('Emeka Nwosu', '08071234504', 'emeka.nwosu@example.com', 'GRA, Port Harcourt', 'referral', 54),
    ('Funmilayo Adeyemi', '08081234505', 'funmi.adeyemi@example.com', 'Bodija, Ibadan', 'walk-in', 52),
    ('Ngozi Eze', '08091234506', null, 'Yaba, Lagos', 'whatsapp', 50),
    ('Kelechi Obi', '07011234507', 'kelechi.obi@example.com', 'Enugu', 'instagram', 47),
    ('Halima Yusuf', '07021234508', null, 'Kano', 'whatsapp', 45),
    ('Bisola Johnson', '07031234509', 'bisola.j@example.com', 'Surulere, Lagos', 'tiktok', 41),
    ('Ifeanyi Okonkwo', '07041234510', null, 'Asaba', 'referral', 38),
    ('Zainab Abdullahi', '07051234511', 'zainab.a@example.com', 'Garki, Abuja', 'instagram', 35),
    ('Olumide Fashola', '08101234512', null, 'Victoria Island, Lagos', 'walk-in', 31),
    ('Adaobi Chukwu', '08111234513', 'adaobi.c@example.com', 'Owerri', 'whatsapp', 28),
    ('Segun Alabi', '08121234514', null, 'Abeokuta', 'instagram', 24),
    ('Precious Etim', '08131234515', 'precious.etim@example.com', 'Uyo', 'tiktok', 20),
    ('Yetunde Ogunleye', '08141234516', null, 'Ajah, Lagos', 'instagram', 16),
    ('Musa Ibrahim', '08151234517', 'musa.ibrahim@example.com', 'Kaduna', 'whatsapp', 12),
    ('Chioma Udeh', '08161234518', null, 'Festac, Lagos', 'referral', 9),
    ('Damilola Ojo', '08171234519', 'dami.ojo@example.com', 'Akure', 'instagram', 5),
    ('Grace Akpan', '08181234520', null, 'Calabar', 'walk-in', 2)
  ) as t(name, phone, email, location, source, days_ago)
  loop
    insert into public.customers (organization_id, full_name, phone, email, location, source, notes, created_by, created_at)
    values (p_org, r.name, r.phone, r.email, r.location, r.source,
            case when r.source = 'referral' then 'Referred by an existing customer' end, p_actor,
            now() - make_interval(days => r.days_ago))
    returning id into c;
    cust := cust || c;
  end loop;

  -- 15 products (some with variants)
  for prod in select * from jsonb_array_elements(jsonb_build_array(
    jsonb_build_object('name', 'Ankara Shirt', 'category_id', cat_fashion, 'cost_price', 6500, 'selling_price', 12000, 'low_stock_threshold', 3,
      'description', 'Hand-finished Ankara print shirt, regular fit.',
      'variants', jsonb_build_array(
        jsonb_build_object('options', jsonb_build_object('Colour', 'Blue', 'Size', 'Small'), 'sku', 'ANK-BLU-S', 'opening_quantity', 10),
        jsonb_build_object('options', jsonb_build_object('Colour', 'Blue', 'Size', 'Medium'), 'sku', 'ANK-BLU-M', 'opening_quantity', 14),
        jsonb_build_object('options', jsonb_build_object('Colour', 'Blue', 'Size', 'Large'), 'sku', 'ANK-BLU-L', 'opening_quantity', 9),
        jsonb_build_object('options', jsonb_build_object('Colour', 'Green', 'Size', 'Small'), 'sku', 'ANK-GRN-S', 'opening_quantity', 6),
        jsonb_build_object('options', jsonb_build_object('Colour', 'Green', 'Size', 'Medium'), 'sku', 'ANK-GRN-M', 'opening_quantity', 8))),
    jsonb_build_object('name', 'Adire Kaftan', 'category_id', cat_fashion, 'cost_price', 9000, 'selling_price', 18500, 'low_stock_threshold', 2,
      'variants', jsonb_build_array(
        jsonb_build_object('options', jsonb_build_object('Size', 'M'), 'sku', 'ADR-KAF-M', 'opening_quantity', 7),
        jsonb_build_object('options', jsonb_build_object('Size', 'L'), 'sku', 'ADR-KAF-L', 'opening_quantity', 6),
        jsonb_build_object('options', jsonb_build_object('Size', 'XL'), 'sku', 'ADR-KAF-XL', 'opening_quantity', 4))),
    jsonb_build_object('name', 'Senator Wear Set', 'category_id', cat_fashion, 'cost_price', 15000, 'selling_price', 32000, 'low_stock_threshold', 2,
      'variants', jsonb_build_array(
        jsonb_build_object('options', jsonb_build_object('Colour', 'Navy'), 'sku', 'SEN-NVY', 'opening_quantity', 6),
        jsonb_build_object('options', jsonb_build_object('Colour', 'Wine'), 'sku', 'SEN-WIN', 'opening_quantity', 5))),
    jsonb_build_object('name', 'Aso-Oke Gele', 'category_id', cat_acc, 'sku', 'ASO-GELE', 'cost_price', 4500, 'selling_price', 9500, 'opening_quantity', 20, 'low_stock_threshold', 5),
    jsonb_build_object('name', 'French Lace Fabric (5 yards)', 'category_id', cat_fashion, 'sku', 'LACE-5Y', 'cost_price', 22000, 'selling_price', 38000, 'opening_quantity', 12, 'low_stock_threshold', 3),
    jsonb_build_object('name', 'Shea Butter Body Cream', 'category_id', cat_beauty, 'sku', 'SHEA-250', 'cost_price', 1800, 'selling_price', 4500, 'opening_quantity', 40, 'low_stock_threshold', 10),
    jsonb_build_object('name', 'African Black Soap', 'category_id', cat_beauty, 'sku', 'BLK-SOAP', 'cost_price', 900, 'selling_price', 2500, 'opening_quantity', 50, 'low_stock_threshold', 12),
    jsonb_build_object('name', 'Vitamin C Glow Serum', 'category_id', cat_beauty, 'sku', 'VITC-30', 'cost_price', 3500, 'selling_price', 8000, 'opening_quantity', 9, 'low_stock_threshold', 8),
    jsonb_build_object('name', 'Lip Gloss Trio', 'category_id', cat_beauty, 'sku', 'LIP-TRIO', 'cost_price', 2200, 'selling_price', 6000, 'opening_quantity', 25, 'low_stock_threshold', 6),
    jsonb_build_object('name', 'Human Hair Wig (Bone Straight)', 'category_id', cat_hair, 'cost_price', 65000, 'selling_price', 120000, 'low_stock_threshold', 1,
      'variants', jsonb_build_array(
        jsonb_build_object('options', jsonb_build_object('Length', '14 inch'), 'sku', 'WIG-BS-14', 'opening_quantity', 4),
        jsonb_build_object('options', jsonb_build_object('Length', '18 inch'), 'sku', 'WIG-BS-18', 'opening_quantity', 3))),
    jsonb_build_object('name', 'Satin Hair Bonnet', 'category_id', cat_hair, 'sku', 'BONNET', 'cost_price', 1200, 'selling_price', 3500, 'opening_quantity', 30, 'low_stock_threshold', 8),
    jsonb_build_object('name', 'Beaded Necklace', 'category_id', cat_acc, 'sku', 'BEAD-NECK', 'cost_price', 3000, 'selling_price', 7500, 'opening_quantity', 15, 'low_stock_threshold', 4),
    jsonb_build_object('name', 'Ankara Tote Bag', 'category_id', cat_acc, 'sku', 'TOTE-ANK', 'cost_price', 4000, 'selling_price', 9000, 'opening_quantity', 4, 'low_stock_threshold', 4),
    jsonb_build_object('name', 'Leather Slippers', 'category_id', cat_acc, 'cost_price', 7000, 'selling_price', 15000, 'low_stock_threshold', 2,
      'variants', jsonb_build_array(
        jsonb_build_object('options', jsonb_build_object('Size', '42'), 'sku', 'SLIP-42', 'opening_quantity', 5),
        jsonb_build_object('options', jsonb_build_object('Size', '44'), 'sku', 'SLIP-44', 'opening_quantity', 5))),
    jsonb_build_object('name', 'Oud Perfume Oil', 'category_id', cat_beauty, 'sku', 'OUD-12', 'cost_price', 5000, 'selling_price', 12500, 'opening_quantity', 18, 'low_stock_threshold', 5)
  )) loop
    perform app.do_create_product(p_org, prod, p_actor);
  end loop;

  select array_agg(id order by sku) into v_variants from public.product_variants
  where organization_id = p_org and is_active;

  -- 30 orders spread over the last ~60 days
  for i in 1..30 loop
    v_days := greatest(0, 60 - i * 2 + (floor(random() * 3))::int);
    v_items := jsonb_build_array(jsonb_build_object('variant_id', v_variants[1 + (floor(random() * array_length(v_variants, 1)))::int],
                                                    'quantity', 1 + (floor(random() * 2))::int));
    if random() < 0.45 then
      v_items := v_items || jsonb_build_array(jsonb_build_object('variant_id', v_variants[1 + (floor(random() * array_length(v_variants, 1)))::int], 'quantity', 1));
    end if;

    begin
      v_order := app.do_save_draft_order(p_org, null, jsonb_build_object(
        'customer_id', cust[1 + ((i * 7) % 20)],
        'channel', (array['instagram', 'whatsapp', 'walk-in', 'tiktok'])[1 + (i % 4)],
        'order_date', v_today - v_days,
        'expected_delivery_date', v_today - v_days + 3,
        'delivery_fee', case when i % 3 = 0 then 0 else 2500 end,
        'discount_amount', case when i % 7 = 0 then 1000 else 0 end,
        'items', v_items), p_actor);
    exception when sqlstate 'GO400' then
      continue;
    end;

    -- lifecycle depends on age
    v_status := case
      when i = 30 then 'draft'
      when i in (9, 21) then 'cancelled'
      when v_days > 10 then 'delivered'
      when v_days > 5 then 'dispatched'
      when v_days > 2 then 'processing'
      else 'confirmed' end;

    if v_status = 'draft' then
      update public.orders set updated_at = now() - interval '4 days' where id = v_order;
      continue;
    end if;

    begin
      perform app.do_confirm_order(v_order, p_actor);
    exception when sqlstate 'GO409' then
      delete from public.orders where id = v_order; -- out of stock in generated mix; skip
      continue;
    end;
    update public.orders set confirmed_at = (v_today - v_days)::timestamp + interval '10 hours' where id = v_order;

    if v_status = 'cancelled' then
      perform app.do_cancel_order(v_order, 'Customer changed their mind', p_actor);
      continue;
    end if;
    if v_status in ('processing', 'dispatched', 'delivered') then perform app.do_update_order_status(v_order, 'processing', p_actor); end if;
    if v_status in ('dispatched', 'delivered') then perform app.do_update_order_status(v_order, 'dispatched', p_actor); end if;
    if v_status = 'delivered' then perform app.do_update_order_status(v_order, 'delivered', p_actor); end if;

    select total into v_total from public.orders where id = v_order;
    -- payments: most paid in full, some part-paid, a few unpaid
    if i % 5 = 0 then
      perform app.do_record_payment(v_order, 'payment', round(v_total * 0.5, -2), 'bank_transfer', 'TRF-' || i,
                                    ((v_today - v_days)::timestamp + interval '12 hours') at time zone 'Africa/Lagos', 'Deposit', p_actor);
    elsif i % 6 <> 0 then
      perform app.do_record_payment(v_order, 'payment', v_total, (array['bank_transfer', 'pos', 'cash'])[1 + (i % 3)], 'TRF-' || i,
                                    ((v_today - v_days)::timestamp + interval '14 hours') at time zone 'Africa/Lagos', null, p_actor);
    end if;
  end loop;

  -- one return on a delivered order
  select o.id into v_order from public.orders o where o.organization_id = p_org and o.status = 'delivered'
    and o.payment_status = 'paid' order by o.order_date limit 1;
  if v_order is not null then
    perform app.do_record_return(v_order, jsonb_build_object('restock', true, 'reason', 'Wrong size',
      'items', jsonb_build_array(jsonb_build_object('order_item_id',
        (select id from public.order_items where order_id = v_order order by id limit 1), 'quantity', 1))), p_actor);
  end if;

  -- expenses over the last two months
  select id into cat_rent from public.expense_categories where organization_id = p_org and name = 'Rent';
  select id into cat_sal from public.expense_categories where organization_id = p_org and name = 'Salaries';
  select id into cat_trans from public.expense_categories where organization_id = p_org and name = 'Transport';
  select id into cat_mkt from public.expense_categories where organization_id = p_org and name = 'Marketing';
  select id into cat_util from public.expense_categories where organization_id = p_org and name = 'Utilities';
  select id into cat_pack from public.expense_categories where organization_id = p_org and name = 'Packaging';

  insert into public.expenses (organization_id, category_id, amount, expense_date, description, vendor, payment_method, created_by) values
    (p_org, cat_rent, 150000, date_trunc('month', v_today)::date, 'Shop rent', 'Landlord', 'bank_transfer', p_actor),
    (p_org, cat_rent, 150000, (date_trunc('month', v_today) - interval '1 month')::date, 'Shop rent', 'Landlord', 'bank_transfer', p_actor),
    (p_org, cat_sal, 120000, (date_trunc('month', v_today) - interval '1 month')::date + 27, 'Sales assistant salary', null, 'bank_transfer', p_actor),
    (p_org, cat_mkt, 35000, v_today - 40, 'Instagram ads campaign', 'Meta', 'card', p_actor),
    (p_org, cat_mkt, 25000, v_today - 12, 'Influencer post', '@lagosstyle', 'bank_transfer', p_actor),
    (p_org, cat_trans, 8000, v_today - 33, 'Dispatch rider – mainland deliveries', 'Rider', 'cash', p_actor),
    (p_org, cat_trans, 9500, v_today - 18, 'Dispatch rider – island deliveries', 'Rider', 'cash', p_actor),
    (p_org, cat_trans, 6000, v_today - 4, 'Market run – Balogun', null, 'cash', p_actor),
    (p_org, cat_util, 18000, v_today - 25, 'Electricity token', 'IKEDC', 'mobile_money', p_actor),
    (p_org, cat_util, 15000, v_today - 20, 'Generator fuel', null, 'cash', p_actor),
    (p_org, cat_pack, 12000, v_today - 30, 'Branded nylon bags (200)', 'PackRite', 'bank_transfer', p_actor),
    (p_org, cat_pack, 7500, v_today - 8, 'Gift boxes', 'PackRite', 'bank_transfer', p_actor);

  insert into public.income_records (organization_id, amount, income_date, description, source, created_by) values
    (p_org, 20000, v_today - 15, 'Styling consultation', 'Services', p_actor);

  -- a stock adjustment for history
  perform app.apply_stock_movement((select id from public.product_variants where organization_id = p_org and sku = 'SHEA-250'),
                                   'damage', -2, 0, 'Two jars damaged in transit', null, p_actor);
  perform app.apply_stock_movement((select id from public.product_variants where organization_id = p_org and sku = 'BLK-SOAP'),
                                   'purchase', 24, 0, 'Restock from supplier', null, p_actor);

  -- follow-up tasks
  insert into public.follow_up_tasks (organization_id, title, description, customer_id, due_date, priority, status, source, created_by, assigned_to) values
    (p_org, 'Send new Ankara arrivals to VIP list', 'Share lookbook on WhatsApp', null, v_today, 'medium', 'open', 'manual', p_actor, p_actor),
    (p_org, 'Confirm wig colour preference', null, cust[11], v_today + 1, 'high', 'open', 'manual', p_actor, p_actor),
    (p_org, 'Thank-you call after first order', null, cust[19], v_today + 2, 'low', 'open', 'manual', p_actor, null),
    (p_org, 'Chase supplier for lace restock', 'Ask about delivery date for French lace', null, v_today - 1, 'urgent', 'open', 'manual', p_actor, p_actor),
    (p_org, 'Collect measurement for Senator set', null, cust[4], v_today + 3, 'medium', 'in_progress', 'manual', p_actor, p_actor),
    (p_org, 'Post customer testimonial', null, cust[1], v_today - 6, 'low', 'completed', 'manual', p_actor, p_actor);
  update public.follow_up_tasks set completed_at = now() - interval '5 days', completed_by = p_actor, completion_notes = 'Posted on Instagram stories'
  where organization_id = p_org and status = 'completed';
end $$;

create or replace function public.create_demo_workspace() returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth(); v_org uuid;
begin
  if not coalesce((select enabled from public.feature_flags where key = 'demo_workspaces'), false) then
    perform app.raise('GO403', 'Demo workspaces are currently unavailable');
  end if;
  select o.id into v_org from public.organizations o
  join public.organization_members m on m.organization_id = o.id
  where o.is_demo and m.user_id = v_user and m.role = 'owner' limit 1;
  if v_org is not null then return v_org; end if;

  v_org := app.create_organization(v_user, 'Adaeze Styles & Beauty', 'Fashion & Beauty',
    'Demonstration business — all records are fictional.', 'NG', 'NGN', 'Africa/Lagos', true);
  perform app.seed_org_defaults(v_org);
  update public.business_profiles set business_type = 'products', products_sold = 'Ready-to-wear, fabrics, beauty and hair',
    business_email = 'hello@adaeze-demo.example', phone = '08000000000', address = '12 Admiralty Way, Lekki, Lagos (fictional)',
    order_prefix = 'ADZ', onboarding_completed_at = now()
  where organization_id = v_org;
  perform app.seed_demo_data(v_org, v_user);
  update public.profiles set default_organization_id = coalesce(default_organization_id, v_org) where id = v_user;
  return v_org;
end $$;

create or replace function public.reset_demo_workspace(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := app.require_auth();
begin
  if not exists (select 1 from public.organizations where id = p_org and is_demo) then
    perform app.raise('GO403', 'Only demonstration workspaces can be reset');
  end if;
  if not app.has_permission(p_org, 'demo.reset') then perform app.raise('GO403', 'You cannot reset this demo'); end if;

  delete from public.ai_conversations where organization_id = p_org;
  delete from public.follow_up_tasks where organization_id = p_org;
  delete from public.payments where organization_id = p_org;
  delete from public.order_return_items where organization_id = p_org;
  delete from public.order_returns where organization_id = p_org;
  delete from public.inventory_movements where organization_id = p_org;
  delete from public.order_items where organization_id = p_org;
  delete from public.orders where organization_id = p_org;
  delete from public.product_variants where organization_id = p_org;
  delete from public.products where organization_id = p_org;
  delete from public.product_categories where organization_id = p_org;
  delete from public.customers where organization_id = p_org;
  delete from public.expenses where organization_id = p_org;
  delete from public.income_records where organization_id = p_org;
  update public.business_profiles set next_order_number = 1001, next_customer_number = 1 where organization_id = p_org;
  perform app.seed_demo_data(p_org, v_user);
end $$;
