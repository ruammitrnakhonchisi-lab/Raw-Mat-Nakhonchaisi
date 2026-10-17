-- ==========================================================
--  Migration: สต๊อกปูนซีเมนต์ในไซโล (P1 / P2)
--  แทนไฟล์ Excel "การใช้ปูน 69.xlsx"
--    - cement_silos : ข้อมูลไซโล (ความจุ, จุดเตือนต่ำ/สูง, ยอดยกมาตั้งต้น)
--    - cement_daily : รายวันต่อไซโล = รับเข้า / ใช้ไป / นับจริง (กก.)
--  ยอดคงเหลือ "คำนวณ" ในหน้าเว็บ: ยอดตั้งต้น + รับ - ใช้ และ re-baseline ทุกครั้งที่มีการนับจริง
--  รันครั้งเดียวใน Supabase SQL editor (หลัง schema.sql + policies.sql)
--  แล้วรัน import_cement_2026.sql เพื่อนำเข้าข้อมูลจาก Excel
-- ==========================================================

create table if not exists public.cement_silos (
  code text primary key,
  name text not null default '',
  capacity_kg numeric not null default 200000 check (capacity_kg > 0),
  low_kg numeric not null default 50000,
  high_kg numeric not null default 180000,
  opening_date date not null default current_date,
  opening_kg numeric not null default 0
);

create table if not exists public.cement_daily (
  txn_date date not null,
  silo_code text not null references public.cement_silos (code),
  received_kg numeric not null default 0 check (received_kg >= 0),
  used_kg numeric not null default 0 check (used_kg >= 0),
  counted_kg numeric check (counted_kg is null or counted_kg >= 0),
  note text not null default '',
  recorded_by uuid references public.profiles (id),
  updated_at timestamptz not null default now(),
  primary key (txn_date, silo_code)
);

create index if not exists idx_cement_daily_date on public.cement_daily (txn_date desc);

-- ตั้งต้นจาก Excel: ยอดยกมา 1 ม.ค. 2569 (ค.ศ. 2026) P1 = 140,000 / P2 = 125,000 กก.
-- ความจุ/จุดเตือนเป็นค่าประมาณ — แก้ได้ในหน้า "สต๊อกปูนซีเมนต์" > ตั้งค่าไซโล (admin)
insert into public.cement_silos (code, name, capacity_kg, low_kg, high_kg, opening_date, opening_kg) values
  ('P1', 'ไซโล P1', 200000, 50000, 180000, '2026-01-01', 140000),
  ('P2', 'ไซโล P2', 200000, 50000, 180000, '2026-01-01', 125000)
on conflict (code) do nothing;

alter table public.cement_silos enable row level security;
alter table public.cement_daily enable row level security;

drop policy if exists "cement_silos_select_active" on public.cement_silos;
create policy "cement_silos_select_active" on public.cement_silos
  for select using (public.is_active_user());

drop policy if exists "cement_daily_select_active" on public.cement_daily;
create policy "cement_daily_select_active" on public.cement_daily
  for select using (public.is_active_user());

drop policy if exists "cement_silos_update_admin" on public.cement_silos;
create policy "cement_silos_update_admin" on public.cement_silos
  for update using (public.is_admin());

-- บันทึก/แก้ไขรายวัน (ผู้ใช้ที่ active ทุกคน) — upsert ตามวัน+ไซโล
create or replace function public.save_cement_day(
  p_txn_date date,
  p_silo_code text,
  p_received_kg numeric default 0,
  p_used_kg numeric default 0,
  p_counted_kg numeric default null,
  p_note text default ''
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_user() then
    raise exception 'AUTH: ไม่มีสิทธิ์บันทึก';
  end if;
  if p_txn_date is null or p_txn_date > current_date then
    raise exception 'วันที่ไม่ถูกต้อง (ห้ามเป็นวันในอนาคต)';
  end if;
  if not exists (select 1 from public.cement_silos where code = p_silo_code) then
    raise exception 'ไม่พบไซโล %', p_silo_code;
  end if;
  insert into public.cement_daily (txn_date, silo_code, received_kg, used_kg, counted_kg, note, recorded_by, updated_at)
  values (p_txn_date, p_silo_code, coalesce(p_received_kg, 0), coalesce(p_used_kg, 0), p_counted_kg,
          coalesce(p_note, ''), auth.uid(), now())
  on conflict (txn_date, silo_code) do update set
    received_kg = excluded.received_kg,
    used_kg = excluded.used_kg,
    counted_kg = excluded.counted_kg,
    note = excluded.note,
    recorded_by = excluded.recorded_by,
    updated_at = now();
end;
$$;

grant execute on function public.save_cement_day(date, text, numeric, numeric, numeric, text) to authenticated;
