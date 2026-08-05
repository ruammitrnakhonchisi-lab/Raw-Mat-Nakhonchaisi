/**
 * ==========================================================
 *  แจ้งเตือนอัตโนมัติทางอีเมล (ตั้งเวลาโดย installDailyAlertTrigger)
 * ==========================================================
 */

function sendDailyAlertEmail() {
  var enabled = String(getSetting_('LowStockEmailEnabled') || 'TRUE').toUpperCase() === 'TRUE';
  if (!enabled) return;

  var email = getSetting_('AlertEmail');
  if (!email) return;

  var items = sheetToObjects_(SHEET_ITEMS);
  var lowStock = items.filter(function (it) {
    return Number(it['จำนวนคงเหลือ']) <= Number(it['จุดสั่งซื้อขั้นต่ำ']);
  });

  var expiryDays = Number(getSetting_('ExpiryAlertDays')) || 30;
  var cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + expiryDays);
  // Cap the read the same way getDashboardData() does — StockIn only grows
  // over time, and old lots have already expired, so scanning the recent
  // tail is enough and keeps this daily trigger from timing out.
  var expiring = sheetTail_(SHEET_STOCK_IN, 5000).filter(function (r) {
    return r['วันหมดอายุ'] && new Date(r['วันหมดอายุ']) <= cutoff;
  });

  if (lowStock.length === 0 && expiring.length === 0) return; // nothing to report today

  var companyName = getSetting_('CompanyName') || '';
  var html = '<h2>สรุปการแจ้งเตือนสต๊อควัตถุดิบ — ' + companyName + '</h2>';
  html += '<p>วันที่: ' + todayStr_() + '</p>';

  if (lowStock.length) {
    html += '<h3>⚠️ วัตถุดิบใกล้หมด/ต่ำกว่าจุดสั่งซื้อ (' + lowStock.length + ' รายการ)</h3><table border="1" cellpadding="6" cellspacing="0"><tr><th>SKU</th><th>ชื่อ</th><th>คงเหลือ</th><th>จุดสั่งซื้อขั้นต่ำ</th><th>หน่วย</th></tr>';
    lowStock.forEach(function (it) {
      html += '<tr><td>' + it.SKU + '</td><td>' + it['ชื่อวัตถุดิบ'] + '</td><td>' + it['จำนวนคงเหลือ'] + '</td><td>' + it['จุดสั่งซื้อขั้นต่ำ'] + '</td><td>' + it['หน่วยนับ'] + '</td></tr>';
    });
    html += '</table>';
  }

  if (expiring.length) {
    html += '<h3>⏰ ล็อตที่ใกล้หมดอายุ (' + expiring.length + ' ล็อต)</h3><table border="1" cellpadding="6" cellspacing="0"><tr><th>SKU</th><th>ชื่อ</th><th>Lot</th><th>วันหมดอายุ</th><th>จำนวน</th></tr>';
    expiring.forEach(function (r) {
      html += '<tr><td>' + r.SKU + '</td><td>' + r['ชื่อวัตถุดิบ'] + '</td><td>' + r['Lot/Batch'] + '</td><td>' + r['วันหมดอายุ'] + '</td><td>' + r['จำนวนรับเข้า'] + '</td></tr>';
    });
    html += '</table>';
  }

  MailApp.sendEmail({
    to: email,
    subject: '[Stock Pro] แจ้งเตือนสต๊อควัตถุดิบ ' + todayStr_(),
    htmlBody: html
  });
}
