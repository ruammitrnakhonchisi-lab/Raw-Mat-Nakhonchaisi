import { api } from '../api.js';
import { esc, fmtNum, fmtMoney, val, todayISO, toast, showErr, downloadCsv } from '../ui.js';
import { groupByCategory } from '../report-categories.js';

function groupRowsByCategory(rows) {
  return groupByCategory(rows, (r) => r['หมวดหมู่'])
    .map((g) => ({ title: g.title, rows: g.items }));
}

export function renderReports(content) {
  content.innerHTML =
    '<div id="rp_printHeader" class="print-header"></div>' +
    '<div class="toolbar no-print">' +
    '<select id="rp_type">' +
    '<option value="value">สรุปวัตถุดิบคงเหลือ (แยกตามหมวดหมู่)</option>' +
    '<option value="movement">รายงานการเคลื่อนไหว (ตามช่วงวันที่)</option>' +
    '<option value="abc">ABC Analysis (จากการเบิกใช้)</option>' +
    '</select>' +
    '<input type="date" id="rp_from"><input type="date" id="rp_to">' +
    '<button class="btn btn-ghost" id="rp_run">แสดงรายงาน</button>' +
    '<div class="spacer"></div>' +
    '<button class="btn btn-ghost" id="rp_print">🖨️ พิมพ์ / PDF</button>' +
    '<button class="btn btn-ghost" id="rp_png">🖼️ บันทึกเป็น PNG</button>' +
    '<button class="btn btn-primary" id="rp_export">⬇️ Export CSV</button>' +
    '</div><div id="rp_table"></div>';

  let currentRows = [];
  let companyName = '';

  api.getSettings().then((s) => { companyName = s.CompanyName || ''; }).catch(() => {});

  function printHeaderHtml(title, dateFrom, dateTo) {
    const rangeLine = (dateFrom || dateTo)
      ? '<div class="small">ช่วงวันที่: ' + esc(dateFrom || '(ไม่ระบุ)') + ' ถึง ' + esc(dateTo || '(ไม่ระบุ)') + '</div>'
      : '';
    return '<h2>' + esc(companyName || 'Stock Pro') + '</h2>' +
      '<div>' + esc(title) + '</div>' +
      rangeLine +
      '<div class="muted small">พิมพ์เมื่อ ' + esc(new Date().toLocaleString('th-TH')) + '</div>';
  }

  function renderCategoryReport(rows) {
    const groups = groupRowsByCategory(rows);
    const grandTotal = rows.reduce((s, r) => s + (Number(r['มูลค่ารวม']) || 0), 0);

    const chips = groups.map((g) => {
      const subtotal = g.rows.reduce((s, r) => s + (Number(r['มูลค่ารวม']) || 0), 0);
      return '<div class="cat-chip"><span class="cat-chip-name">' + esc(g.title) + '</span>' +
        '<span class="cat-chip-value">' + fmtMoney(subtotal) + '</span></div>';
    }).join('');

    const sections = groups.map((g) => {
      const subtotal = g.rows.reduce((s, r) => s + (Number(r['มูลค่ารวม']) || 0), 0);
      const body = g.rows.map((r) =>
        '<tr><td>' + esc(r['ชื่อวัตถุดิบ']) + '</td><td>' + esc(r['หน่วยนับ']) + '</td>' +
        '<td class="num"><strong>' + fmtNum(r['จำนวนคงเหลือ']) + '</strong></td>' +
        '<td class="num">' + fmtMoney(r['ราคาต่อหน่วย']) + '</td>' +
        '<td class="num">' + fmtMoney(r['มูลค่ารวม']) + '</td></tr>'
      ).join('');
      return '<div class="card report-section">' +
        '<div class="report-section-head"><h3>' + esc(g.title) + '</h3>' +
        '<span class="badge badge-muted">' + g.rows.length + ' รายการ</span></div>' +
        '<div class="table-wrap"><table><thead><tr><th>ชื่อวัตถุดิบ</th><th>หน่วย</th>' +
        '<th class="num">คงเหลือ</th><th class="num">ราคา/หน่วย</th><th class="num">มูลค่ารวม</th></tr></thead>' +
        '<tbody>' + body + '</tbody>' +
        '<tfoot><tr class="subtotal-row"><td colspan="4">รวม ' + esc(g.title) + '</td>' +
        '<td class="num">' + fmtMoney(subtotal) + '</td></tr></tfoot>' +
        '</table></div></div>';
    }).join('');

    return '<div id="rp_printArea">' +
      '<div class="report-summary-row">' + chips + '</div>' +
      '<div class="grand-total-card">มูลค่าสต๊อคคงเหลือรวมทั้งหมด <b>' + fmtMoney(grandTotal) + '</b></div>' +
      sections +
      '</div>';
  }

  function renderFlatTable(rows) {
    const headers = Object.keys(rows[0]);
    const thead = headers.map((h) => '<th>' + esc(h) + '</th>').join('');
    const tbody = rows.map((r) =>
      '<tr>' + headers.map((h) => {
        const v = r[h];
        return '<td>' + (typeof v === 'number' ? fmtNum(v) : esc(v)) + '</td>';
      }).join('') + '</tr>'
    ).join('');
    return '<div id="rp_printArea"><div class="table-wrap"><table><thead><tr>' + thead +
      '</tr></thead><tbody>' + tbody + '</tbody></table></div></div>';
  }

  async function run() {
    const type = val('rp_type');
    const titles = {
      value: 'สรุปวัตถุดิบคงเหลือ (แยกตามหมวดหมู่)',
      movement: 'รายงานการเคลื่อนไหว',
      abc: 'ABC Analysis (จากการเบิกใช้)',
    };
    const dateFrom = type === 'value' ? '' : val('rp_from');
    const dateTo = type === 'value' ? '' : val('rp_to');
    document.getElementById('rp_printHeader').innerHTML = printHeaderHtml(titles[type], dateFrom, dateTo);
    try {
      if (type === 'value') currentRows = await reportStockValue();
      else if (type === 'movement') currentRows = await reportMovement(val('rp_from'), val('rp_to'));
      else currentRows = await reportABC(val('rp_from'), val('rp_to'));

      if (!currentRows.length) {
        document.getElementById('rp_table').innerHTML = '<div class="empty-state">ไม่พบข้อมูล</div>';
        return;
      }
      document.getElementById('rp_table').innerHTML =
        type === 'value' ? renderCategoryReport(currentRows) : renderFlatTable(currentRows);
    } catch (err) {
      showErr(content)(err);
    }
  }

  document.getElementById('rp_run').addEventListener('click', run);
  document.getElementById('rp_export').addEventListener('click', function () {
    if (!currentRows.length) { toast('ไม่มีข้อมูลให้ export', 'error'); return; }
    downloadCsv(currentRows, 'report_' + val('rp_type') + '_' + todayISO() + '.csv');
  });
  document.getElementById('rp_print').addEventListener('click', function () {
    if (!currentRows.length) { toast('ไม่มีข้อมูลให้พิมพ์', 'error'); return; }
    window.print();
  });
  document.getElementById('rp_png').addEventListener('click', async function () {
    const area = document.getElementById('rp_printArea');
    if (!area) { toast('ไม่มีข้อมูลให้บันทึก', 'error'); return; }
    toast('กำลังสร้างรูปภาพ...', 'success');
    try {
      const { default: html2canvas } = await import('https://esm.sh/html2canvas@1.4.1');
      const wrap = document.createElement('div');
      wrap.style.background = '#ffffff';
      wrap.style.padding = '20px';
      wrap.appendChild(document.getElementById('rp_printHeader').cloneNode(true));
      wrap.firstChild.style.display = 'block';
      wrap.appendChild(area.cloneNode(true));
      wrap.style.position = 'fixed';
      wrap.style.left = '-99999px';
      wrap.style.top = '0';
      wrap.style.width = area.offsetWidth + 'px';
      document.body.appendChild(wrap);
      const canvas = await html2canvas(wrap, { backgroundColor: '#ffffff', scale: 2 });
      document.body.removeChild(wrap);
      canvas.toBlob((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'report_' + val('rp_type') + '_' + todayISO() + '.png';
        a.click();
        URL.revokeObjectURL(url);
      });
    } catch (err) {
      toast('สร้างรูปภาพไม่สำเร็จ: ' + err.message, 'error');
    }
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
