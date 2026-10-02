-- NT Eleganz — Registro automático de pedidos do site
-- Execute uma vez no SQL Editor do Supabase (depois do supabase-schema.sql).
-- Permite que o checkout do site grave o pedido, sem permitir que visitantes
-- leiam os pedidos de outras pessoas.

alter table public.orders add column if not exists source text default 'dashboard';

drop policy if exists "storefront creates orders" on public.orders;
create policy "storefront creates orders" on public.orders
  for insert to anon
  with check (source = 'site');

grant insert on public.orders to anon;
