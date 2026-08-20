-- ==========================================================
--  Migration: จำกัดสิทธิ์ "ปรับสต๊อค" (Stock Adjustment) ให้เฉพาะผู้ดูแลระบบ
--  (role = admin) เท่านั้น — พนักงานทั่วไปยังรับเข้า/เบิกออกได้ตามปกติ
--  รันครั้งเดียวใน Supabase SQL editor (แทนที่ฟังก์ชันเดิม ไม่กระทบข้อมูล)
--
--  ต้องรัน add_ledger_txn_date.sql ก่อนไฟล์นี้ (ถ้ายังไม่ได้รัน) เพราะฟังก์ชันนี้
--  เขียนคอลัมน์ ledger.txn_date ด้วย — ถ้ายังไม่มีคอลัมน์นี้จะรันไม่ผ่าน
-- ==========================================================

create or replace function public.record_adjustment(
  p_sku text,
  p_txn_date date,
  p_qty_after numeric,
  p_reason text default ''
) returns table (adjustment_id bigint, new_qty numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items%rowtype;
  v_diff numeric;
  v_id bigint;
  v_txn_date date;
begin
  if not public.is_admin() then
    raise exception 'AUTH: เฉพาะผู้ดูแลระบบเท่านั้นที่ปรับสต๊อคได้';
  end if;
  if p_qty_after is null or p_qty_after < 0 then
    raise exception 'กรุณาระบุจำนวนหลังปรับให้ถูกต้อง';
  end if;

  select * into v_item from public.items where sku = p_sku for update;
  if not found then
    raise exception 'ไม่พบวัตถุดิบ SKU: %', p_sku;
  end if;

  v_txn_date := coalesce(p_txn_date, current_date);
  v_diff := p_qty_after - v_item.qty_on_hand;

  insert into public.adjustments (txn_date, item_id, sku, item_name, qty_before, qty_after, reason, recorded_by)
  values (v_txn_date, v_item.id, v_item.sku, v_item.name, v_item.qty_on_hand, p_qty_after, p_reason, auth.uid())
  returning id into v_id;

  update public.items set qty_on_hand = p_qty_after, updated_at = now() where id = v_item.id;

  insert into public.ledger (txn_type, txn_date, sku, item_name, delta, balance_after, ref, recorded_by, note)
  values ('ADJUST', v_txn_date, v_item.sku, v_item.name, v_diff, p_qty_after, 'adjust#' || v_id, auth.uid(), p_reason);

  return query select v_id, p_qty_after;
end;
$$;
