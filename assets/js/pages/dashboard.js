import { api } from '../api.js';
import { STATE as AUTH } from '../auth.js';
import { esc, fmtNum, fmtMoney, statCard, showErr, todayISO } from '../ui.js';
import { groupByCategory } from '../report-categories.js';

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'สวัสดีตอนเช้า';
  if (h < 17) return 'สวัสดีตอนบ่าย';
  return 'สวัสดีตอนเย็น';
}

export async function renderDashboard(content) {
  try {
    const [items, settings, ledger] = await Promise.all([
      api.getItems(),
      api.getSettings(),
      api.getLedger({ limit: 3000 }),
    ]);

    const lowStock = items.filter((it) => Number(it.qty_on_hand) <= Number(it.reorder_point));
    const totalValue = items.reduce((sum, it) => sum + Number(it.qty_on_hand) * Number(it.unit_price), 0);

    const expiryDays = Number(settings.ExpiryAlertDays) || 30;
    const expiring = await api.getExpiringStockIn(expiryDays);

    const today = todayISO();
    const todayTx = ledger.filter((r) => String(r.created_at).indexOf(today) === 0);
    const recent = ledger.slice(0, 10);

    const last7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = d.toISOString().slice(0, 10);
      let inSum = 0, outSum = 0;
      ledger.forEach((r) => {
        if ((r.txn_date || String(r.created_at).slice(0, 10)) === dStr) {
          if (r.txn_type === 'IN') inSum += Number(r.delta);
          if (r.txn_type === 'OUT') outSum += Math.abs(Number(r.delta));
        }
      });
      last7.push({ date: dStr, in: inSum, out: outSum });
    }

    const lowRows = lowStock.slice(0, 8).map((it) =>
      '<tr><td>' + esc(it.sku) + '</td><td>' + esc(it.name) + '</td>' +
      '<td>' + fmtNum(it.qty_on_hand) + ' ' + esc(it.unit) + '</td>' +
      '<td><span class="badge badge-danger">ต่ำกว่าขั้นต่ำ</span></td></tr>'
    ).join('') || '<tr><td colspan="4" class="empty-state">ไม่มีรายการต่ำกว่าจุดสั่งซื้อ 🎉</td></tr>';

    const expRows = expiring.slice(0, 8).map((r) =>
      '<tr><td>' + esc(r.sku) + '</td><td>' + esc(r.item_name) + '</td>' +
      '<td>' + esc(r.lot_batch) + '</td><td>' + esc(r.expiry_date) + '</td></tr>'
    ).join('') || '<tr><td colspan="4" class="empty-state">ไม่มีล็อตใกล้หมดอายุ 🎉</td></tr>';

    const recentRows = recent.map((r) => {
      const badge = r.txn_type === 'IN' ? 'badge-success' : (r.txn_type === 'OUT' ? 'badge-danger' : 'badge-warn');
      const label = r.txn_type === 'IN' ? 'รับเข้า' : (r.txn_type === 'OUT' ? 'เบิกออก' : 'ปรับสต๊อค');
      return '<tr><td>' + esc(new Date(r.created_at).toLocaleString('th-TH')) + '</td><td><span class="badge ' + badge + '">' + label + '</span></td>' +
        '<td>' + esc(r.item_name) + '</td><td>' + fmtNum(r.delta) + '</td><td>' + esc(r.recorded_by_name) + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="empty-state">ยังไม่มีรายการ</td></tr>';

    const maxVal = Math.max.apply(null, last7.map((r) => Math.max(r.in, r.out)).concat([1]));
    const chartBars = last7.map((r) => {
      const inH = Math.round((r.in / maxVal) * 100);
      const outH = Math.round((r.out / maxVal) * 100);
      const day = new Date(r.date).toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit' });
      return '<div class="bar-col"><div class="bar-pair">' +
        '<div class="bar in" style="height:' + Math.max(inH, 2) + '%" title="รับเข้า ' + fmtNum(r.in) + '"></div>' +
        '<div class="bar out" style="height:' + Math.max(outH, 2) + '%" title="เบิกออก ' + fmtNum(r.out) + '"></div>' +
        '</div><div class="lbl">' + day + '</div></div>';
    }).join('');

    const catGroups = groupByCategory(items, (it) => it.category)
      .map((g) => ({
        title: g.title,
        count: g.items.length,
        value: g.items.reduce((s, it) => s + Number(it.qty_on_hand) * Number(it.unit_price), 0),
      }))
      .sort((a, b) => b.value - a.value);
    const catMax = Math.max.apply(null, catGroups.map((g) => g.value).concat([1]));
    const catRows = catGroups.map((g) =>
      '<div class="cat-bar-row"><span class="name">' + esc(g.title) + '</span>' +
      '<div class="cat-bar-track"><div class="cat-bar-fill" style="width:' + Math.max(Math.round((g.value / catMax) * 100), 2) + '%"></div></div>' +
      '<span class="cat-bar-value">' + fmtMoney(g.value) + '</span></div>'
    ).join('') || '<div class="empty-state">ยังไม่มีข้อมูล</div>';

    const userName = (AUTH.profile && AUTH.profile.display_name) || '';
    const isAdmin = AUTH.profile && AUTH.profile.role === 'admin';

    content.innerHTML =
      '<div class="dash-hero">' +
        '<div><h2>' + greeting() + (userName ? ', ' + esc(userName) : '') + ' 👋</h2>' +
        '<div class="muted small">' + esc(new Date().toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })) + '</div></div>' +
        '<div class="quick-actions">' +
          '<button class="btn btn-primary" onclick="navigate(\'stockin\')">⬇️ รับเข้า</button>' +
          '<button class="btn btn-danger" onclick="navigate(\'stockout\')">⬆️ เบิกออก</button>' +
          (isAdmin ? '<button class="btn btn-ghost" onclick="navigate(\'adjust\')">🛠️ ปรับสต๊อค</button>' : '') +
          '<button class="btn btn-ghost" onclick="navigate(\'reports\')">📊 รายงาน</button>' +
        '</div>' +
      '</div>' +

      '<div class="grid grid-5">' +
      statCard('📦', 'รายการวัตถุดิบทั้งหมด', items.length, '') +
      statCard('⚠️', 'ต่ำกว่าจุดสั่งซื้อ', lowStock.length, 'danger') +
      statCard('⏰', 'ใกล้หมดอายุ', expiring.length, 'warn') +
      statCard('💰', 'มูลค่าสต๊อครวม', fmtMoney(totalValue), 'success') +
      statCard('📝', 'ธุรกรรมวันนี้', todayTx.length, '') +
      '</div>' +

      '<div class="grid grid-2" style="margin-top:16px;">' +
        '<div class="card"><h3>การเคลื่อนไหว 7 วันล่าสุด</h3>' +
          '<div style="display:flex;gap:14px;font-size:12px;margin-bottom:4px;">' +
          '<span><span style="display:inline-block;width:10px;height:10px;background:#1e8e5a;border-radius:2px;"></span> รับเข้า</span>' +
          '<span><span style="display:inline-block;width:10px;height:10px;background:#d93025;border-radius:2px;"></span> เบิกออก</span></div>' +
          '<div class="bar-chart">' + chartBars + '</div></div>' +
        '<div class="card"><h3>มูลค่าสต๊อคตามหมวดหมู่</h3><div class="cat-bar-list">' + catRows + '</div></div>' +
      '</div>' +

      '<div class="card" style="margin-top:16px;"><h3>รายการล่าสุด</h3>' +
        '<div class="table-wrap" style="border:none;"><table><thead><tr><th>เวลา</th><th>ประเภท</th><th>วัตถุดิบ</th><th>จำนวน</th><th>ผู้บันทึก</th></tr></thead>' +
        '<tbody>' + recentRows + '</tbody></table></div></div>' +

      '<div class="section-title"><h3>⚠️ วัตถุดิบต่ำกว่าจุดสั่งซื้อ</h3><a href="#" onclick="navigate(\'items\');return false;" class="small">ดูทั้งหมด →</a></div>' +
      '<div class="table-wrap"><table><thead><tr><th>SKU</th><th>ชื่อวัตถุดิบ</th><th>คงเหลือ</th><th>สถานะ</th></tr></thead><tbody>' + lowRows + '</tbody></table></div>' +

      '<div class="section-title"><h3>⏰ ล็อตใกล้หมดอายุ</h3><a href="#" onclick="navigate(\'alerts\');return false;" class="small">ดูทั้งหมด →</a></div>' +
      '<div class="table-wrap"><table><thead><tr><th>SKU</th><th>ชื่อวัตถุดิบ</th><th>Lot</th><th>วันหมดอายุ</th></tr></thead><tbody>' + expRows + '</tbody></table></div>';
  } catch (err) {
    showErr(content)(err);
  }
}
