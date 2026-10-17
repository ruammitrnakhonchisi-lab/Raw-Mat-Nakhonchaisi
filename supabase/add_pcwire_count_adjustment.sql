-- ==========================================================
--  Migration: ปรับสต๊อก PC wire แบบรายเลข Coil (เทียบกับรายการที่นับได้จริง)
--
--  ใช้ในหน้า "สต๊อก PC wire" > โหมดนับสต๊อก (เฉพาะผู้ดูแลระบบ)
--    - p_missing_ids : stock_in.id ของ Coil ที่ "ขาด" (มีในระบบแต่นับไม่เจอ) -> ตัดยอดเหลือ 0
--    - p_extra_coils : เลข Coil ที่ "เกิน" (นับเจอแต่ไม่มีในระบบ) -> เพิ่มเป็น Coil ใหม่ 1 ขด
--  ยอดคงเหลือรวมของ SKU จะถูกคำนวณใหม่จากผลรวม remaining_qty ของ Coil ทั้งหมด
--  และบันทึกเป็นรายการปรับสต๊อก 1 รายการ (adjustments + ledger) พร้อมรายชื่อ Coil ที่ขาด/เกิน
--
--  เป็นฟังก์ชันใหม่ชื่อใหม่ ไม่ทับ/ไม่ซ้อนกับฟังก์ชันเดิม (ไม่เกิดปัญหา overload)
--  รันครั้งเดียวใน Supabase SQL editor (ต้องรันหลัง add_pcwire_coil_tracking.sql)
-- ==========================================================

create or replace function public.record_pcwire_count_adjustment(
  p_sku text,
  p_txn_date date,
  p_missing_ids bigint[] default '{}',
  p_extra_coils text[] default '{}',
  p_reason text default ''
) returns table (adjustment_id bigint, new_qty numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item public.items%rowtype;
  v_txn_date date;
  v_missing_count int := 0;
  v_missing_qty numeric := 0;
  v_missing_nos text[] := '{}';
  v_extra text[] := '{}';
  v_extra_count int := 0;
  v_dup text;
  v_total numeric;
  v_before numeric;
  v_after numeric;
  v_adj_id bigint;
  v_reason text;
  v_coil text;
begin
  if not public.is_admin() then
    raise exception 'AUTH: เฉพาะผู้ดูแลระบบเท่านั้นที่ปรับสต๊อคได้';
  end if;

  select * into v_item from public.items where sku = p_sku for update;
  if not found then
    raise exception 'ไม่พบวัตถุดิบ SKU: %', p_sku;
  end if;
  if lower(regexp_replace(coalesce(v_item.category, ''), '\s', '', 'g')) <> 'pcwire' then
    raise exception 'ปรับแบบรายเลข Coil ได้เฉพาะวัตถุดิบหมวด PC wire';
  end if;

  v_txn_date := coalesce(p_txn_date, current_date);

  -- Coil ที่ขาด: ต้องยังอยู่ในสต๊อกจริงตอนกดยืนยัน (กันกรณีมีคนเบิกไปแล้วระหว่างนับ)
  if coalesce(array_length(p_missing_ids, 1), 0) > 0 then
    perform 1 from public.stock_in where id = any (p_missing_ids) for update;

    select count(*), coalesce(sum(remaining_qty), 0), coalesce(array_agg(lot_batch order by id), '{}')
      into v_missing_count, v_missing_qty, v_missing_nos
    from public.stock_in
    where id = any (p_missing_ids)
      and item_id = v_item.id
      and voided_at is null
      and remaining_qty > 0;

    if v_missing_count <> (select count(distinct x) from unnest(p_missing_ids) as x) then
      raise exception 'มี Coil ที่ถูกเบิก/ยกเลิกไปแล้วระหว่างนับสต๊อก กรุณาโหลดหน้าใหม่แล้วเปรียบเทียบอีกครั้ง';
    end if;
  end if;

  -- Coil ที่เกิน: ตัดค่าว่าง/ตัวซ้ำ (ไม่สนตัวพิมพ์เล็กใหญ่)
  select coalesce(array_agg(c order by o), '{}')
    into v_extra
  from (
    select (array_agg(trim(x) order by ord))[1] as c, min(ord) as o
    from unnest(p_extra_coils) with ordinality as t(x, ord)
    where trim(x) <> ''
    group by lower(trim(x))
  ) s;
  v_extra_count := coalesce(array_length(v_extra, 1), 0);

  if v_missing_count = 0 and v_extra_count = 0 then
    raise exception 'ไม่มีรายการ Coil ให้ปรับ';
  end if;

  -- Coil ที่เกินต้องไม่ซ้ำกับ Coil ที่ยังอยู่ในสต๊อก (นอกเหนือจากที่กำลังจะตัดออก)
  select string_agg(s.lot_batch, ', ') into v_dup
  from unnest(v_extra) as c
  join public.stock_in s on lower(s.lot_batch) = lower(c)
  where s.item_id = v_item.id
    and s.voided_at is null
    and s.remaining_qty > 0
    and not (s.id = any (p_missing_ids));
  if v_dup is not null then
    raise exception 'Coil ต่อไปนี้มีอยู่ในสต๊อกแล้ว: %', v_dup;
  end if;

  v_before := v_item.qty_on_hand;
  select coalesce(sum(remaining_qty), 0) into v_total
  from public.stock_in
  where item_id = v_item.id and voided_at is null;
  v_after := v_total - v_missing_qty + v_extra_count;
  if v_after < 0 then
    raise exception 'ยอดหลังปรับติดลบ กรุณาตรวจสอบข้อมูล';
  end if;

  v_reason := trim(
    '[นับสต๊อก Coil] ' || coalesce(nullif(trim(p_reason), ''), '') ||
    case when v_missing_count > 0 then ' | ขาด ' || v_missing_count || ': ' || array_to_string(v_missing_nos, ', ') else '' end ||
    case when v_extra_count > 0 then ' | เกิน ' || v_extra_count || ': ' || array_to_string(v_extra, ', ') else '' end
  );

  insert into public.adjustments (txn_date, item_id, sku, item_name, qty_before, qty_after, reason, recorded_by)
  values (v_txn_date, v_item.id, v_item.sku, v_item.name, v_before, v_after, v_reason, auth.uid())
  returning id into v_adj_id;

  if v_missing_count > 0 then
    update public.stock_in set remaining_qty = 0 where id = any (p_missing_ids) and item_id = v_item.id;
  end if;

  foreach v_coil in array v_extra loop
    insert into public.stock_in (
      txn_date, item_id, sku, item_name, lot_batch, qty, remaining_qty,
      unit_price, supplier, po_number, recorded_by, note
    ) values (
      v_txn_date, v_item.id, v_item.sku, v_item.name, v_coil, 1, 1,
      v_item.unit_price, v_item.primary_supplier, 'ADJUST', auth.uid(),
      'เพิ่มจากการนับสต๊อก (adjust#' || v_adj_id || ')'
    );
  end loop;

  update public.items set qty_on_hand = v_after, updated_at = now() where id = v_item.id;

  insert into public.ledger (txn_type, txn_date, sku, item_name, delta, balance_after, ref, recorded_by, note)
  values ('ADJUST', v_txn_date, v_item.sku, v_item.name, v_after - v_before, v_after, 'adjust#' || v_adj_id, auth.uid(), v_reason);

  return query select v_adj_id, v_after;
end;
$$;

grant execute on all functions in schema public to authenticated;
