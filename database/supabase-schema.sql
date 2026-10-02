-- NT Eleganz: execute this once in the Supabase SQL Editor before selecting
-- Supabase in the dashboard. The quoted fields preserve the names used by the site.

create table if not exists public.products (
  id text primary key, brand text, name text, price text, "oldPrice" text,
  badge text, image text, images jsonb default '[]'::jsonb, "imageAssetId" text, colors jsonb default '[]'::jsonb,
  sizes jsonb default '[]'::jsonb, category text, featured boolean default false,
  "desc" text, slug text, active boolean default true, stock integer,
  "inStock" boolean, available boolean, installments integer,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

alter table public.products add column if not exists images jsonb default '[]'::jsonb;
alter table public.products add column if not exists stock integer;
alter table public.products add column if not exists "inStock" boolean;
alter table public.products add column if not exists available boolean;
alter table public.products add column if not exists installments integer;

create table if not exists public.orders (
  id text primary key, client text, phone text, "productId" text, "productName" text,
  "productBrand" text, size text, color text, value text, status text default 'novo',
  notes text, created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.leads (
  id text primary key, source text default 'whatsapp', type text, status text default 'novo',
  "readAt" timestamptz, page text, client text, phone text, "productId" text,
  "productName" text, "productBrand" text, size text, color text, value text,
  "itemCount" integer, "messagePreview" text, created_at timestamptz default now(), updated_at timestamptz default now()
);

create table if not exists public.settings (
  id text primary key, enabled boolean, kicker text, title text, description text,
  cards jsonb default '[]'::jsonb, media jsonb default '[]'::jsonb, items jsonb default '[]'::jsonb,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

alter table public.settings add column if not exists items jsonb default '[]'::jsonb;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role = 'admin'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Recommended public-read + public-lead-insert access. Protect administrative
-- writes with your Supabase Auth users before publishing the admin dashboard.
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.leads enable row level security;
alter table public.settings enable row level security;
alter table public.admin_users enable row level security;

drop policy if exists "admins read own access" on public.admin_users;
create policy "admins read own access" on public.admin_users
  for select to authenticated using (user_id = auth.uid() and active = true);

drop policy if exists "storefront reads products" on public.products;
create policy "storefront reads products" on public.products for select using (true);
drop policy if exists "storefront reads settings" on public.settings;
create policy "storefront reads settings" on public.settings for select using (true);
drop policy if exists "storefront creates leads" on public.leads;
create policy "storefront creates leads" on public.leads for insert with check (source = 'whatsapp');

-- The dashboard uses Supabase Auth. Administrative writes are restricted to
-- authenticated users listed in admin_users with the admin role.
drop policy if exists "dashboard manages products" on public.products;
create policy "dashboard manages products" on public.products
  for all to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid() and role = 'admin' and active = true))
  with check (exists (select 1 from public.admin_users where user_id = auth.uid() and role = 'admin' and active = true));

drop policy if exists "dashboard manages orders" on public.orders;
create policy "dashboard manages orders" on public.orders
  for all to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid() and role = 'admin' and active = true))
  with check (exists (select 1 from public.admin_users where user_id = auth.uid() and role = 'admin' and active = true));

drop policy if exists "dashboard manages leads" on public.leads;
create policy "dashboard manages leads" on public.leads
  for select to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid() and role = 'admin' and active = true));

drop policy if exists "dashboard updates leads" on public.leads;
create policy "dashboard updates leads" on public.leads
  for update to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid() and role = 'admin' and active = true))
  with check (exists (select 1 from public.admin_users where user_id = auth.uid() and role = 'admin' and active = true));

drop policy if exists "dashboard manages settings" on public.settings;
create policy "dashboard manages settings" on public.settings
  for all to authenticated
  using (exists (select 1 from public.admin_users where user_id = auth.uid() and role = 'admin' and active = true))
  with check (exists (select 1 from public.admin_users where user_id = auth.uid() and role = 'admin' and active = true));

grant select on public.products, public.settings to anon;
grant insert on public.leads to anon;
grant select, insert, update, delete on public.products, public.orders, public.leads, public.settings to authenticated;
