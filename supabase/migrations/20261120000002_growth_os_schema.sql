-- ============================================================================
-- 0002 GROWTH OS SCHEMA
-- Every table carries organization_id and is protected by RLS that requires
-- (a) workspace membership with the right permission, (b) the workspace being
-- entitled to Growth OS and, for writes, (c) an active/trial subscription.
-- Money: numeric(14,2). Quantities: integer.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Business profile & settings (1:1 with organization)
-- ---------------------------------------------------------------------------
create table public.business_profiles (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  business_type text check (business_type in ('products', 'services', 'both')),
  products_sold text,
  product_count_range text,
  employee_count_range text,
  business_email text,
  phone text,
  address text,
  logo_path text,
  -- reserve_on_confirm: stock reserved at confirmation, deducted at dispatch/delivery
  -- deduct_on_confirm : stock deducted immediately at confirmation
  stock_policy text not null default 'reserve_on_confirm' check (stock_policy in ('reserve_on_confirm', 'deduct_on_confirm')),
  allow_negative_stock boolean not null default false,
  order_prefix text not null default 'ORD' check (order_prefix ~ '^[A-Z0-9]{1,8}$'),
  next_order_number integer not null default 1001,
  next_customer_number integer not null default 1,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger business_profiles_updated_at before update on public.business_profiles
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Customers
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  customer_code text not null,
  full_name text not null check (char_length(trim(full_name)) between 1 and 160),
  phone text,
  phone_normalized text generated always as (
    case
      when phone is null then null
      when regexp_replace(phone, '\D', '', 'g') ~ '^0\d{10}$' then '234' || substr(regexp_replace(phone, '\D', '', 'g'), 2)
      else nullif(regexp_replace(phone, '\D', '', 'g'), '')
    end
  ) stored,
  email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  location text,
  address text,
  notes text,
  source text,                         -- instagram, whatsapp, walk-in, referral, import …
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, customer_code)
);
create index customers_org_idx on public.customers(organization_id, created_at desc);
create index customers_phone_idx on public.customers(organization_id, phone_normalized);
create index customers_email_idx on public.customers(organization_id, lower(email));
create index customers_name_idx on public.customers(organization_id, lower(full_name));
create trigger customers_updated_at before update on public.customers
  for each row execute function app.set_updated_at();

create or replace function app.assign_customer_code() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_next int;
begin
  if new.customer_code is null or new.customer_code = '' then
    insert into public.business_profiles (organization_id) values (new.organization_id) on conflict do nothing;
    update public.business_profiles set next_customer_number = next_customer_number + 1
      where organization_id = new.organization_id
      returning next_customer_number - 1 into v_next;
    new.customer_code := 'CUS-' || lpad(v_next::text, 4, '0');
  end if;
  return new;
end $$;
create trigger customers_assign_code before insert on public.customers
  for each row execute function app.assign_customer_code();

-- ---------------------------------------------------------------------------
-- Catalogue: categories, products, variants (stock lives on variants;
-- products without options have exactly one default variant)
-- ---------------------------------------------------------------------------
create table public.product_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  created_at timestamptz not null default now()
);
create unique index product_categories_name_uq on public.product_categories(organization_id, lower(name));

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid references public.product_categories(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 160),
  sku text,
  description text,
  image_path text,
  cost_price numeric(14,2) not null default 0 check (cost_price >= 0),
  selling_price numeric(14,2) not null default 0 check (selling_price >= 0),
  low_stock_threshold integer not null default 5 check (low_stock_threshold >= 0),
  has_variants boolean not null default false,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index products_org_idx on public.products(organization_id, created_at desc);
create index products_name_idx on public.products(organization_id, lower(name));
create trigger products_updated_at before update on public.products
  for each row execute function app.set_updated_at();

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null default 'Default',
  options jsonb not null default '{}'::jsonb,     -- {"Colour": "Blue", "Size": "M"}
  sku text not null,
  cost_price numeric(14,2) check (cost_price is null or cost_price >= 0),      -- null = inherit product
  selling_price numeric(14,2) check (selling_price is null or selling_price >= 0),
  low_stock_threshold integer check (low_stock_threshold is null or low_stock_threshold >= 0),
  quantity_on_hand integer not null default 0,
  quantity_reserved integer not null default 0 check (quantity_reserved >= 0),
  is_default boolean not null default false,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index product_variants_sku_uq on public.product_variants(organization_id, lower(sku));
create index product_variants_product_idx on public.product_variants(product_id);
create trigger product_variants_updated_at before update on public.product_variants
  for each row execute function app.set_updated_at();

