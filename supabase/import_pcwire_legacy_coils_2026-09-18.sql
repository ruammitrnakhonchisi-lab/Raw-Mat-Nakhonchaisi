-- ==========================================================
--  นำเข้า Coil คงเหลือ (ยังไม่ถูกเบิกใช้) จากไฟล์ Excel เดิมของแผนกผลิต
--  \\win-2020\Production\งานหมู\PC WIER 4mm,5mm\PCwire 4 mm.xlsx / 5 mm.xlsx
--  รันครั้งเดียวใน Supabase SQL Editor -- ต้องรัน add_pcwire_coil_tracking.sql ก่อนแล้ว
--  (ต้องมีคอลัมน์ remaining_qty ในตาราง stock_in)
--
--  เพิ่มเป็นรายการรับเข้า (stock_in) แบบเดียวกับที่ RPC record_stock_in ทำ
--  (อัปเดต items.qty_on_hand + ลง ledger ให้ครบ) แต่ข้ามการเช็ค login เพราะรันตรงใน
--  SQL editor ด้วยสิทธิ์ผู้ดูแลฐานข้อมูลอยู่แล้ว ไม่ใช่ผ่านแอป
-- ==========================================================

do $$
declare
  v_item public.items%rowtype;
  v_row record;
  v_stock_in_id bigint;
  v_new_qty numeric;
  v_sku text;
begin
  -- ---------- PCW4 = 4mm หยัก (55 coils) ----------
  v_sku := 'PCW4';
  select * into v_item from public.items where sku = v_sku for update;
  if not found then
    raise exception 'ไม่พบ SKU % ในตาราง items — ตรวจสอบว่า SKU ตรงกับที่ตั้งไว้จริง', v_sku;
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
  ) as t(coil_no, qty)
  loop
    v_new_qty := v_item.qty_on_hand + v_row.qty;
    insert into public.stock_in (
      txn_date, item_id, sku, item_name, lot_batch, qty, remaining_qty,
      unit_price, supplier, po_number, note
    ) values (
      current_date, v_item.id, v_item.sku, v_item.name, v_row.coil_no, v_row.qty, v_row.qty,
      v_item.unit_price, v_item.primary_supplier, 'IMPORT-LEGACY',
      'นำเข้าจากสต๊อกเดิม (ก่อนใช้ระบบ) จากไฟล์ Excel ของแผนกผลิต'
    ) returning id into v_stock_in_id;

    update public.items set qty_on_hand = v_new_qty, updated_at = now() where id = v_item.id;
    v_item.qty_on_hand := v_new_qty;

    insert into public.ledger (txn_type, sku, item_name, delta, balance_after, ref, note)
    values ('IN', v_item.sku, v_item.name, v_row.qty, v_new_qty, 'stock_in#' || v_stock_in_id, 'นำเข้าจากสต๊อกเดิม (ก่อนใช้ระบบ)');
  end loop;

  -- ---------- PCW41 = 4mm ย้ำ (16 coils) ----------
  v_sku := 'PCW41';
  select * into v_item from public.items where sku = v_sku for update;
  if not found then
    raise exception 'ไม่พบ SKU % ในตาราง items — ตรวจสอบว่า SKU ตรงกับที่ตั้งไว้จริง', v_sku;
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
  ) as t(coil_no, qty)
  loop
    v_new_qty := v_item.qty_on_hand + v_row.qty;
    insert into public.stock_in (
      txn_date, item_id, sku, item_name, lot_batch, qty, remaining_qty,
      unit_price, supplier, po_number, note
    ) values (
      current_date, v_item.id, v_item.sku, v_item.name, v_row.coil_no, v_row.qty, v_row.qty,
      v_item.unit_price, v_item.primary_supplier, 'IMPORT-LEGACY',
      'นำเข้าจากสต๊อกเดิม (ก่อนใช้ระบบ) จากไฟล์ Excel ของแผนกผลิต'
    ) returning id into v_stock_in_id;

    update public.items set qty_on_hand = v_new_qty, updated_at = now() where id = v_item.id;
    v_item.qty_on_hand := v_new_qty;

    insert into public.ledger (txn_type, sku, item_name, delta, balance_after, ref, note)
    values ('IN', v_item.sku, v_item.name, v_row.qty, v_new_qty, 'stock_in#' || v_stock_in_id, 'นำเข้าจากสต๊อกเดิม (ก่อนใช้ระบบ)');
  end loop;

  -- ---------- PCW5 = 5mm ย้ำ (4 coils) ----------
  v_sku := 'PCW5';
  select * into v_item from public.items where sku = v_sku for update;
  if not found then
    raise exception 'ไม่พบ SKU % ในตาราง items — ตรวจสอบว่า SKU ตรงกับที่ตั้งไว้จริง', v_sku;
  end if;

  for v_row in select * from (values
    ('C6328CC511', 1219),
    ('SP205062200', 1022),
    ('C6418CC407', 1050),
    ('C6427AC302', 1052)
  ) as t(coil_no, qty)
  loop
    v_new_qty := v_item.qty_on_hand + v_row.qty;
    insert into public.stock_in (
      txn_date, item_id, sku, item_name, lot_batch, qty, remaining_qty,
      unit_price, supplier, po_number, note
    ) values (
      current_date, v_item.id, v_item.sku, v_item.name, v_row.coil_no, v_row.qty, v_row.qty,
      v_item.unit_price, v_item.primary_supplier, 'IMPORT-LEGACY',
      'นำเข้าจากสต๊อกเดิม (ก่อนใช้ระบบ) จากไฟล์ Excel ของแผนกผลิต'
    ) returning id into v_stock_in_id;

    update public.items set qty_on_hand = v_new_qty, updated_at = now() where id = v_item.id;
    v_item.qty_on_hand := v_new_qty;

    insert into public.ledger (txn_type, sku, item_name, delta, balance_after, ref, note)
    values ('IN', v_item.sku, v_item.name, v_row.qty, v_new_qty, 'stock_in#' || v_stock_in_id, 'นำเข้าจากสต๊อกเดิม (ก่อนใช้ระบบ)');
  end loop;

  raise notice 'Import เสร็จสิ้น';
end $$;
