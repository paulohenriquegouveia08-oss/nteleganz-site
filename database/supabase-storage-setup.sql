-- ============================================
-- NT ELEGANZ — SUPABASE STORAGE SETUP (item 1 do relatório técnico)
--
-- Executar UMA vez no Supabase (Dashboard → SQL Editor → New query).
-- Cria o bucket público "product-images" e as políticas de acesso:
--   - leitura pública (URLs usadas no catálogo e na loja)
--   - upload/update/delete apenas para usuários autenticados (admin)
--
-- Depois de executar, usar a página:  admin/migrar-imagens.html
-- ============================================

-- 1) Bucket público (idempotente: se já existir, apenas garante public = true)
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

-- 2) Leitura pública (necessária para as URLs de produto aparecerem na loja)
drop policy if exists "product-images public read" on storage.objects;
create policy "product-images public read"
  on storage.objects
  for select
  using (bucket_id = 'product-images');

-- 3) Upload pelo admin autenticado
drop policy if exists "product-images authenticated insert" on storage.objects;
create policy "product-images authenticated insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'product-images');

-- 4) Atualizar arquivos (reupload / overwrite)
drop policy if exists "product-images authenticated update" on storage.objects;
create policy "product-images authenticated update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'product-images');

-- 5) Excluir arquivos de produtos removidos
drop policy if exists "product-images authenticated delete" on storage.objects;
create policy "product-images authenticated delete"
  on storage.objects
  for delete
  to authenticated
  using (bucket_id = 'product-images');

-- Observação: a tabela public.products já aceita URLs em "image" (text) e
-- "images" (jsonb). Não é necessária alteração de schema.