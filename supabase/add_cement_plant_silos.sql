-- ==========================================================
--  Migration: แยกไซโลปูนเป็น แพลนต์ละ 2 ใบ (ใบละ 75 ตัน)
--    P1 -> P1-S1 (Silo.1), P1-S2 (Silo.2)
--    P2 -> P2-S1 (Silo.1), P2-S2 (Silo.2)
--  ข้อมูลเดิมจาก Excel (บันทึกรวมทั้งแพลนต์ รหัส P1/P2) ยังอยู่ครบ แต่ถูกตั้งเป็น inactive
--  (แสดงในตารางรายเดือน/กราฟย้อนหลัง ไม่แสดงเป็นไซโลที่ใช้งาน เพราะแยกไม่ได้ว่าไซโลไหนเท่าไร)
--  ไซโลใหม่เริ่มนับที่ opening_date = วันที่รัน และ opening_kg = 0
--  => หลังรัน ให้แอดมินเข้า "สต๊อกปูนซีเมนต์ > ตั้งค่าไซโล" ใส่ยอดตั้งต้นจากการวัด/นับจริงของแต่ละใบ
--  รันหลัง add_cement_silos.sql (รันซ้ำได้)
-- ==========================================================

alter table public.cement_silos add column if not exists plant text;
alter table public.cement_silos add column if not exists seq int not null default 1;
alter table public.cement_silos add column if not exists active boolean not null default true;

-- ไซโลเดิม (รวมทั้งแพลนต์) -> legacy
update public.cement_silos
   set plant = code, active = false, seq = 0,
       name = code || ' (รวม 2 ไซโล — ข้อมูลก่อนแยกไซโล)'
 where code in ('P1', 'P2');

insert into public.cement_silos (code, plant, seq, name, capacity_kg, low_kg, high_kg, opening_date, opening_kg, active) values
  ('P1-S1', 'P1', 1, 'P1 Silo.1', 75000, 15000, 67500, current_date, 0, true),
  ('P1-S2', 'P1', 2, 'P1 Silo.2', 75000, 15000, 67500, current_date, 0, true),
  ('P2-S1', 'P2', 1, 'P2 Silo.1', 75000, 15000, 67500, current_date, 0, true),
  ('P2-S2', 'P2', 2, 'P2 Silo.2', 75000, 15000, 67500, current_date, 0, true)
on conflict (code) do nothing;

-- บันทึกรายวันได้เฉพาะไซโลที่ใช้งานอยู่ (ข้อมูล legacy แก้ไม่ได้อีก)
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
  if not exists (select 1 from public.cement_silos where code = p_silo_code and active) then
    raise exception 'ไม่พบไซโลที่ใช้งาน %', p_silo_code;
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
