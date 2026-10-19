import { api } from '../api.js';
import { esc, fmtNum, todayISO, showErr } from '../ui.js';

function isoMonthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export async function renderPurchase(content) {
  try {
    const [items, settings] = await Promise.all([api.getItems(), api.getSettings()]);
    const active = items.filter((it) => it.status !== 'inactive');
    let months = 3;
    let onlyLow = true;
    let usage = {}; // item_id -> ปริมาณเบิกรวมในช่วงที่เลือก
    const picked = {}; // item_id -> { on, qty }

    content.innerHTML =
      '<div class="print-header"><h2>' + esc(settings.CompanyName || 'Stock Pro') + '</h2>' +
      '<div>ใบขอซื้อวัตถุดิบ — วันที่ ' + esc(todayISO()) + '</div></div>' +
      '<div class="toolbar no-print">' +
      '<label>คำนวณใช้เฉลี่ยจากย้อนหลัง <select id="pr_months">' +
      '<option value="1">1 เดือน</option><option value="3" selected>3 เดือน</option>' +
      '<option value="6">6 เดือน</option><option value="12">12 เดือน</option></select></label>' +
      '<label><input type="checkbox" id="pr_low" checked> เฉพาะต่ำกว่าจุดสั่งซื้อ</label>' +
      '<div class="spacer"></div>' +
      '<button class="btn btn-primary" id="pr_print">🖨️ พิมพ์ใบขอซื้อ</button></div>' +
      '<div id="pr_body"></div>';

    async function loadUsage() {
      const rows = await api.getStockOutInRange(isoMonthsAgo(months), todayISO());
      usage = {};
      rows.forEach((r) => { usage[r.item_id] = (usage[r.item_id] || 0) + Number(r.qty); });
    }

    function render() {
      const list = active.filter((it) => !onlyLow || Number(it.qty_on_hand) <= Number(it.reorder_point));
      const body = list.map((it) => {
        const qty = Number(it.qty_on_hand);
        const avg = (usage[it.id] || 0) / months;
        const days = avg > 0 ? Math.round((qty / avg) * 30) : null;
        const low = qty <= Number(it.reorder_point);
        let p = picked[it.id];
        if (!p) {
          const sug = Number(it.max_stock) > qty ? Math.ceil(Number(it.max_stock) - qty) : '';
          p = picked[it.id] = { on: low, qty: sug };
        }
        const daysBadge = days === null ? '-' :
          '<span class="badge ' + (days <= 15 ? 'badge-danger' : days <= 30 ? 'badge-warn' : 'badge-success') + '">' + days + ' วัน</span>';
        return '<tr data-id="' + it.id + '" class="' + (p.on ? '' : 'no-print') + '">' +
          '<td class="no-print"><input type="checkbox" class="pr_on" ' + (p.on ? 'checked' : '') + '></td>' +
          '<td>' + esc(it.sku) + '</td><td>' + esc(it.name) + '</td>' +
          '<td>' + fmtNum(qty) + ' ' + esc(it.unit) + '</td>' +
          '<td>' + fmtNum(it.reorder_point) + '</td>' +
          '<td>' + (avg > 0 ? fmtNum(avg) : '-') + '</td>' +
          '<td>' + daysBadge + '</td>' +
          '<td><input type="number" class="pr_qty" min="0" step="any" style="width:90px" value="' + esc(p.qty) + '"></td>' +
          '<td>' + esc(it.unit) + '</td><td>' + esc(it.primary_supplier) + '</td></tr>';
      }).join('') || '<tr><td colspan="10" class="empty-state">ไม่มีรายการ</td></tr>';

      document.getElementById('pr_body').innerHTML =
        '<div class="table-wrap"><table><thead><tr><th class="no-print">เลือก</th><th>SKU</th><th>ชื่อ</th>' +
        '<th>สต็อกคงเหลือ</th><th>ขั้นต่ำ</th><th>ใช้เฉลี่ย/เดือน</th><th>คิดเป็นกี่วัน</th>' +
        '<th>จำนวนสั่งซื้อ</th><th>หน่วย</th><th>ผู้จำหน่าย</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
        '<div class="small muted">ใช้เฉลี่ย/เดือน = ยอดเบิกออกย้อนหลัง ' + months + ' เดือน ÷ ' + months +
        ' · คิดเป็นกี่วัน = คงเหลือ ÷ ใช้เฉลี่ย/เดือน × 30</div>';

      document.querySelectorAll('#pr_body tbody tr[data-id]').forEach((tr) => {
        const id = tr.dataset.id;
        tr.querySelector('.pr_on').addEventListener('change', (e) => {
          picked[id].on = e.target.checked;
          tr.classList.toggle('no-print', !e.target.checked);
        });
        tr.querySelector('.pr_qty').addEventListener('input', (e) => { picked[id].qty = e.target.value; });
      });
    }

    await loadUsage();
    render();

    document.getElementById('pr_months').addEventListener('change', async (e) => {
      months = Number(e.target.value);
      try { await loadUsage(); render(); } catch (err) { showErr(content)(err); }
    });
    document.getElementById('pr_low').addEventListener('change', (e) => { onlyLow = e.target.checked; render(); });
    document.getElementById('pr_print').addEventListener('click', () => window.print());
  } catch (err) {
    showErr(content)(err);
  }
}
