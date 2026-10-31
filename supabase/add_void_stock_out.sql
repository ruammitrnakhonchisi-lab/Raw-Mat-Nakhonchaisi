-- ==========================================================
--  Migration: ยกเลิกรายการเบิกออก (admin only) จากหน้า "ประวัติการเคลื่อนไหว"
--    - stock_out.voided_at / voided_by : ทำเครื่องหมายว่าถูกยกเลิก (ไม่ลบข้อมูล)
--    - ledger.txn_type เพิ่มค่า 'VOID_OUT' (คืนของเข้าสต๊อก)
--    - void_stock_out() : คืนยอดวัตถุดิบ + คืนยอด coil/ล็อต (ถ้ามี) + เขียน ledger
--    - edit_ledger_entry() : อัปเดตให้ไม่ยอมแก้รายการเบิกที่ถูกยกเลิกแล้ว
--      (แทนที่ฟังก์ชันจาก add_edit_ledger_entry.sql — รันไฟล์นี้หลังไฟล์นั้น)
--  รันครั้งเดียวใน Supabase SQL editor
-- ==========================================================

alter table public.stock_out add column if not exists voided_at timestamptz;
alter table public.stock_out add column if not exists voided_by uuid references public.profiles (id);

alter table public.ledger drop constraint if exists ledger_txn_type_check;
alter table public.ledger add constraint ledger_txn_type_check
  check (txn_type in ('IN', 'OUT', 'ADJUST', 'VOID_IN', 'VOID_OUT'));

