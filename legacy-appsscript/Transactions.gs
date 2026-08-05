/**
 * ==========================================================
 *  รับเข้า / เบิกออก / ปรับสต๊อค / บันทึกการเคลื่อนไหว (Ledger)
 * ==========================================================
 */

function findItemBySku_(sku) {
  var sh = sheet_(SHEET_ITEMS);
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var skuCol = headers.indexOf('SKU');
  for (var i = 1; i < data.length; i++) {
    if (data[i][skuCol] === sku) {
      var obj = {};
      headers.forEach(function (h, c) { obj[h] = data[i][c]; });
      obj._row = i + 1;
      return obj;
    }
  }
  return null;
}

function setItemQty_(row, newQty) {
  var sh = sheet_(SHEET_ITEMS);
  var headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  var qtyCol = headers.indexOf('จำนวนคงเหลือ');
  var updatedCol = headers.indexOf('อัปเดตล่าสุด');
  sh.getRange(row, qtyCol + 1).setValue(newQty);
  sh.getRange(row, updatedCol + 1).setValue(nowStr_());
}

function appendLedger_(type, sku, name, delta, balanceAfter, ref, user, note) {
  var sh = sheet_(SHEET_LEDGER);
  var id = nextId_(SHEET_LEDGER);
  sh.appendRow([id, nowStr_(), type, sku, name, delta, balanceAfter, ref, user, note || '']);
}

/**
 * ---------- รับเข้า (Stock In) ----------
 */
function addStockIn(token, data) {
  var session = requireSession_(token);
  var item = findItemBySku_(data.SKU);
  if (!item) return { ok: false, message: 'ไม่พบวัตถุดิบ SKU: ' + data.SKU };

  var qty = Number(data['จำนวนรับเข้า']);
  if (!qty || qty <= 0) return { ok: false, message: 'กรุณาระบุจำนวนรับเข้าให้ถูกต้อง' };

  var price = Number(data['ราคาต่อหน่วย']) || Number(item['ราคาต่อหน่วย']) || 0;
  var total = qty * price;

  var sh = sheet_(SHEET_STOCK_IN);
  var id = nextId_(SHEET_STOCK_IN);
  sh.appendRow([
    id, data['วันที่'] || todayStr_(), data.SKU, item['ชื่อวัตถุดิบ'],
    data['Lot/Batch'] || '', data['วันหมดอายุ'] || '',
    qty, price, total, data['ผู้จำหน่าย'] || item['ผู้จำหน่ายหลัก'] || '',
    data['เลขที่เอกสาร/PO'] || '', session.name, data['หมายเหตุ'] || ''
  ]);

  var newQty = Number(item['จำนวนคงเหลือ']) + qty;
  setItemQty_(item._row, newQty);
  appendLedger_('IN', data.SKU, item['ชื่อวัตถุดิบ'], qty, newQty, 'StockIn#' + id, session.name, data['หมายเหตุ']);

  return { ok: true, id: id, newQty: newQty };
}

/**
 * ---------- เบิกออก (Stock Out) ----------
 */
function addStockOut(token, data) {
  var session = requireSession_(token);
  var item = findItemBySku_(data.SKU);
  if (!item) return { ok: false, message: 'ไม่พบวัตถุดิบ SKU: ' + data.SKU };

  var qty = Number(data['จำนวนเบิก']);
  if (!qty || qty <= 0) return { ok: false, message: 'กรุณาระบุจำนวนเบิกให้ถูกต้อง' };

  var currentQty = Number(item['จำนวนคงเหลือ']);
  if (qty > currentQty) {
    return { ok: false, message: 'จำนวนคงเหลือไม่เพียงพอ (คงเหลือ ' + currentQty + ' ' + item['หน่วยนับ'] + ')' };
  }

  var sh = sheet_(SHEET_STOCK_OUT);
  var id = nextId_(SHEET_STOCK_OUT);
  sh.appendRow([
    id, data['วันที่'] || todayStr_(), data.SKU, item['ชื่อวัตถุดิบ'], qty,
    data['หน่วยงาน/แผนกที่เบิก'] || '', data['เลขที่ใบสั่งผลิต'] || '',
    data['ผู้เบิก'] || session.name, data['ผู้อนุมัติ'] || '', data['หมายเหตุ'] || ''
  ]);

  var newQty = currentQty - qty;
  setItemQty_(item._row, newQty);
  appendLedger_('OUT', data.SKU, item['ชื่อวัตถุดิบ'], -qty, newQty, 'StockOut#' + id, session.name, data['หมายเหตุ']);

  return { ok: true, id: id, newQty: newQty };
}

/**
 * ---------- ปรับสต๊อค (Adjustment) ----------
 */
function addAdjustment(token, data) {
  var session = requireSession_(token);
  var item = findItemBySku_(data.SKU);
  if (!item) return { ok: false, message: 'ไม่พบวัตถุดิบ SKU: ' + data.SKU };

  var before = Number(item['จำนวนคงเหลือ']);
  var after = Number(data['จำนวนหลังปรับ']);
  if (isNaN(after) || after < 0) return { ok: false, message: 'กรุณาระบุจำนวนหลังปรับให้ถูกต้อง' };
  var diff = after - before;

  var sh = sheet_(SHEET_ADJUST);
  var id = nextId_(SHEET_ADJUST);
  sh.appendRow([
    id, data['วันที่'] || todayStr_(), data.SKU, item['ชื่อวัตถุดิบ'],
    before, after, diff, data['สาเหตุ'] || '', session.name
  ]);

  setItemQty_(item._row, after);
  appendLedger_('ADJUST', data.SKU, item['ชื่อวัตถุดิบ'], diff, after, 'Adjust#' + id, session.name, data['สาเหตุ']);

  return { ok: true, id: id, newQty: after };
}

