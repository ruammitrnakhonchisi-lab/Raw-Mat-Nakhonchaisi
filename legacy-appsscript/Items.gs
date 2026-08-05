/**
 * ==========================================================
 *  จัดการข้อมูลหลักวัตถุดิบ (Items Master Data)
 * ==========================================================
 */

function getItems(token) {
  requireSession_(token);
  return sheetToObjects_(SHEET_ITEMS);
}

function getCategories(token) {
  requireSession_(token);
  return sheetToObjects_(SHEET_CATEGORIES).map(function (c) { return c['ชื่อหมวดหมู่']; }).filter(String);
}

function addCategory(token, name) {
  requireSession_(token);
  name = String(name || '').trim();
  if (!name) return { ok: false, message: 'กรุณาระบุชื่อหมวดหมู่' };
  sheet_(SHEET_CATEGORIES).appendRow([name]);
  return { ok: true };
}

function addItem(token, item) {
  requireSession_(token);
  var sh = sheet_(SHEET_ITEMS);

  if (!item.SKU || !item['ชื่อวัตถุดิบ']) {
    return { ok: false, message: 'กรุณาระบุ SKU และชื่อวัตถุดิบ' };
  }

  var existing = sheetToObjects_(SHEET_ITEMS);
  if (existing.some(function (r) { return r.SKU === item.SKU; })) {
    return { ok: false, message: 'มี SKU นี้อยู่แล้วในระบบ' };
  }

  var id = nextId_(SHEET_ITEMS);
  var now = nowStr_();
  sh.appendRow([
    id,
    item.SKU,
    item['ชื่อวัตถุดิบ'],
    item['หมวดหมู่'] || '',
    item['หน่วยนับ'] || '',
    Number(item['จำนวนคงเหลือ']) || 0,
    Number(item['จุดสั่งซื้อขั้นต่ำ']) || 0,
    Number(item['สต๊อคสูงสุด']) || 0,
    Number(item['ราคาต่อหน่วย']) || 0,
    item['ผู้จำหน่ายหลัก'] || '',
    item['ที่จัดเก็บ'] || '',
    item['สถานะ'] || 'active',
    now,
    now
  ]);
  return { ok: true, id: id };
}

function updateItem(token, item) {
  requireSession_(token);
  var sh = sheet_(SHEET_ITEMS);
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var idCol = headers.indexOf('ID');

  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(item.ID)) {
      var row = i + 1;
      var updates = {
        'ชื่อวัตถุดิบ': item['ชื่อวัตถุดิบ'],
        'หมวดหมู่': item['หมวดหมู่'],
        'หน่วยนับ': item['หน่วยนับ'],
        'จุดสั่งซื้อขั้นต่ำ': Number(item['จุดสั่งซื้อขั้นต่ำ']) || 0,
        'สต๊อคสูงสุด': Number(item['สต๊อคสูงสุด']) || 0,
        'ราคาต่อหน่วย': Number(item['ราคาต่อหน่วย']) || 0,
        'ผู้จำหน่ายหลัก': item['ผู้จำหน่ายหลัก'],
        'ที่จัดเก็บ': item['ที่จัดเก็บ'],
        'สถานะ': item['สถานะ'],
        'อัปเดตล่าสุด': nowStr_()
      };
      Object.keys(updates).forEach(function (key) {
        var col = headers.indexOf(key);
        if (col > -1) sh.getRange(row, col + 1).setValue(updates[key]);
      });
      return { ok: true };
    }
  }
  return { ok: false, message: 'ไม่พบรายการวัตถุดิบนี้' };
}

function deleteItem(token, id) {
  requireAdmin_(token);
  var sh = sheet_(SHEET_ITEMS);
  var data = sh.getDataRange().getValues();
  var idCol = data[0].indexOf('ID');
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][idCol]) === String(id)) {
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, message: 'ไม่พบรายการ' };
}

function getLowStock(token) {
  requireSession_(token);
  var items = sheetToObjects_(SHEET_ITEMS);
  return items.filter(function (it) {
    return Number(it['จำนวนคงเหลือ']) <= Number(it['จุดสั่งซื้อขั้นต่ำ']);
  });
}

function getExpiringSoon(token, days) {
  requireSession_(token);
  days = days || Number(getSetting_('ExpiryAlertDays')) || 30;
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + days);

  // Same reasoning as getDashboardData(): StockIn only ever grows, so after
  // months of use a full-sheet read here can get slow enough to time out.
  // Old lots have long since expired, so scanning just the recent tail is
  // enough to find anything that could still be "expiring soon".
  var stockIns = sheetTail_(SHEET_STOCK_IN, 5000);
  var outByLot = {}; // rudimentary; treated at item-level FEFO isn't tracked per-lot balance here

  return stockIns.filter(function (r) {
    if (!r['วันหมดอายุ']) return false;
    var exp = new Date(r['วันหมดอายุ']);
    return exp <= cutoff;
  }).sort(function (a, b) {
    return new Date(a['วันหมดอายุ']) - new Date(b['วันหมดอายุ']);
  });
}

function getSetting_(key) {
  var settings = sheetToObjects_(SHEET_SETTINGS);
  var row = settings.filter(function (s) { return s.Key === key; })[0];
  return row ? row.Value : null;
}

function setSetting_(key, value) {
  var sh = sheet_(SHEET_SETTINGS);
  var data = sh.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] === key) {
      sh.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sh.appendRow([key, value]);
}

function getSettings(token) {
  requireSession_(token);
  var out = {};
  sheetToObjects_(SHEET_SETTINGS).forEach(function (s) { out[s.Key] = s.Value; });
  return out;
}

function saveSettings(token, settings) {
  requireAdmin_(token);
  Object.keys(settings).forEach(function (k) { setSetting_(k, settings[k]); });
  return { ok: true };
}
