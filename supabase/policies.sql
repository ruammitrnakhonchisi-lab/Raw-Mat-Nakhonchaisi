-- ==========================================================
--  Stock Pro — policies.sql
--  รันหลัง schema.sql
-- ==========================================================

-- ---------- helper functions (SECURITY DEFINER เพื่อเลี่ยง RLS recursion) ----------
create or replace function public.is_active_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

-- ---------- enable RLS ----------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.stock_in enable row level security;
alter table public.stock_out enable row level security;
alter table public.adjustments enable row level security;
alter table public.ledger enable row level security;
alter table public.settings enable row level security;

-- ---------- profiles ----------
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin" on public.profiles
  for update using (public.is_admin());

-- ---------- categories ----------
drop policy if exists "categories_select_active" on public.categories;
create policy "categories_select_active" on public.categories
  for select using (public.is_active_user());

drop policy if exists "categories_insert_active" on public.categories;
create policy "categories_insert_active" on public.categories
  for insert with check (public.is_active_user());

-- ---------- items ----------
drop policy if exists "items_select_active" on public.items;
create policy "items_select_active" on public.items
  for select using (public.is_active_user());

drop policy if exists "items_insert_admin" on public.items;
create policy "items_insert_admin" on public.items
  for insert with check (public.is_admin());

drop policy if exists "items_update_admin" on public.items;
create policy "items_update_admin" on public.items
  for update using (public.is_admin());

drop policy if exists "items_delete_admin" on public.items;
create policy "items_delete_admin" on public.items
  for delete using (public.is_admin());

-- ---------- stock_in / stock_out / adjustments / ledger ----------
-- อ่านได้สำหรับ active user ทุกคน แต่การ "เขียน" ทำผ่าน RPC (SECURITY DEFINER) ใน
-- functions.sql เท่านั้น จึงไม่มี insert/update/delete policy ให้ตารางเหล่านี้ —
-- RLS ที่ไม่มี policy ตรงกับ action ใดจะปฏิเสธ action นั้นโดยอัตโนมัติ (default-deny)
drop policy if exists "stock_in_select_active" on public.stock_in;
create policy "stock_in_select_active" on public.stock_in
  for select using (public.is_active_user());

drop policy if exists "stock_out_select_active" on public.stock_out;
create policy "stock_out_select_active" on public.stock_out
  for select using (public.is_active_user());

drop policy if exists "adjustments_select_active" on public.adjustments;
create policy "adjustments_select_active" on public.adjustments
  for select using (public.is_active_user());

drop policy if exists "ledger_select_active" on public.ledger;
create policy "ledger_select_active" on public.ledger
  for select using (public.is_active_user());

-- ---------- settings ----------
drop policy if exists "settings_select_active" on public.settings;
create policy "settings_select_active" on public.settings
  for select using (public.is_active_user());

drop policy if exists "settings_update_admin" on public.settings;
create policy "settings_update_admin" on public.settings
  for update using (public.is_admin());

drop policy if exists "settings_insert_admin" on public.settings;
create policy "settings_insert_admin" on public.settings
  for insert with check (public.is_admin());
