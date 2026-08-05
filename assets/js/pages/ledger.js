import { api } from '../api.js';
import { esc, fmtNum, val, showErr } from '../ui.js';

const TYPE_LABEL = { IN: 'รับเข้า', OUT: 'เบิกออก', ADJUST: 'ปรับสต๊อค', VOID_IN: 'ยกเลิกรับเข้า' };
const TYPE_BADGE = { IN: 'badge-success', OUT: 'badge-danger', ADJUST: 'badge-warn', VOID_IN: 'badge-muted' };

export function renderLedger(content) {
  content.innerHTML =
    '<div class="toolbar">' +
    '<input type="date" id="lg_from"><input type="date" id="lg_to">' +
    '<select id="lg_type"><option value="">ทุกประเภท</option><option value="IN">รับเข้า</option>' +
    '<option value="OUT">เบิกออก</option><option value="ADJUST">ปรับสต๊อค</option><option value="VOID_IN">ยกเลิกรับเข้า</option></select>' +
    '<button class="btn btn-ghost" id="lg_filter">กรอง</button>' +
    '<div class="spacer"></div>' +
    '</div><div id="lg_table"></div>';

  async function load() {
    try {
      const rows = await api.getLedger({ dateFrom: val('lg_from'), dateTo: val('lg_to'), type: val('lg_type') });
      const tbody = rows.map((r) => {
        const badge = TYPE_BADGE[r.txn_type] || 'badge-muted';
        const label = TYPE_LABEL[r.txn_type] || r.txn_type;
        return '<tr><td>' + esc(new Date(r.created_at).toLocaleString('th-TH')) + '</td><td><span class="badge ' + badge + '">' + label + '</span></td>' +
          '<td>' + esc(r.sku) + '</td><td>' + esc(r.item_name) + '</td><td>' + fmtNum(r.delta) + '</td>' +
          '<td>' + fmtNum(r.balance_after) + '</td><td>' + esc(r.ref) + '</td><td>' + esc(r.recorded_by_name) + '</td></tr>';
      }).join('') || '<tr><td colspan="8" class="empty-state">ไม่พบรายการ</td></tr>';
      document.getElementById('lg_table').innerHTML =
        '<div class="table-wrap"><table><thead><tr><th>วันที่เวลา</th><th>ประเภท</th><th>SKU</th><th>ชื่อวัตถุดิบ</th>' +
        '<th>จำนวนเปลี่ยนแปลง</th><th>คงเหลือ</th><th>อ้างอิง</th><th>ผู้บันทึก</th></tr></thead><tbody>' + tbody + '</tbody></table></div>';
    } catch (err) {
      showErr(content)(err);
    }
  }
  document.getElementById('lg_filter').addEventListener('click', load);
  load();
}
