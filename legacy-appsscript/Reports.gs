/**
 * ==========================================================
 *  รายงาน (Reports) — มูลค่าสต๊อค / การเคลื่อนไหว / ABC Analysis
 * ==========================================================
 */

function reportStockValue(token) {
  requireSession_(token);
  var items = sheetToObjects_(SHEET_ITEMS);
  var rows = items.map(function (it) {
    var qty = Number(it['จำนวนคงเหลือ']);
    var price = Number(it['ราคาต่อหน่วย']);
    return {
      SKU: it.SKU,
      ชื่อวัตถุดิบ: it['ชื่อวัตถุดิบ'],
      หมวดหมู่: it['หมวดหมู่'],
      หน่วยนับ: it['หน่วยนับ'],
      จำนวนคงเหลือ: qty,
      ราคาต่อหน่วย: price,
      มูลค่ารวม: qty * price
    };
  });
  rows.sort(function (a, b) { return b['มูลค่ารวม'] - a['มูลค่ารวม']; });
  return rows;
}

function reportMovement(token, dateFrom, dateTo) {
  requireSession_(token);
  var ledger = sheetToObjects_(SHEET_LEDGER);
  var rows = ledger.filter(function (r) {
    var d = String(r['วันที่เวลา']).slice(0, 10);
    return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
  });

  var bySku = {};
  rows.forEach(function (r) {
    var key = r.SKU;
    if (!bySku[key]) {
      bySku[key] = { SKU: key, ชื่อวัตถุดิบ: r['ชื่อวัตถุดิบ'], รับเข้ารวม: 0, เบิกออกรวม: 0, ปรับสต๊อครวม: 0, จำนวนรายการ: 0 };
    }
    var qty = Number(r['จำนวนเปลี่ยนแปลง']);
    if (r['ประเภท'] === 'IN') bySku[key]['รับเข้ารวม'] += qty;
    if (r['ประเภท'] === 'OUT') bySku[key]['เบิกออกรวม'] += Math.abs(qty);
    if (r['ประเภท'] === 'ADJUST') bySku[key]['ปรับสต๊อครวม'] += qty;
    bySku[key]['จำนวนรายการ'] += 1;
  });

  return Object.keys(bySku).map(function (k) { return bySku[k]; });
}

/**
 * ABC Analysis: จัดกลุ่มวัตถุดิบตามมูลค่าการเบิกใช้สะสม (80/15/5)
 */
function reportABC(token, dateFrom, dateTo) {
  requireSession_(token);
  var items = sheetToObjects_(SHEET_ITEMS);
  var priceBySku = {};
  items.forEach(function (it) { priceBySku[it.SKU] = Number(it['ราคาต่อหน่วย']); });

  var outs = sheetToObjects_(SHEET_STOCK_OUT).filter(function (r) {
    var d = String(r['วันที่']).slice(0, 10);
    return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
  });

  var usageValue = {};
  outs.forEach(function (r) {
    var value = Number(r['จำนวนเบิก']) * (priceBySku[r.SKU] || 0);
    usageValue[r.SKU] = (usageValue[r.SKU] || 0) + value;
    usageValue[r.SKU + '_name'] = r['ชื่อวัตถุดิบ'];
  });

  var list = Object.keys(usageValue)
    .filter(function (k) { return k.indexOf('_name') === -1; })
    .map(function (sku) {
      return { SKU: sku, ชื่อวัตถุดิบ: usageValue[sku + '_name'], มูลค่าการเบิกใช้: usageValue[sku] };
    });
  list.sort(function (a, b) { return b['มูลค่าการเบิกใช้'] - a['มูลค่าการเบิกใช้']; });

  var total = list.reduce(function (s, r) { return s + r['มูลค่าการเบิกใช้']; }, 0);
  var cum = 0;
  list.forEach(function (r) {
    cum += r['มูลค่าการเบิกใช้'];
    var pct = total > 0 ? (cum / total) * 100 : 0;
    r['สัดส่วนสะสม(%)'] = Math.round(pct * 100) / 100;
    r['กลุ่ม'] = pct <= 80 ? 'A' : (pct <= 95 ? 'B' : 'C');
  });
  return list;
}

/**
 * Export any report (array of objects) as CSV text for client-side download.
 */
function exportCsv(token, rows) {
  requireSession_(token);
  if (!rows || !rows.length) return '';
  var headers = Object.keys(rows[0]);
  var lines = [headers.join(',')];
  rows.forEach(function (row) {
    lines.push(headers.map(function (h) {
      var v = row[h] === undefined || row[h] === null ? '' : String(row[h]);
      if (v.indexOf(',') > -1 || v.indexOf('"') > -1 || v.indexOf('\n') > -1) {
        v = '"' + v.replace(/"/g, '""') + '"';
      }
      return v;
    }).join(','));
  });
  return '﻿' + lines.join('\n'); // BOM for Excel Thai-language support
}
