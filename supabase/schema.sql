-- =====================================================================
--  HSU Peradeniya – A/L Digital Resource Centre
--  Run this whole file once in Supabase → SQL Editor → New query → Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------
-- 1. Admins (only people listed here can change anything)
-- ---------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------
-- 2. Categories (unlimited nesting: Subject → Section → Topic …)
-- ---------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.categories(id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  description text,
  icon        text,                       -- optional emoji, e.g. ⚛️ 🧪 🧬
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists categories_parent_idx on public.categories(parent_id);

-- ---------------------------------------------------------------
-- 3. Resources (PDFs, files, Drive links, YouTube, web links)
-- ---------------------------------------------------------------
create table if not exists public.resources (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references public.categories(id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 200),
  description  text,
  kind         text not null check (kind in ('pdf','file','drive','youtube','link')),
  url          text,                      -- for drive / youtube / link
  file_path    text,                      -- for uploaded pdf / file (path in storage)
  year         int,                       -- e.g. past paper year
  medium       text,                      -- Tamil / English / Sinhala
  sort_order   int  not null default 0,
  is_published boolean not null default true,
  created_at   timestamptz not null default now(),
  constraint resource_has_target check (url is not null or file_path is not null)
);
create index if not exists resources_category_idx on public.resources(category_id);
create index if not exists resources_created_idx  on public.resources(created_at desc);

-- ---------------------------------------------------------------
-- 4. Resource counts per category (respects the rules below)
-- ---------------------------------------------------------------
create or replace view public.category_counts
with (security_invoker = true) as
  select category_id, count(*)::int as total
  from public.resources
  group by category_id;

grant select on public.category_counts to anon, authenticated;

-- ---------------------------------------------------------------
-- 5. Row Level Security: everyone can read, only admins can write
-- ---------------------------------------------------------------
alter table public.admins     enable row level security;
alter table public.categories enable row level security;
alter table public.resources  enable row level security;

drop policy if exists "admins read own row" on public.admins;
create policy "admins read own row" on public.admins
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "categories public read" on public.categories;
create policy "categories public read" on public.categories
  for select using (true);

drop policy if exists "categories admin insert" on public.categories;
create policy "categories admin insert" on public.categories
  for insert to authenticated with check (public.is_admin());

drop policy if exists "categories admin update" on public.categories;
create policy "categories admin update" on public.categories
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "categories admin delete" on public.categories;
create policy "categories admin delete" on public.categories
  for delete to authenticated using (public.is_admin());

drop policy if exists "resources public read" on public.resources;
create policy "resources public read" on public.resources
  for select using (is_published or public.is_admin());

drop policy if exists "resources admin insert" on public.resources;
create policy "resources admin insert" on public.resources
  for insert to authenticated with check (public.is_admin());

drop policy if exists "resources admin update" on public.resources;
create policy "resources admin update" on public.resources
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "resources admin delete" on public.resources;
create policy "resources admin delete" on public.resources
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------
-- 6. File storage bucket for PDFs and other uploads
-- ---------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('resources', 'resources', true)
on conflict (id) do update set public = true;

drop policy if exists "resources files public read" on storage.objects;
create policy "resources files public read" on storage.objects
  for select using (bucket_id = 'resources');

drop policy if exists "resources files admin upload" on storage.objects;
create policy "resources files admin upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'resources' and public.is_admin());

drop policy if exists "resources files admin update" on storage.objects;
create policy "resources files admin update" on storage.objects
  for update to authenticated using (bucket_id = 'resources' and public.is_admin());

drop policy if exists "resources files admin delete" on storage.objects;
create policy "resources files admin delete" on storage.objects
  for delete to authenticated using (bucket_id = 'resources' and public.is_admin());

-- ---------------------------------------------------------------
-- 7. Site settings (editable text and home page picture)
-- ---------------------------------------------------------------

create table if not exists public.site_settings (
  id         int primary key default 1 check (id = 1),   -- always a single row
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id) values (1) on conflict (id) do nothing;

alter table public.site_settings enable row level security;

drop policy if exists "settings public read" on public.site_settings;
create policy "settings public read" on public.site_settings
  for select using (true);

drop policy if exists "settings admin insert" on public.site_settings;
create policy "settings admin insert" on public.site_settings
  for insert to authenticated with check (public.is_admin());

drop policy if exists "settings admin update" on public.site_settings;
create policy "settings admin update" on public.site_settings
  for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- =====================================================================
--  AFTER running this file:
--  1. Authentication → Users → Add user (your email + password, auto-confirm)
--  2. Make that user an admin (change the email):
--
--     insert into public.admins (user_id)
--     select id from auth.users where email = 'you@example.com';
-- =====================================================================
