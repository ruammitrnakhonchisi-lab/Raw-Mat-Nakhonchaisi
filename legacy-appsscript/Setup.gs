/**
 * ==========================================================
 *  ตัวติดตั้งระบบ (Run once): initializeSpreadsheet()
 *  ไปที่เมนู Run > initializeSpreadsheet ใน Apps Script editor
 * ==========================================================
 */

function initializeSpreadsheet() {
  var ss = ss_();

  createSheetWithHeaders_(SHEET_ITEMS, [
    'ID', 'SKU', 'ชื่อวัตถุดิบ', 'หมวดหมู่', 'หน่วยนับ',
    'จำนวนคงเหลือ', 'จุดสั่งซื้อขั้นต่ำ', 'สต๊อคสูงสุด',
    'ราคาต่อหน่วย', 'ผู้จำหน่ายหลัก', 'ที่จัดเก็บ', 'สถานะ',
    'วันที่สร้าง', 'อัปเดตล่าสุด'
  ]);

  createSheetWithHeaders_(SHEET_STOCK_IN, [
    'ID', 'วันที่', 'SKU', 'ชื่อวัตถุดิบ', 'Lot/Batch', 'วันหมดอายุ',
    'จำนวนรับเข้า', 'ราคาต่อหน่วย', 'มูลค่ารวม', 'ผู้จำหน่าย',
    'เลขที่เอกสาร/PO', 'ผู้บันทึก', 'หมายเหตุ'
  ]);

  createSheetWithHeaders_(SHEET_STOCK_OUT, [
    'ID', 'วันที่', 'SKU', 'ชื่อวัตถุดิบ', 'จำนวนเบิก',
    'หน่วยงาน/แผนกที่เบิก', 'เลขที่ใบสั่งผลิต', 'ผู้เบิก',
    'ผู้อนุมัติ', 'หมายเหตุ'
  ]);

  createSheetWithHeaders_(SHEET_ADJUST, [
    'ID', 'วันที่', 'SKU', 'ชื่อวัตถุดิบ', 'จำนวนก่อนปรับ',
    'จำนวนหลังปรับ', 'ผลต่าง', 'สาเหตุ', 'ผู้บันทึก'
  ]);

  createSheetWithHeaders_(SHEET_LEDGER, [
    'ID', 'วันที่เวลา', 'ประเภท', 'SKU', 'ชื่อวัตถุดิบ',
    'จำนวนเปลี่ยนแปลง', 'คงเหลือหลังทำรายการ', 'อ้างอิง',
    'ผู้บันทึก', 'หมายเหตุ'
  ]);

  createSheetWithHeaders_(SHEET_USERS, [
    'Username', 'PasswordHash', 'ชื่อ-สกุล', 'Role', 'สถานะ', 'สร้างเมื่อ'
  ]);

  createSheetWithHeaders_(SHEET_CATEGORIES, ['ชื่อหมวดหมู่']);

  createSheetWithHeaders_(SHEET_SETTINGS, ['Key', 'Value']);

  // default settings
  var settingsSh = sheet_(SHEET_SETTINGS);
  if (settingsSh.getLastRow() < 2) {
    settingsSh.getRange(2, 1, 4, 2).setValues([
      ['CompanyName', 'บริษัทของฉัน จำกัด'],
      ['ExpiryAlertDays', 30],
      ['AlertEmail', Session.getEffectiveUser().getEmail()],
      ['LowStockEmailEnabled', 'TRUE']
    ]);
  }

  // default categories
  var catSh = sheet_(SHEET_CATEGORIES);
  if (catSh.getLastRow() < 2) {
    catSh.getRange(2, 1, 5, 1).setValues([
      ['วัตถุดิบหลัก'], ['บรรจุภัณฑ์'], ['สารเคมี'], ['อะไหล่/OEM'], ['อื่นๆ']
    ]);
  }

  // default admin user (username: admin / password: admin1234) — เปลี่ยนรหัสผ่านทันทีหลังติดตั้ง!
  var usersSh = sheet_(SHEET_USERS);
  if (usersSh.getLastRow() < 2) {
    usersSh.appendRow([
      'admin', hashPassword_('admin1234'), 'ผู้ดูแลระบบ', 'admin', 'active', nowStr_()
    ]);
  }

  // remove default "Sheet1" if empty and unused
  var sheet1 = ss.getSheetByName('Sheet1');
  if (sheet1 && ss.getSheets().length > 1) {
    var isEmpty = sheet1.getLastRow() === 0;
    if (isEmpty) ss.deleteSheet(sheet1);
  }

  SpreadsheetApp.flush();
  Logger.log('ติดตั้งสำเร็จ! Username: admin / Password: admin1234 (กรุณาเปลี่ยนรหัสผ่านทันที)');
}

function createSheetWithHeaders_(name, headers) {
  var ss = ss_();
  var sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  if (sh.getLastRow() === 0) {
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#1a73e8').setFontColor('#ffffff');
    sh.autoResizeColumns(1, headers.length);
  }
  return sh;
}

/**
 * Optional: install a daily trigger (9:00 AM) that emails low-stock /
 * near-expiry alerts. Call installDailyAlertTrigger() once, or use the
 * "ตั้งค่า" page in the app (admin only) which calls this for you.
 */
function installDailyAlertTrigger() {
  removeDailyAlertTrigger();
  ScriptApp.newTrigger('sendDailyAlertEmail')
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();
}

function removeDailyAlertTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (t) {
    if (t.getHandlerFunction() === 'sendDailyAlertEmail') {
      ScriptApp.deleteTrigger(t);
    }
  });
}
