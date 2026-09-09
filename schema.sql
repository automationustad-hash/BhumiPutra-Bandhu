-- ============================================================
-- BHUMIPUTRA-BANDHU — Supabase database schema
-- Run this once in Supabase: Dashboard → SQL Editor → New query → paste → Run
-- ============================================================

-- Needed for gen_random_uuid()
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1. PROFILES  (one row per signed-up user; row id = auth.users.id)
-- ------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('farmer','buyer','admin')),
  status      text not null default 'pending' check (status in ('pending','approved','rejected','suspended')),
  name        text,
  mobile      text,
  -- farmer-only fields
  land        text,
  village     text,
  -- buyer-only fields
  address     text,
  -- shared
  pincode     text,
  lat         double precision,
  lon         double precision,
  created_at  timestamptz not null default now()
);

alter table profiles enable row level security;

-- Anyone signed in can read any profile (needed so farmers/buyers can see each
-- other's name, village, distance, etc.) — nothing sensitive like auth is exposed here.
create policy "profiles are readable by any signed-in user"
  on profiles for select
  using (auth.uid() is not null);

-- A user can create their own profile row once, right after signing up.
create policy "users can insert their own profile"
  on profiles for insert
  with check (auth.uid() = id);

-- A user can edit their own profile fields, but NOT their own status or role
-- (those are admin-controlled — enforced by the trigger below).
create policy "users can update their own profile"
  on profiles for update
  using (auth.uid() = id);

-- Admins can update anyone's profile (used for approve / reject / suspend / reactivate).
create policy "admins can update any profile"
  on profiles for update
  using (exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin'));

-- Prevent a non-admin from silently promoting themself or self-approving.
create or replace function prevent_self_privilege_escalation()
returns trigger as $$
begin
  if (select role from profiles where id = auth.uid()) <> 'admin' then
    if new.role <> old.role or new.status <> old.status then
      raise exception 'Only an admin can change role or status.';
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_prevent_privilege_escalation
  before update on profiles
  for each row execute function prevent_self_privilege_escalation();

-- ------------------------------------------------------------
-- 2. PRODUCTS  (farmer listings)
-- ------------------------------------------------------------
create table products (
  id          uuid primary key default gen_random_uuid(),
  farmer_id   uuid not null references profiles(id) on delete cascade,
  name        text not null,
  category    text not null,
  price       numeric not null check (price > 0),
  unit        text not null,
  qty         numeric,               -- null = no cap set
  notes       text,
  listed_at   timestamptz not null default now()
);

alter table products enable row level security;

create policy "products are readable by any signed-in user"
  on products for select
  using (auth.uid() is not null);

create policy "approved farmers can list their own products"
  on products for insert
  with check (
    farmer_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'farmer' and p.status = 'approved')
  );

create policy "farmers can edit or remove their own products"
  on products for update using (farmer_id = auth.uid());

create policy "farmers can delete their own products"
  on products for delete using (farmer_id = auth.uid());

-- ------------------------------------------------------------
-- 3. ORDERS  (a buyer's request against a product, through its full lifecycle)
-- ------------------------------------------------------------
create table orders (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid references products(id) on delete set null,
  product_name   text not null,
  unit           text not null,
  price          numeric not null,
  qty_requested  numeric not null check (qty_requested > 0),
  farmer_id      uuid not null references profiles(id),
  buyer_id       uuid not null references profiles(id),
  status         text not null default 'pending' check (status in ('pending','accepted','declined')),
  delivery_method text,
  requested_at   timestamptz not null default now(),
  accepted_at    timestamptz,
  delivered_at   timestamptz,
  received_at    timestamptz
);

alter table orders enable row level security;

create policy "orders are readable by the buyer, the farmer, or an admin"
  on orders for select
  using (
    buyer_id = auth.uid() or farmer_id = auth.uid()
    or exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "approved buyers can create an order"
  on orders for insert
  with check (
    buyer_id = auth.uid()
    and exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'buyer' and p.status = 'approved')
  );

-- Farmer can accept/decline, set delivery_method, mark delivered.
-- Buyer can set delivery_method, confirm received.
-- (Column-level restriction is left to the app layer for simplicity; see README.)
create policy "farmer or buyer involved can update the order"
  on orders for update
  using (buyer_id = auth.uid() or farmer_id = auth.uid());

-- Prevent ordering more than what's actually left in stock (mirrors the demo's "order book" logic).
create or replace function check_stock_before_order()
returns trigger as $$
declare
  cap numeric;
  already_sold numeric;
begin
  select qty into cap from products where id = new.product_id;
  if cap is not null then
    select coalesce(sum(qty_requested), 0) into already_sold
      from orders where product_id = new.product_id and status = 'accepted';
    if already_sold + new.qty_requested > cap then
      raise exception 'Only % % left for this listing.', (cap - already_sold), new.unit;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

create trigger trg_check_stock
  before insert on orders
  for each row execute function check_stock_before_order();

-- ------------------------------------------------------------
-- 4. ORDER MESSAGES  (per-order coordination chat)
-- ------------------------------------------------------------
create table order_messages (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  sender_id   uuid not null references profiles(id),
  text        text not null,
  created_at  timestamptz not null default now()
);

alter table order_messages enable row level security;

create policy "messages readable by the order's buyer or farmer"
  on order_messages for select
  using (
    exists (
      select 1 from orders o
      where o.id = order_id and (o.buyer_id = auth.uid() or o.farmer_id = auth.uid())
    )
  );

create policy "messages insertable by the order's buyer or farmer"
  on order_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from orders o
      where o.id = order_id and (o.buyer_id = auth.uid() or o.farmer_id = auth.uid())
    )
  );

-- ------------------------------------------------------------
-- 5. Realtime (optional but recommended — powers live updates without refresh)
-- ------------------------------------------------------------
alter publication supabase_realtime add table products;
alter publication supabase_realtime add table orders;
alter publication supabase_realtime add table order_messages;
alter publication supabase_realtime add table profiles;

-- ------------------------------------------------------------
-- 6. First admin account
-- ------------------------------------------------------------
-- After you sign up once through the app (as either role — it won't matter),
-- come back here and run, replacing the email:
--
--   update profiles set role = 'admin', status = 'approved'
--   where email = 'you@example.com';