-- ---------- ยกเลิกรายการเบิกออก (admin only) — atomic ----------
create or replace function public.void_stock_out(
  p_ledger_id bigint,
  p_reason text default ''
) returns table (new_qty numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_led public.ledger%rowtype;
  v_out public.stock_out%rowtype;
  v_item public.items%rowtype;
  v_coil public.stock_in%rowtype;
  v_ref_id bigint;
  v_new_qty numeric;
begin
  if not public.is_admin() then
    raise exception 'AUTH: เฉพาะผู้ดูแลระบบเท่านั้นที่ยกเลิกรายการได้';
  end if;

  select * into v_led from public.ledger where id = p_ledger_id for update;
  if not found or v_led.txn_type <> 'OUT' then
    raise exception 'ยกเลิกได้เฉพาะรายการเบิกออก';
  end if;

  v_ref_id := substring(v_led.ref from 'stock_out#(\d+)')::bigint;
  select * into v_out from public.stock_out where id = v_ref_id for update;
  if not found then
    raise exception 'ไม่พบรายการเบิกออกต้นทาง';
  end if;
  if v_out.voided_at is not null then
    raise exception 'รายการนี้ถูกยกเลิกไปแล้ว';
  end if;

  select * into v_item from public.items where id = v_out.item_id for update;
  if not found then
    raise exception 'ไม่พบวัตถุดิบที่เกี่ยวข้อง';
  end if;

  if v_out.coil_stock_in_id is not null then
    select * into v_coil from public.stock_in where id = v_out.coil_stock_in_id for update;
    if found then
      if v_coil.voided_at is not null then
        raise exception 'ยกเลิกไม่ได้: coil/ล็อตที่เบิกถูกยกเลิกการรับเข้าไปแล้ว';
      end if;
      if v_coil.remaining_qty + v_out.qty > v_coil.qty then
        raise exception 'ยกเลิกไม่ได้: จะทำให้คงเหลือของ coil/ล็อตเกินจำนวนที่รับเข้า';
      end if;
      update public.stock_in set remaining_qty = remaining_qty + v_out.qty where id = v_coil.id;
    end if;
  end if;

  v_new_qty := v_item.qty_on_hand + v_out.qty;
  update public.items set qty_on_hand = v_new_qty, updated_at = now() where id = v_item.id;
  update public.stock_out set voided_at = now(), voided_by = auth.uid() where id = v_out.id;

  insert into public.ledger (txn_type, txn_date, sku, item_name, delta, balance_after, ref, recorded_by, note)
  values ('VOID_OUT', current_date, v_out.sku, v_out.item_name, v_out.qty, v_new_qty, v_led.ref, auth.uid(),
          trim('ยกเลิกรายการเบิก ' || coalesce(nullif(trim(p_reason), ''), '')));

  return query select v_new_qty;
end;
$$;

grant execute on function public.void_stock_out(bigint, text) to authenticated;

-- ---------- แก้ไขรายการ (อัปเดตให้กันรายการเบิกที่ถูกยกเลิกแล้ว) ----------
create or replace function public.edit_ledger_entry(
  p_ledger_id bigint,
  p_qty numeric,
  p_txn_date date,
  p_note text default ''
) returns table (new_qty numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_led public.ledger%rowtype;
  v_item public.items%rowtype;
  v_in public.stock_in%rowtype;
  v_out public.stock_out%rowtype;
  v_coil public.stock_in%rowtype;
  v_ref_id bigint;
  v_old_qty numeric;
  v_diff numeric;
  v_new_item_qty numeric;
  v_txn_date date;
begin
  if not public.is_admin() then
    raise exception 'AUTH: เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขรายการได้';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'กรุณาระบุจำนวนให้ถูกต้อง (มากกว่า 0)';
  end if;

  select * into v_led from public.ledger where id = p_ledger_id for update;
  if not found then
    raise exception 'ไม่พบรายการในประวัติ';
  end if;
  if v_led.txn_type not in ('IN', 'OUT') then
    raise exception 'แก้ไขได้เฉพาะรายการรับเข้า/เบิกออก (รายการปรับสต๊อคให้ปรับใหม่ในหน้า "ปรับสต๊อค")';
  end if;

  select * into v_item from public.items where sku = v_led.sku for update;
  if not found then
    raise exception 'ไม่พบวัตถุดิบ SKU: %', v_led.sku;
  end if;

  v_txn_date := coalesce(p_txn_date, v_led.txn_date);

  if v_led.txn_type = 'IN' then
    v_ref_id := substring(v_led.ref from 'stock_in#(\d+)')::bigint;
    select * into v_in from public.stock_in where id = v_ref_id for update;
    if not found then
      raise exception 'ไม่พบรายการรับเข้าต้นทาง';
    end if;
    if v_in.voided_at is not null then
      raise exception 'รายการนี้ถูกยกเลิกไปแล้ว แก้ไขไม่ได้';
    end if;

    v_old_qty := v_in.qty;
    v_diff := p_qty - v_old_qty;
    if v_in.remaining_qty + v_diff < 0 then
      raise exception 'แก้ไม่ได้: มีการเบิกใช้จากล็อตนี้ไปแล้ว % (แก้ได้ไม่น้อยกว่านี้)', v_in.qty - v_in.remaining_qty;
    end if;

    update public.stock_in
       set qty = p_qty,
           remaining_qty = remaining_qty + v_diff,
           txn_date = v_txn_date,
           note = coalesce(p_note, '')
     where id = v_in.id;
  else
    v_ref_id := substring(v_led.ref from 'stock_out#(\d+)')::bigint;
    select * into v_out from public.stock_out where id = v_ref_id for update;
    if not found then
      raise exception 'ไม่พบรายการเบิกออกต้นทาง';
    end if;
    if v_out.voided_at is not null then
      raise exception 'รายการนี้ถูกยกเลิกไปแล้ว แก้ไขไม่ได้';
    end if;

    v_old_qty := v_out.qty;
    v_diff := v_old_qty - p_qty;

    if v_out.coil_stock_in_id is not null then
      select * into v_coil from public.stock_in where id = v_out.coil_stock_in_id for update;
      if found then
        if v_coil.remaining_qty + v_diff < 0 then
          raise exception 'แก้ไม่ได้: coil/ล็อตนี้คงเหลือไม่พอ (คงเหลือ %)', v_coil.remaining_qty;
        end if;
        if v_coil.remaining_qty + v_diff > v_coil.qty then
          raise exception 'แก้ไม่ได้: จะทำให้คงเหลือของ coil/ล็อตเกินจำนวนที่รับเข้า';
        end if;
        update public.stock_in set remaining_qty = remaining_qty + v_diff where id = v_coil.id;
      end if;
    end if;

    update public.stock_out
       set qty = p_qty,
           txn_date = v_txn_date,
           note = coalesce(p_note, '')
     where id = v_out.id;
  end if;

  v_new_item_qty := v_item.qty_on_hand + v_diff;
  if v_new_item_qty < 0 then
    raise exception 'แก้ไม่ได้: จะทำให้ยอดคงเหลือติดลบ (คงเหลือปัจจุบัน %)', v_item.qty_on_hand;
  end if;

  update public.items set qty_on_hand = v_new_item_qty, updated_at = now() where id = v_item.id;

  update public.ledger
     set delta = case when v_led.txn_type = 'IN' then p_qty else -p_qty end,
         txn_date = v_txn_date,
         note = coalesce(p_note, '')
   where id = v_led.id;

  update public.ledger
     set balance_after = balance_after + v_diff
   where sku = v_led.sku and id >= v_led.id;

  return query select v_new_item_qty;
end;
$$;

grant execute on function public.edit_ledger_entry(bigint, numeric, date, text) to authenticated;
