-- =====================================================================
--  Update 1: editable site text and home page picture
--  If you already ran schema.sql before, run ONLY this file once in
--  Supabase → SQL Editor. (New installs: schema.sql already includes it.)
-- =====================================================================

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