/**
 * ---------- ประวัติการเคลื่อนไหว (Ledger) ----------
 */
function getLedger(token, filters) {
  requireSession_(token);
  var rows = sheetToObjects_(SHEET_LEDGER);
  filters = filters || {};

  if (filters.sku) {
    rows = rows.filter(function (r) { return r.SKU === filters.sku; });
  }
  if (filters.type) {
    rows = rows.filter(function (r) { return r['ประเภท'] === filters.type; });
  }
  if (filters.dateFrom) {
    rows = rows.filter(function (r) { return String(r['วันที่เวลา']) >= filters.dateFrom; });
  }
  if (filters.dateTo) {
    rows = rows.filter(function (r) { return String(r['วันที่เวลา']) <= filters.dateTo + ' 23:59:59'; });
  }
  rows.sort(function (a, b) { return new Date(b['วันที่เวลา']) - new Date(a['วันที่เวลา']); });
  return rows;
}

/**
 * Read only the last `maxRows` data rows of a sheet (as objects), instead of
 * the whole sheet. Used for Ledger on the dashboard so that as the Ledger
 * grows over months of use, getDashboardData() doesn't have to pull the
 * entire history into memory / across the google.script.run bridge on every
 * dashboard load (which can get slow enough to time out or fail to
 * serialize, causing the client to receive a null response).
 */
function sheetTail_(sheetName, maxRows) {
  var sh = sheet_(sheetName);
  var lastRow = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  if (lastRow < 2) return [];
  var headers = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  var startRow = Math.max(2, lastRow - maxRows + 1);
  var numRows = lastRow - startRow + 1;
  var values = sh.getRange(startRow, 1, numRows, lastCol).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (row.join('') === '') continue; // skip fully empty rows
    var obj = {};
    for (var c = 0; c < headers.length; c++) obj[headers[c]] = row[c];
    obj._row = startRow + i;
    out.push(obj);
  }
  return out;
}

/**
 * ---------- Dashboard ----------
 */
function getDashboardData(token) {
  requireSession_(token);
  try {
    var items = sheetToObjects_(SHEET_ITEMS);
    var lowStock = items.filter(function (it) {
      return Number(it['จำนวนคงเหลือ']) <= Number(it['จุดสั่งซื้อขั้นต่ำ']);
    });

    var totalValue = items.reduce(function (sum, it) {
      return sum + (Number(it['จำนวนคงเหลือ']) * Number(it['ราคาต่อหน่วย']));
    }, 0);

    var expiryDays = Number(getSetting_('ExpiryAlertDays')) || 30;
    var cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + expiryDays);
    // Same idea as the Ledger tail-read below: StockIn grows by one row every
    // time someone records a receipt, so after months of daily use the full
    // sheet can become large enough that reading + looping over it here
    // (on every single dashboard load) is what pushes getDashboardData()
    // over the execution time limit — which is what was causing the client
    // to receive a null/empty response ("โหลดข้อมูลแดชบอร์ดไม่สำเร็จ").
    // Lots entered further back than ~2x the alert window have almost
    // always already expired or been fully consumed, so it's safe to only
    // scan the most recent rows here.
    var expiring = sheetTail_(SHEET_STOCK_IN, 5000).filter(function (r) {
      return r['วันหมดอายุ'] && new Date(r['วันหมดอายุ']) <= cutoff;
    });

    var today = todayStr_();
    // Only look at the most recent 3000 ledger rows — plenty to cover the
    // "recent 10" list and the 7-day chart, and avoids reading a
    // potentially huge full history every time the dashboard loads.
    var ledger = sheetTail_(SHEET_LEDGER, 3000);
    var todayTx = ledger.filter(function (r) { return String(r['วันที่เวลา']).indexOf(today) === 0; });

    var recent = ledger.slice().sort(function (a, b) {
      return new Date(b['วันที่เวลา']) - new Date(a['วันที่เวลา']);
    }).slice(0, 10);

    // stock movement last 7 days (for chart)
    var last7 = [];
    for (var i = 6; i >= 0; i--) {
      var d = new Date();
      d.setDate(d.getDate() - i);
      var dStr = Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM-dd');
      var inSum = 0, outSum = 0;
      ledger.forEach(function (r) {
        if (String(r['วันที่เวลา']).indexOf(dStr) === 0) {
          if (r['ประเภท'] === 'IN') inSum += Number(r['จำนวนเปลี่ยนแปลง']);
          if (r['ประเภท'] === 'OUT') outSum += Math.abs(Number(r['จำนวนเปลี่ยนแปลง']));
        }
      });
      last7.push({ date: dStr, in: inSum, out: outSum });
    }

    return {
      totalItems: items.length,
      lowStockCount: lowStock.length,
      expiringCount: expiring.length,
      totalValue: totalValue,
      todayTxCount: todayTx.length,
      lowStockList: lowStock.slice(0, 8),
      expiringList: expiring.slice(0, 8),
      recentLedger: recent,
      chart7d: last7
    };
  } catch (e) {
    // Log the real cause to Stackdriver/Executions so it's diagnosable,
    // then rethrow so the client's withFailureHandler shows the actual
    // error instead of silently resolving with null.
    Logger.log('getDashboardData error: ' + (e && e.stack ? e.stack : e));
    throw new Error('โหลดข้อมูลแดชบอร์ดไม่สำเร็จ: ' + (e && e.message ? e.message : e));
  }
}
