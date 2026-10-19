import { api } from '../api.js';
import { esc, fmtNum, todayISO, showErr, toast } from '../ui.js';

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
    let pending = {}; // item_id -> ค้างส่ง (สั่งแล้วยังไม่รับ) จากใบที่ยังเปิด
    let dbReady = true;
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
      '<input type="text" id="pr_note" placeholder="หมายเหตุใบขอซื้อ" style="min-width:180px">' +
      '<button class="btn btn-ghost" id="pr_save">💾 บันทึกใบขอซื้อ</button>' +
      '<button class="btn btn-primary" id="pr_print">🖨️ พิมพ์ใบขอซื้อ</button></div>' +
      '<div id="pr_body"></div><div id="pr_open" class="no-print"></div>';

    async function loadPending() {
      pending = {};
      try {
        const lines = await api.getOpenPurchaseLines();
        lines.forEach((l) => {
          pending[l.item_id] = (pending[l.item_id] || 0) + Math.max(0, Number(l.qty) - Number(l.received_qty));
        });
        dbReady = true;
      } catch (e) {
        dbReady = false; // ยังไม่ได้รัน supabase/add_purchase_requests.sql
      }
    }

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
        const owed = pending[it.id] || 0;
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
          '<td>' + (Number(it.lead_time_days) ? it.lead_time_days + ' วัน' : '-') + '</td>' +
          '<td>' + (owed ? fmtNum(owed) : '-') + '</td>' +
          '<td>' + (avg > 0 ? fmtNum(avg) : '-') + '</td>' +
          '<td>' + daysBadge + '</td>' +
          '<td><input type="number" class="pr_qty" min="0" step="any" style="width:90px" value="' + esc(p.qty) + '"></td>' +
          '<td>' + esc(it.unit) + '</td><td>' + esc(it.primary_supplier) + '</td></tr>';
      }).join('') || '<tr><td colspan="12" class="empty-state">ไม่มีรายการ</td></tr>';

      document.getElementById('pr_body').innerHTML =
        '<div class="table-wrap"><table><thead><tr><th class="no-print">เลือก</th><th>SKU</th><th>ชื่อ</th>' +
        '<th>สต็อกคงเหลือ</th><th>ขั้นต่ำ</th><th>สั่งล่วงหน้า</th><th>ค้างส่ง</th><th>ใช้เฉลี่ย/เดือน</th><th>คิดเป็นกี่วัน</th>' +
        '<th>จำนวนสั่งซื้อ</th><th>หน่วย</th><th>ผู้จำหน่าย</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
        '<div class="small muted">ใช้เฉลี่ย/เดือน = ยอดเบิกออกย้อนหลัง ' + months + ' เดือน ÷ ' + months +
        ' · คิดเป็นกี่วัน = คงเหลือ ÷ ใช้เฉลี่ย/เดือน × 30 · ค้างส่ง = สั่งแล้วยังไม่รับ (จากใบขอซื้อที่ยังเปิด)</div>' +
        (dbReady ? '' : '<div class="alert alert-error no-print">ยังไม่ได้สร้างตารางใบขอซื้อ — รัน supabase/add_purchase_requests.sql ใน Supabase ก่อน</div>');

      document.querySelectorAll('#pr_body tbody tr[data-id]').forEach((tr) => {
        const id = tr.dataset.id;
        tr.querySelector('.pr_on').addEventListener('change', (e) => {
          picked[id].on = e.target.checked;
          tr.classList.toggle('no-print', !e.target.checked);
        });
        tr.querySelector('.pr_qty').addEventListener('input', (e) => { picked[id].qty = e.target.value; });
      });
    }

    async function renderOpen() {
      const box = document.getElementById('pr_open');
      if (!dbReady) { box.innerHTML = ''; return; }
      const prs = await api.getPurchaseRequests('open');
      box.innerHTML = '<div class="section-title"><h3>📦 ใบขอซื้อที่ยังค้างรับ (' + prs.length + ')</h3></div>' +
        (prs.map((pr) =>
          '<div class="card" style="margin-bottom:12px"><div class="toolbar"><b>ใบขอซื้อ #' + pr.id + '</b> ' + esc(pr.req_date) +
          ' ' + esc(pr.note) + '<div class="spacer"></div>' +
          '<button class="btn btn-ghost pr_close" data-id="' + pr.id + '">ปิดใบ (รับครบ/ยกเลิก)</button></div>' +
          '<div class="table-wrap"><table><thead><tr><th>รายการ</th><th>สั่ง</th><th>รับแล้ว</th><th>ค้างส่ง</th></tr></thead><tbody>' +
          pr.purchase_request_lines.map((l) =>
            '<tr><td>' + esc(l.items ? l.items.name : '') + '</td><td>' + fmtNum(l.qty) + ' ' + esc(l.items ? l.items.unit : '') + '</td>' +
            '<td><input type="number" min="0" step="any" style="width:90px" class="pr_rcv" data-id="' + l.id + '" value="' + esc(l.received_qty) + '"> ' +
            '<button class="btn btn-ghost pr_rcv_save" data-id="' + l.id + '">บันทึก</button></td>' +
            '<td>' + fmtNum(Math.max(0, l.qty - l.received_qty)) + '</td></tr>').join('') +
          '</tbody></table></div></div>').join('') || '<div class="empty-state">ไม่มีใบขอซื้อค้างรับ</div>');
      box.querySelectorAll('.pr_rcv_save').forEach((b) => b.addEventListener('click', async () => {
        const v = Number(box.querySelector('.pr_rcv[data-id="' + b.dataset.id + '"]').value);
        if (!(v >= 0)) { toast('จำนวนที่รับไม่ถูกต้อง', 'error'); return; }
        try { await api.updatePurchaseLineReceived(b.dataset.id, v); toast('บันทึกการรับแล้ว'); await refreshAll(); }
        catch (err) { toast(err.message, 'error'); }
      }));
      box.querySelectorAll('.pr_close').forEach((b) => b.addEventListener('click', async () => {
        if (!confirm('ปิดใบขอซื้อนี้? ยอดค้างส่งของใบนี้จะไม่ถูกนับอีก')) return;
        try { await api.setPurchaseRequestStatus(b.dataset.id, 'closed'); toast('ปิดใบขอซื้อแล้ว'); await refreshAll(); }
        catch (err) { toast(err.message, 'error'); }
      }));
    }

    async function refreshAll() {
      await loadPending();
      render();
      await renderOpen();
    }

    await loadUsage();
    await refreshAll();

    document.getElementById('pr_save').addEventListener('click', async () => {
      if (!dbReady) { toast('ยังไม่ได้สร้างตารางใบขอซื้อในฐานข้อมูล', 'error'); return; }
      const lines = active
        .filter((it) => picked[it.id] && picked[it.id].on && Number(picked[it.id].qty) > 0)
        .map((it) => ({ item_id: it.id, qty: Number(picked[it.id].qty) }));
      if (!lines.length) { toast('เลือกรายการและกรอกจำนวนสั่งซื้อก่อน', 'error'); return; }
      try {
        const pr = await api.createPurchaseRequest(document.getElementById('pr_note').value.trim(), lines);
        lines.forEach((l) => { picked[l.item_id] = { on: false, qty: '' }; });
        toast('บันทึกใบขอซื้อ #' + pr.id + ' แล้ว');
        await refreshAll();
      } catch (err) { toast(err.message, 'error'); }
    });

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
