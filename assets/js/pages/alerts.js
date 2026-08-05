import { api } from '../api.js';
import { esc, fmtNum, showErr } from '../ui.js';

export async function renderAlerts(content) {
  try {
    const [items, settings] = await Promise.all([api.getItems(), api.getSettings()]);
    const low = items.filter((it) => Number(it.qty_on_hand) <= Number(it.reorder_point));
    const expiryDays = Number(settings.ExpiryAlertDays) || 30;
    const exp = await api.getExpiringStockIn(expiryDays);

    const lowRows = low.map((it) =>
      '<tr><td>' + esc(it.sku) + '</td><td>' + esc(it.name) + '</td>' +
      '<td>' + fmtNum(it.qty_on_hand) + ' ' + esc(it.unit) + '</td>' +
      '<td>' + fmtNum(it.reorder_point) + '</td><td>' + esc(it.primary_supplier) + '</td></tr>'
    ).join('') || '<tr><td colspan="5" class="empty-state">ไม่มีรายการต่ำกว่าจุดสั่งซื้อ 🎉</td></tr>';

    const expRows = exp.map((r) => {
      const days = Math.ceil((new Date(r.expiry_date) - new Date()) / 86400000);
      const badge = days < 7 ? 'badge-danger' : 'badge-warn';
      const lbl = days < 0 ? 'หมดอายุแล้ว' : (days + ' วัน');
      return '<tr><td>' + esc(r.sku) + '</td><td>' + esc(r.item_name) + '</td><td>' + esc(r.lot_batch) + '</td>' +
        '<td>' + esc(r.expiry_date) + '</td><td><span class="badge ' + badge + '">' + lbl + '</span></td><td>' + fmtNum(r.qty) + '</td></tr>';
    }).join('') || '<tr><td colspan="6" class="empty-state">ไม่มีล็อตใกล้หมดอายุ 🎉</td></tr>';

    content.innerHTML =
      '<div class="section-title"><h3>⚠️ วัตถุดิบต่ำกว่าจุดสั่งซื้อ (' + low.length + ')</h3></div>' +
      '<div class="table-wrap"><table><thead><tr><th>SKU</th><th>ชื่อ</th><th>คงเหลือ</th><th>จุดสั่งซื้อขั้นต่ำ</th><th>ผู้จำหน่าย</th></tr></thead><tbody>' + lowRows + '</tbody></table></div>' +
      '<div class="section-title"><h3>⏰ ล็อตใกล้หมดอายุ / หมดอายุแล้ว (' + exp.length + ')</h3></div>' +
      '<div class="table-wrap"><table><thead><tr><th>SKU</th><th>ชื่อ</th><th>Lot</th><th>วันหมดอายุ</th><th>สถานะ</th><th>จำนวน</th></tr></thead><tbody>' + expRows + '</tbody></table></div>';
  } catch (err) {
    showErr(content)(err);
  }
}