-- Stock may only change through app.apply_stock_movement (keeps the ledger complete).
create or replace function app.guard_variant_stock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.quantity_on_hand is distinct from old.quantity_on_hand
      or new.quantity_reserved is distinct from old.quantity_reserved)
     and coalesce(current_setting('app.stock_write', true), '') <> 'on' then
    perform app.raise('GO400', 'Stock levels can only be changed through stock movements');
  end if;
  return new;
end $$;
create trigger product_variants_guard_stock before update on public.product_variants
  for each row execute function app.guard_variant_stock();

create or replace function app.guard_variant_insert_stock() returns trigger
language plpgsql set search_path = '' as $$
begin
  if (new.quantity_on_hand <> 0 or new.quantity_reserved <> 0)
     and coalesce(current_setting('app.stock_write', true), '') <> 'on' then
    perform app.raise('GO400', 'Opening stock must be recorded as a stock movement');
  end if;
  return new;
end $$;
create trigger product_variants_guard_insert_stock before insert on public.product_variants
  for each row execute function app.guard_variant_insert_stock();

-- ---------------------------------------------------------------------------
-- Customers & orders
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_number text not null,
  customer_id uuid references public.customers(id) on delete restrict,
  status text not null default 'draft'
    check (status in ('draft', 'confirmed', 'processing', 'ready', 'dispatched', 'delivered', 'cancelled')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'partially_paid', 'paid', 'refunded')),
  stock_state text not null default 'none' check (stock_state in ('none', 'reserved', 'deducted', 'released')),
  channel text,
  order_date date not null,
  expected_delivery_date date,
  subtotal numeric(14,2) not null default 0,
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  delivery_fee numeric(14,2) not null default 0 check (delivery_fee >= 0),
  total numeric(14,2) not null default 0 check (total >= 0),
  returns_total numeric(14,2) not null default 0 check (returns_total >= 0),
  amount_paid numeric(14,2) not null default 0,         -- payments minus refunds
  amount_refunded numeric(14,2) not null default 0 check (amount_refunded >= 0),
  balance_due numeric(14,2) not null default 0,          -- negative = customer is owed money
  cost_total numeric(14,2) not null default 0,           -- COGS snapshot of the items
  notes text,
  delivery_address text,
  confirmed_at timestamptz,
  dispatched_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancel_reason text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, order_number)
);
create index orders_org_date_idx on public.orders(organization_id, order_date desc);
create index orders_org_status_idx on public.orders(organization_id, status);
create index orders_customer_idx on public.orders(customer_id);
create trigger orders_updated_at before update on public.orders
  for each row execute function app.set_updated_at();

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  product_name text not null,        -- snapshots so history survives catalogue edits
  variant_name text,
  sku text,
  quantity integer not null check (quantity > 0),
  unit_price numeric(14,2) not null check (unit_price >= 0),
  unit_cost numeric(14,2) not null default 0 check (unit_cost >= 0),
  discount_amount numeric(14,2) not null default 0 check (discount_amount >= 0),
  line_total numeric(14,2) not null check (line_total >= 0),
  returned_quantity integer not null default 0 check (returned_quantity >= 0),
  created_at timestamptz not null default now(),
  check (returned_quantity <= quantity)
);
create index order_items_order_idx on public.order_items(order_id);
create index order_items_variant_idx on public.order_items(variant_id);

