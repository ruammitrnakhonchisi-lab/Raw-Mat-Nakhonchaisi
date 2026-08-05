import { api } from '../api.js';
import { esc, fmtNum, val, todayISO, toast, showErr, downloadCsv } from '../ui.js';

export function renderReports(content) {
  content.innerHTML =
    '<div class="toolbar">' +
    '<select id="rp_type">' +
    '<option value="value">มูลค่าสต๊อคปัจจุบัน</option>' +
    '<option value="movement">รายงานการเคลื่อนไหว (ตามช่วงวันที่)</option>' +
    '<option value="abc">ABC Analysis (จากการเบิกใช้)</option>' +
    '</select>' +
    '<input type="date" id="rp_from"><input type="date" id="rp_to">' +
    '<button class="btn btn-ghost" id="rp_run">แสดงรายงาน</button>' +
    '<div class="spacer"></div>' +
    '<button class="btn btn-primary" id="rp_export">⬇️ Export CSV</button>' +
    '</div><div id="rp_table"></div>';

  let currentRows = [];

  async function run() {
    const type = val('rp_type');
    try {
      if (type === 'value') currentRows = await reportStockValue();
      else if (type === 'movement') currentRows = await reportMovement(val('rp_from'), val('rp_to'));
      else currentRows = await reportABC(val('rp_from'), val('rp_to'));

      if (!currentRows.length) {
        document.getElementById('rp_table').innerHTML = '<div class="empty-state">ไม่พบข้อมูล</div>';
        return;
      }
      const headers = Object.keys(currentRows[0]);
      const thead = headers.map((h) => '<th>' + esc(h) + '</th>').join('');
      const tbody = currentRows.map((r) =>
        '<tr>' + headers.map((h) => {
          const v = r[h];
          return '<td>' + (typeof v === 'number' ? fmtNum(v) : esc(v)) + '</td>';
        }).join('') + '</tr>'
      ).join('');
      document.getElementById('rp_table').innerHTML =
        '<div class="table-wrap"><table><thead><tr>' + thead + '</tr></thead><tbody>' + tbody + '</tbody></table></div>';
    } catch (err) {
      showErr(content)(err);
    }
  }

  document.getElementById('rp_run').addEventListener('click', run);
  document.getElementById('rp_export').addEventListener('click', function () {
    if (!currentRows.length) { toast('ไม่มีข้อมูลให้ export', 'error'); return; }
    downloadCsv(currentRows, 'report_' + val('rp_type') + '_' + todayISO() + '.csv');
  });
  run();
}

async function reportStockValue() {
  const items = await api.getItems();
  const rows = items.map((it) => {
    const qty = Number(it.qty_on_hand);
    const price = Number(it.unit_price);
    return {
      SKU: it.sku, ชื่อวัตถุดิบ: it.name, หมวดหมู่: it.category, หน่วยนับ: it.unit,
      จำนวนคงเหลือ: qty, ราคาต่อหน่วย: price, มูลค่ารวม: qty * price,
    };
  });
  rows.sort((a, b) => b['มูลค่ารวม'] - a['มูลค่ารวม']);
  return rows;
}

async function reportMovement(dateFrom, dateTo) {
  const ledger = await api.getLedger({ dateFrom, dateTo, limit: 5000 });
  const bySku = {};
  ledger.forEach((r) => {
    if (!bySku[r.sku]) {
      bySku[r.sku] = { SKU: r.sku, ชื่อวัตถุดิบ: r.item_name, รับเข้ารวม: 0, เบิกออกรวม: 0, ปรับสต๊อครวม: 0, จำนวนรายการ: 0 };
    }
    const qty = Number(r.delta);
    if (r.txn_type === 'IN') bySku[r.sku]['รับเข้ารวม'] += qty;
    if (r.txn_type === 'OUT') bySku[r.sku]['เบิกออกรวม'] += Math.abs(qty);
    if (r.txn_type === 'ADJUST') bySku[r.sku]['ปรับสต๊อครวม'] += qty;
    bySku[r.sku]['จำนวนรายการ'] += 1;
  });
  return Object.values(bySku);
}

async function reportABC(dateFrom, dateTo) {
  const [items, outs] = await Promise.all([api.getItems(), api.getStockOutInRange(dateFrom, dateTo)]);
  const priceBySku = {};
  items.forEach((it) => { priceBySku[it.sku] = Number(it.unit_price); });

  const usageValue = {};
  const nameBySku = {};
  outs.forEach((r) => {
    const value = Number(r.qty) * (priceBySku[r.sku] || 0);
    usageValue[r.sku] = (usageValue[r.sku] || 0) + value;
    nameBySku[r.sku] = r.item_name;
  });

  const list = Object.keys(usageValue).map((sku) => ({ SKU: sku, ชื่อวัตถุดิบ: nameBySku[sku], มูลค่าการเบิกใช้: usageValue[sku] }));
  list.sort((a, b) => b['มูลค่าการเบิกใช้'] - a['มูลค่าการเบิกใช้']);

  const total = list.reduce((s, r) => s + r['มูลค่าการเบิกใช้'], 0);
  let cum = 0;
  list.forEach((r) => {
    cum += r['มูลค่าการเบิกใช้'];
    const pct = total > 0 ? (cum / total) * 100 : 0;
    r['สัดส่วนสะสม(%)'] = Math.round(pct * 100) / 100;
    r['กลุ่ม'] = pct <= 80 ? 'A' : (pct <= 95 ? 'B' : 'C');
  });
  return list;
}
