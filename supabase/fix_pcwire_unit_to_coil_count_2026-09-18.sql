-- ==========================================================
--  Fix: เปลี่ยนหน่วยนับ PC wire จาก "กก." (น้ำหนัก) เป็น "ขด" (นับเป็นม้วน)
--  ทั้งฟอร์มรับเข้า/เบิกออกและข้อมูลที่นำเข้าไปแล้ว (75 coil จาก
--  import_pcwire_legacy_coils_2026-09-18.sql) ให้เป็น 1 ขด ต่อ 1 coil
--
--  รันครั้งเดียวใน Supabase SQL Editor หลังรัน import_pcwire_legacy_coils_2026-09-18.sql ไปแล้ว
--  ปลอดภัยกับ SKU อื่นทั้งหมด แก้เฉพาะ PCW4 / PCW41 / PCW5 เท่านั้น
-- ==========================================================

do $$
declare
  v_item public.items%rowtype;
  v_row record;
  v_stock_in_id bigint;
  v_new_qty numeric;
  v_sku text;
  v_fixed_count int;
begin
  -- 1) ลบรายการนำเข้าเดิม (หน่วยกิโล) ของ 3 SKU นี้ทั้งหมด แล้วนำเข้าใหม่เป็น 1 ขด/coil
  delete from public.ledger
  where ref in (
    select 'stock_in#' || id from public.stock_in
    where po_number = 'IMPORT-LEGACY'
      and sku in ('PCW4', 'PCW41', 'PCW5')
  );
  delete from public.stock_in where po_number = 'IMPORT-LEGACY' and sku in ('PCW4', 'PCW41', 'PCW5');

  -- 2) เผื่อมีรายการรับเข้าอื่น (ที่ไม่ใช่ import ชุดนี้) ของ 3 SKU นี้ที่ยังเป็นหน่วยกิโลอยู่
  --    ปรับให้เหลือ 1 ขด/แถว เช่นกัน (ของที่เบิกไปแล้วบางส่วน = ถือว่าใช้ไปแล้วทั้ง coil)
  with fixed as (
    update public.stock_in s set
      qty = 1,
      remaining_qty = case when s.remaining_qty > 0 then 1 else 0 end
    from public.items i
    where s.item_id = i.id
      and i.sku in ('PCW4', 'PCW41', 'PCW5')
      and s.voided_at is null
      and s.qty <> 1
    returning s.id
  )
  select count(*) into v_fixed_count from fixed;
  if v_fixed_count > 0 then
    raise notice 'ปรับรายการรับเข้าอื่น (นอกเหนือจาก IMPORT-LEGACY) ที่ยังเป็นหน่วยกิโลไปแล้ว % แถว — ลองตรวจสอบย้อนหลังอีกครั้ง', v_fixed_count;
  end if;

  -- 3) เปลี่ยนหน่วยนับใน Master Data เป็น "ขด"
  update public.items set unit = 'ขด', updated_at = now() where sku in ('PCW4', 'PCW41', 'PCW5');

  -- 4) นำเข้า Coil เดิม 75 รายการใหม่ เป็น 1 ขด/coil (เก็บน้ำหนักเดิมไว้ในหมายเหตุเพื่ออ้างอิง)
  -- ---------- PCW4 = 4mm หยัก (55 coils) ----------
  v_sku := 'PCW4';
  select * into v_item from public.items where sku = v_sku for update;
  if not found then
    raise exception 'ไม่พบ SKU %', v_sku;
  end if;

  for v_row in select * from (values
    ('c6616cc308', 832),
    ('c6617ac301', 833),
    ('c6728cc302', 643),
    ('c6728cc303', 643),
    ('c6728cc304', 670),
    ('c6728cc305', 683),
    ('c6728cc306', 682),
    ('c6728cc307', 683),
    ('c6728cc308', 683),
    ('c6728cc309', 683),
    ('c6728cc310', 682),
    ('c6801bc316', 687),
    ('c6801bc302', 685),
    ('c6801bc317', 686),
    ('c6801cc301', 686),
    ('c6801cc302', 687),
    ('c6801cc303', 668),
    ('c6801cc304', 687),
    ('c6801cc305', 687),
    ('c6801cc306', 713),
    ('c6801cc307', 687),
    ('c6801cc308', 687),
    ('c6801cc309', 675),
    ('c6730bc302', 886),
    ('c6729ac310', 685),
    ('c6730bc301', 890),
    ('c6730bc303', 683),
    ('c6730bc304', 685),
    ('c6730bc305', 686),
    ('c6730cc301', 686),
    ('C6828ZC314', 822),
    ('C6828ZC313', 822),
    ('C6828ZC312', 841),
    ('C6828ZC311', 821),
    ('C6828ZC309', 845),
    ('C6828ZC310', 821),
    ('C6828ZC306', 802),
    ('C6828ZC307', 821),
    ('C6828ZC304', 792),
    ('C6828ZC308', 821),
    ('C6828ZC305', 791),
    ('C6828ZC302', 684),
    ('C6828ZC301', 684),
    ('C6828YC301', 841),
    ('C6829XC305', 787),
    ('C6829XC306', 721),
    ('C6829XC304', 782),
    ('C6829XC303', 849),
    ('C6829XC302', 822),
    ('C6829XC301', 822),
    ('C6828ZC315', 747),
    ('C6826XC309', 791),
    ('C6826XC310', 841),
    ('C6826XC302', 841),
    ('C6826XC301', 841)
  ) as t(coil_no, orig_weight_kg)
  loop
    v_new_qty := v_item.qty_on_hand + 1;
    insert into public.stock_in (
      txn_date, item_id, sku, item_name, lot_batch, qty, remaining_qty,
      unit_price, supplier, po_number, note
    ) values (
      current_date, v_item.id, v_item.sku, v_item.name, v_row.coil_no, 1, 1,
      v_item.unit_price, v_item.primary_supplier, 'IMPORT-LEGACY',
      'นำเข้าจากสต๊อกเดิม (ก่อนใช้ระบบ) น้ำหนักเดิมประมาณ ' || v_row.orig_weight_kg || ' กก.'
    ) returning id into v_stock_in_id;

    update public.items set qty_on_hand = v_new_qty, updated_at = now() where id = v_item.id;
    v_item.qty_on_hand := v_new_qty;

    insert into public.ledger (txn_type, sku, item_name, delta, balance_after, ref, note)
    values ('IN', v_item.sku, v_item.name, 1, v_new_qty, 'stock_in#' || v_stock_in_id, 'นำเข้าจากสต๊อกเดิม (ก่อนใช้ระบบ)');
  end loop;

  -- ---------- PCW41 = 4mm ย้ำ (16 coils) ----------
  v_sku := 'PCW41';
  select * into v_item from public.items where sku = v_sku for update;
  if not found then
    raise exception 'ไม่พบ SKU %', v_sku;
  end if;

  for v_row in select * from (values
    ('c6728ac605', 1031),
    ('c6728ac606', 1031),
    ('c6728ac609', 1034),
    ('c6728ac607', 1032),
    ('c6728ac612', 1018),
    ('c6728ac611', 1037),
    ('C6821XC602', 1055),
    ('C6821XC603', 1036),
    ('C6821ZC601', 1064),
    ('C6821ZC602', 1027),
    ('C6821ZC604', 1036),
    ('C6819ZC604', 1031),
    ('C6819ZC608', 1028),
    ('C6822ZC612', 1004),
    ('C6822ZC611', 1014),
    ('C6822ZC610', 1020)
  ) as t(coil_no, orig_weight_kg)
  loop
    v_new_qty := v_item.qty_on_hand + 1;
    insert into public.stock_in (
      txn_date, item_id, sku, item_name, lot_batch, qty, remaining_qty,
      unit_price, supplier, po_number, note
    ) values (
      current_date, v_item.id, v_item.sku, v_item.name, v_row.coil_no, 1, 1,
      v_item.unit_price, v_item.primary_supplier, 'IMPORT-LEGACY',
      'นำเข้าจากสต๊อกเดิม (ก่อนใช้ระบบ) น้ำหนักเดิมประมาณ ' || v_row.orig_weight_kg || ' กก.'
    ) returning id into v_stock_in_id;

    update public.items set qty_on_hand = v_new_qty, updated_at = now() where id = v_item.id;
    v_item.qty_on_hand := v_new_qty;

    insert into public.ledger (txn_type, sku, item_name, delta, balance_after, ref, note)
    values ('IN', v_item.sku, v_item.name, 1, v_new_qty, 'stock_in#' || v_stock_in_id, 'นำเข้าจากสต๊อกเดิม (ก่อนใช้ระบบ)');
  end loop;

  -- ---------- PCW5 = 5mm ย้ำ (4 coils) ----------
  v_sku := 'PCW5';
  select * into v_item from public.items where sku = v_sku for update;
  if not found then
    raise exception 'ไม่พบ SKU %', v_sku;
  end if;

  for v_row in select * from (values
    ('C6328CC511', 1219),
    ('SP205062200', 1022),
    ('C6418CC407', 1050),
    ('C6427AC302', 1052)
  ) as t(coil_no, orig_weight_kg)
  loop
    v_new_qty := v_item.qty_on_hand + 1;
    insert into public.stock_in (
      txn_date, item_id, sku, item_name, lot_batch, qty, remaining_qty,
      unit_price, supplier, po_number, note
    ) values (
      current_date, v_item.id, v_item.sku, v_item.name, v_row.coil_no, 1, 1,
      v_item.unit_price, v_item.primary_supplier, 'IMPORT-LEGACY',
      'นำเข้าจากสต๊อกเดิม (ก่อนใช้ระบบ) น้ำหนักเดิมประมาณ ' || v_row.orig_weight_kg || ' กก.'
    ) returning id into v_stock_in_id;

    update public.items set qty_on_hand = v_new_qty, updated_at = now() where id = v_item.id;
    v_item.qty_on_hand := v_new_qty;

    insert into public.ledger (txn_type, sku, item_name, delta, balance_after, ref, note)
    values ('IN', v_item.sku, v_item.name, 1, v_new_qty, 'stock_in#' || v_stock_in_id, 'นำเข้าจากสต๊อกเดิม (ก่อนใช้ระบบ)');
  end loop;

  -- 5) คำนวณยอดคงเหลือใหม่ให้ตรงกับผลรวม remaining_qty จริงของแต่ละ SKU (กันคลาดเคลื่อนสะสม)
  update public.items i set qty_on_hand = (
    select coalesce(sum(s.remaining_qty), 0) from public.stock_in s
    where s.item_id = i.id and s.voided_at is null
  ), updated_at = now()
  where i.sku in ('PCW4', 'PCW41', 'PCW5');

  raise notice 'แก้ไขหน่วยนับ PC wire เป็นขดเสร็จสิ้น';
end $$;