-- Append-only stock ledger.
create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  movement_type text not null check (movement_type in (
    'opening', 'purchase', 'adjustment', 'damage', 'sale', 'return',
    'reservation', 'reservation_release', 'cancellation_restock')),
  quantity_change integer not null default 0,     -- delta to on-hand
  reserved_change integer not null default 0,     -- delta to reserved
  quantity_after integer not null,
  reserved_after integer not null,
  reason text,
  order_id uuid references public.orders(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index inventory_movements_variant_idx on public.inventory_movements(variant_id, created_at desc);
create index inventory_movements_org_idx on public.inventory_movements(organization_id, created_at desc);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete restrict,
  customer_id uuid references public.customers(id) on delete set null,
  kind text not null default 'payment' check (kind in ('payment', 'refund')),
  amount numeric(14,2) not null check (amount > 0),
  method text not null default 'bank_transfer'
    check (method in ('cash', 'bank_transfer', 'pos', 'card', 'mobile_money', 'other')),
  reference text,
  paid_at timestamptz not null default now(),
  notes text,
  voided_at timestamptz,
  void_reason text,
  recorded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index payments_org_paid_idx on public.payments(organization_id, paid_at desc);
create index payments_order_idx on public.payments(order_id);

create table public.order_returns (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete restrict,
  return_date date not null,
  reason text,
  restocked boolean not null default true,
  credit_amount numeric(14,2) not null check (credit_amount >= 0),   -- reduces the order's value
  cost_reversed numeric(14,2) not null default 0,                    -- COGS reversed (when restocked)
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_returns_org_idx on public.order_returns(organization_id, return_date desc);

create table public.order_return_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  return_id uuid not null references public.order_returns(id) on delete cascade,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  credit_amount numeric(14,2) not null check (credit_amount >= 0)
);

-- ---------------------------------------------------------------------------
-- Finance
-- ---------------------------------------------------------------------------
create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  is_system boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index expense_categories_name_uq on public.expense_categories(organization_id, lower(name));

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  category_id uuid not null references public.expense_categories(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  expense_date date not null,
  description text not null check (char_length(trim(description)) between 1 and 300),
  vendor text,
  payment_method text check (payment_method in ('cash', 'bank_transfer', 'pos', 'card', 'mobile_money', 'other')),
  reference text,
  receipt_path text,
  voided_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_org_date_idx on public.expenses(organization_id, expense_date desc);
create trigger expenses_updated_at before update on public.expenses
  for each row execute function app.set_updated_at();

create table public.income_records (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  income_date date not null,
  description text not null check (char_length(trim(description)) between 1 and 300),
  source text,
  voided_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index income_records_org_date_idx on public.income_records(organization_id, income_date desc);
create trigger income_records_updated_at before update on public.income_records
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- Follow-ups
-- ---------------------------------------------------------------------------
create table public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text,
  customer_id uuid references public.customers(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  due_date date not null,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  snoozed_until date,
  assigned_to uuid references auth.users(id) on delete set null,
  completion_notes text,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  source text not null default 'manual' check (source in ('manual', 'suggested')),
  suggestion_key text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index follow_up_tasks_org_due_idx on public.follow_up_tasks(organization_id, status, due_date);
create unique index follow_up_tasks_suggestion_uq on public.follow_up_tasks(organization_id, suggestion_key)
  where suggestion_key is not null and status in ('open', 'in_progress');
create trigger follow_up_tasks_updated_at before update on public.follow_up_tasks
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- AI conversations (private to the user who created them, within the workspace)
-- ---------------------------------------------------------------------------
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ai_conversations_user_idx on public.ai_conversations(organization_id, user_id, updated_at desc);
create trigger ai_conversations_updated_at before update on public.ai_conversations
  for each row execute function app.set_updated_at();

create table public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  sources jsonb not null default '[]'::jsonb,   -- tool calls used to answer (name, args, summary)
  created_at timestamptz not null default now()
);
create index ai_messages_conversation_idx on public.ai_messages(conversation_id, created_at);

-- ---------------------------------------------------------------------------
-- Derived customer metrics (security_invoker: obeys the caller's RLS)
-- ---------------------------------------------------------------------------
create view public.customer_summaries with (security_invoker = on) as
select
  c.id, c.organization_id, c.customer_code, c.full_name, c.phone, c.email, c.location, c.address,
  c.notes, c.source, c.archived_at, c.created_at,
  coalesce(s.total_orders, 0)::int as total_orders,
  coalesce(s.total_spent, 0)::numeric(14,2) as total_spent,
  coalesce(s.outstanding_balance, 0)::numeric(14,2) as outstanding_balance,
  s.last_purchase_date
from public.customers c
left join lateral (
  select count(*) as total_orders,
         sum(o.total - o.returns_total) as total_spent,
         sum(greatest(o.balance_due, 0)) as outstanding_balance,
         max(o.order_date) as last_purchase_date
  from public.orders o
  where o.customer_id = c.id and o.status not in ('draft', 'cancelled')
) s on true;

create view public.variant_stock with (security_invoker = on) as
select
  v.id as variant_id, v.organization_id, v.product_id, p.name as product_name, v.name as variant_name, v.sku,
  p.category_id, v.quantity_on_hand, v.quantity_reserved,
  (v.quantity_on_hand - v.quantity_reserved) as quantity_available,
  coalesce(v.low_stock_threshold, p.low_stock_threshold) as low_stock_threshold,
  coalesce(v.cost_price, p.cost_price) as cost_price,
  coalesce(v.selling_price, p.selling_price) as selling_price,
  v.is_default, p.has_variants,
  (v.is_active and p.is_active and v.archived_at is null and p.archived_at is null) as is_sellable
from public.product_variants v
join public.products p on p.id = v.product_id;

-- ===========================================================================
-- Cross-tenant reference guards
-- ===========================================================================
-- True when p_id is null or the referenced row belongs to p_org.
create or replace function app.same_org(p_org uuid, p_table text, p_id uuid) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare v boolean;
begin
  if p_id is null then return true; end if;
  if p_table not in ('customers', 'orders', 'products', 'product_categories', 'expense_categories') then
    return false;
  end if;
  execute format('select exists (select 1 from public.%I where id = $1 and organization_id = $2)', p_table)
    into v using p_id, p_org;
  return v;
end $$;

-- A task may be assigned to yourself, or to any active member if you hold tasks.assign.
create or replace function app.assignable(p_org uuid, p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_user is null
      or (p_user = auth.uid())
      or (app.has_permission(p_org, 'tasks.assign') and exists (
            select 1 from public.organization_members m
            where m.organization_id = p_org and m.user_id = p_user and m.status = 'active'))
$$;

-- Rows can never be moved between workspaces.
create or replace function app.prevent_org_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.organization_id is distinct from old.organization_id then
    perform app.raise('GO403', 'Records cannot be moved between workspaces');
  end if;
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['business_profiles','customers','product_categories','products','product_variants',
    'inventory_movements','orders','order_items','payments','order_returns','order_return_items',
    'expense_categories','expenses','income_records','follow_up_tasks','ai_conversations','ai_messages']
  loop
    execute format('create trigger %I before update on public.%I for each row execute function app.prevent_org_change()',
                   t || '_org_immutable', t);
  end loop;
end $$;

-- ===========================================================================
-- RLS
-- ===========================================================================
do $$
declare t text;
begin
  foreach t in array array['business_profiles','customers','product_categories','products','product_variants',
    'inventory_movements','orders','order_items','payments','order_returns','order_return_items',
    'expense_categories','expenses','income_records','follow_up_tasks','ai_conversations','ai_messages']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;

-- business_profiles
create policy bp_select on public.business_profiles for select to authenticated
  using (app.is_member(organization_id) and app.has_product(organization_id, 'growth-os'));
create policy bp_update on public.business_profiles for update to authenticated
  using (app.growth_write(organization_id, 'settings.manage'))
  with check (app.growth_write(organization_id, 'settings.manage'));
revoke update on public.business_profiles from authenticated;
grant update (business_type, products_sold, product_count_range, employee_count_range, business_email, phone,
              address, logo_path, stock_policy, allow_negative_stock, order_prefix, onboarding_completed_at)
  on public.business_profiles to authenticated;

-- customers
create policy customers_select on public.customers for select to authenticated
  using (app.growth_read(organization_id, 'customers.read'));
create policy customers_insert on public.customers for insert to authenticated
  with check (app.growth_write(organization_id, 'customers.write'));
create policy customers_update on public.customers for update to authenticated
  using (app.growth_write(organization_id, 'customers.write'))
  with check (app.growth_write(organization_id, 'customers.write'));
create policy customers_delete on public.customers for delete to authenticated
  using (app.growth_write(organization_id, 'customers.delete'));
revoke update on public.customers from authenticated;
grant update (full_name, phone, email, location, address, notes, source, archived_at) on public.customers to authenticated;

-- catalogue
create policy categories_select on public.product_categories for select to authenticated
  using (app.growth_read(organization_id, 'products.read'));
create policy categories_write on public.product_categories for all to authenticated
  using (app.growth_write(organization_id, 'products.write'))
  with check (app.growth_write(organization_id, 'products.write'));

create policy products_select on public.products for select to authenticated
  using (app.growth_read(organization_id, 'products.read'));
create policy products_insert on public.products for insert to authenticated
  with check (app.growth_write(organization_id, 'products.write') and app.same_org(organization_id, 'product_categories', category_id));
create policy products_update on public.products for update to authenticated
  using (app.growth_write(organization_id, 'products.write'))
  with check (app.growth_write(organization_id, 'products.write') and app.same_org(organization_id, 'product_categories', category_id));
create policy products_delete on public.products for delete to authenticated
  using (app.growth_write(organization_id, 'products.delete'));

create policy variants_select on public.product_variants for select to authenticated
  using (app.growth_read(organization_id, 'products.read'));
create policy variants_insert on public.product_variants for insert to authenticated
  with check (app.growth_write(organization_id, 'products.write')
              and exists (select 1 from public.products p where p.id = product_id and p.organization_id = product_variants.organization_id));
create policy variants_update on public.product_variants for update to authenticated
  using (app.growth_write(organization_id, 'products.write'))
  with check (app.growth_write(organization_id, 'products.write'));
revoke update on public.product_variants from authenticated;
grant update (name, options, sku, cost_price, selling_price, low_stock_threshold, is_active, archived_at) on public.product_variants to authenticated;

-- ledger tables: read-only to clients; written by SECURITY DEFINER functions
create policy movements_select on public.inventory_movements for select to authenticated
  using (app.growth_read(organization_id, 'products.read'));
create policy orders_select on public.orders for select to authenticated
  using (app.growth_read(organization_id, 'orders.read'));
create policy order_items_select on public.order_items for select to authenticated
  using (app.growth_read(organization_id, 'orders.read'));
create policy payments_select on public.payments for select to authenticated
  using (app.growth_read(organization_id, 'orders.read'));
create policy returns_select on public.order_returns for select to authenticated
  using (app.growth_read(organization_id, 'orders.read'));
create policy return_items_select on public.order_return_items for select to authenticated
  using (app.growth_read(organization_id, 'orders.read'));
revoke insert, update, delete on public.inventory_movements, public.orders, public.order_items, public.payments,
  public.order_returns, public.order_return_items from authenticated;

-- finance
create policy expense_categories_select on public.expense_categories for select to authenticated
  using (app.growth_read(organization_id, 'finance.read'));
create policy expense_categories_write on public.expense_categories for all to authenticated
  using (app.growth_write(organization_id, 'finance.write') and not is_system)
  with check (app.growth_write(organization_id, 'finance.write') and not is_system);

create policy expenses_select on public.expenses for select to authenticated
  using (app.growth_read(organization_id, 'finance.read'));
create policy expenses_insert on public.expenses for insert to authenticated
  with check (app.growth_write(organization_id, 'finance.write')
              and exists (select 1 from public.expense_categories c where c.id = category_id and c.organization_id = expenses.organization_id));
create policy expenses_update on public.expenses for update to authenticated
  using (app.growth_write(organization_id, 'finance.write'))
  with check (app.growth_write(organization_id, 'finance.write')
              and exists (select 1 from public.expense_categories c where c.id = category_id and c.organization_id = expenses.organization_id));

create policy income_select on public.income_records for select to authenticated
  using (app.growth_read(organization_id, 'finance.read'));
create policy income_insert on public.income_records for insert to authenticated
  with check (app.growth_write(organization_id, 'finance.write'));
create policy income_update on public.income_records for update to authenticated
  using (app.growth_write(organization_id, 'finance.write'))
  with check (app.growth_write(organization_id, 'finance.write'));
-- no deletes on financial records: they are voided (voided_at) for auditability
revoke delete on public.expenses, public.income_records from authenticated;

-- tasks
create policy tasks_select on public.follow_up_tasks for select to authenticated
  using (app.growth_read(organization_id, 'tasks.read'));
create policy tasks_insert on public.follow_up_tasks for insert to authenticated
  with check (app.growth_write(organization_id, 'tasks.write')
              and app.same_org(organization_id, 'customers', customer_id)
              and app.same_org(organization_id, 'orders', order_id)
              and app.assignable(organization_id, assigned_to));
create policy tasks_update on public.follow_up_tasks for update to authenticated
  using (app.growth_write(organization_id, 'tasks.write'))
  with check (app.growth_write(organization_id, 'tasks.write')
              and app.same_org(organization_id, 'customers', customer_id)
              and app.same_org(organization_id, 'orders', order_id)
              and app.assignable(organization_id, assigned_to));
create policy tasks_delete on public.follow_up_tasks for delete to authenticated
  using (app.growth_write(organization_id, 'tasks.write') and app.has_permission(organization_id, 'tasks.assign'));

-- AI conversations: private to their owner and only while they remain a member
create policy ai_conv_select on public.ai_conversations for select to authenticated
  using (user_id = auth.uid() and app.growth_read(organization_id, 'ai.use'));
create policy ai_conv_insert on public.ai_conversations for insert to authenticated
  with check (user_id = auth.uid() and app.growth_read(organization_id, 'ai.use'));
create policy ai_conv_update on public.ai_conversations for update to authenticated
  using (user_id = auth.uid() and app.growth_read(organization_id, 'ai.use'))
  with check (user_id = auth.uid() and app.growth_read(organization_id, 'ai.use'));
create policy ai_conv_delete on public.ai_conversations for delete to authenticated
  using (user_id = auth.uid() and app.is_member(organization_id));
create policy ai_msg_select on public.ai_messages for select to authenticated
  using (exists (select 1 from public.ai_conversations c where c.id = conversation_id and c.user_id = auth.uid())
         and app.growth_read(organization_id, 'ai.use'));
revoke insert, update, delete on public.ai_messages from authenticated;
