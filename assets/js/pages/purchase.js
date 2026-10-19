import { api } from '../api.js';
import { esc, fmtNum, todayISO, showErr, toast } from '../ui.js';

const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const MIN_ROWS = 14; // จำนวนบรรทัดในฟอร์มกระดาษ (ตามไฟล์ Excel)
const DEFAULT_COMPANY = 'บริษัท ร่วมมิตรคอนกรีต (บ่อตะกั่ว) จำกัด';

function isoMonthsAgo(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function thaiDateParts() {
  const d = new Date();
  return { day: d.getDate(), month: TH_MONTHS[d.getMonth()], year: d.getFullYear() + 543 };
}

function defaultDocNo() {
  const d = new Date();
  return String((d.getFullYear() + 543) % 100).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0') + '-';
}

export async function renderPurchase(content) {
  try {
    const [items, settings] = await Promise.all([api.getItems(), api.getSettings()]);
    const active = items.filter((it) => it.status !== 'inactive');
    const months = 3; // ใช้เฉลี่ย/เดือน คิดจากเบิกย้อนหลัง 3 เดือน
    let onlyLow = true;
    let search = '';
    let usage = {}; // item_id -> ปริมาณเบิกรวม 3 เดือน
    let pending = {}; // item_id -> ค้างส่ง
    let dbReady = true;
    const qtyOf = {}; // item_id -> จำนวนสั่งซื้อ (string จาก input)
    const company = (settings.CompanyName && settings.CompanyName !== 'บริษัทของฉัน จำกัด') ? settings.CompanyName : DEFAULT_COMPANY;

    content.innerHTML =
      '<div class="toolbar no-print">' +
      '<input type="search" id="pr_search" placeholder="🔍 ค้นหารายการ (ชื่อ / SKU)" style="flex:1;min-width:200px">' +
      '<label><input type="checkbox" id="pr_low" checked> เฉพาะต่ำกว่าจุดสั่งซื้อ</label>' +
      '<button class="btn btn-ghost" id="pr_fill">✨ เติมจำนวนที่แนะนำ</button>' +
      '<button class="btn btn-ghost" id="pr_clear">ล้าง</button></div>' +
      '<div id="pr_body" class="no-print"></div>' +
      '<div class="toolbar no-print" style="position:sticky;bottom:0;background:var(--bg,#fff);padding:10px 0;border-top:1px solid var(--border)">' +
      '<b id="pr_count">เลือก 0 รายการ</b><div class="spacer"></div>' +
      '<button class="btn btn-ghost" id="pr_opts_btn">⚙️ ข้อมูลหัวใบ</button>' +
      '<button class="btn btn-ghost" id="pr_print">🖨️ พิมพ์อย่างเดียว</button>' +
      '<button class="btn btn-primary" id="pr_save_print">💾 บันทึก + พิมพ์</button></div>' +
      '<div id="pr_opts" class="card no-print" style="display:none;margin-bottom:12px"><div class="form-grid">' +
      '<div class="form-field"><label>เลขที่ใบขอซื้อ</label><input id="pr_no" value="' + esc(defaultDocNo()) + '"></div>' +
      '<div class="form-field"><label>แผนก/ฝ่าย</label><input id="pr_dept" value="โรงงาน บ่อตะกั่ว"></div>' +
      '<div class="form-field"><label>ประเภท</label><select id="pr_type"><option>วัตถุดิบ</option><option>ทั่วไป</option>' +
      '<option>อะไหล่เครื่องจักร</option><option>วัสดุสิ้นเปลือง</option></select></div>' +
      '<div class="form-field"><label>ความเร่งด่วน</label><select id="pr_urg"><option value="3">ภายใน 7-10 วัน</option>' +
      '<option value="2">ภายใน 2-3 วัน</option><option value="1">ทันทีภายใน 1 วัน</option></select></div>' +
      '<div class="form-field"><label>หมายเหตุ</label><input id="pr_note" placeholder="ไม่บังคับ"></div>' +
      '</div></div>' +
      '<div id="pr_open" class="no-print"></div>' +
      '<div id="pr_sheet" class="pr-sheet"></div>';

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

    function suggested(it) {
      const q = Number(it.qty_on_hand);
      return Number(it.max_stock) > q ? Math.ceil(Number(it.max_stock) - q) : '';
    }

    function chosen() {
      return active.filter((it) => Number(qtyOf[it.id]) > 0)
        .map((it) => ({ it, qty: Number(qtyOf[it.id]) }));
    }

    function updateCount() {
      document.getElementById('pr_count').textContent = 'เลือก ' + chosen().length + ' รายการ';
    }

    function render() {
      const q = search.trim().toLowerCase();
      const list = active.filter((it) => {
        if (Number(qtyOf[it.id]) > 0) return true; // รายการที่เลือกไว้ต้องไม่หายไปจากหน้าจอ
        if (onlyLow && !q && Number(it.qty_on_hand) > Number(it.reorder_point)) return false;
        return !q || (it.name + ' ' + it.sku).toLowerCase().includes(q);
      });
      const body = list.map((it) => {
        const qty = Number(it.qty_on_hand);
        const avg = (usage[it.id] || 0) / months;
        const days = avg > 0 ? Math.round((qty / avg) * 30) : null;
        const owed = pending[it.id] || 0;
        const low = qty <= Number(it.reorder_point);
        const daysBadge = days === null ? '-' :
          '<span class="badge ' + (days <= 15 ? 'badge-danger' : days <= 30 ? 'badge-warn' : 'badge-success') + '">' + days + ' วัน</span>';
        return '<tr data-id="' + it.id + '"' + (Number(qtyOf[it.id]) > 0 ? ' style="background:#eef6ff"' : '') + '>' +
          '<td><b>' + esc(it.name) + '</b>' + (low ? ' <span class="badge badge-danger">ต่ำกว่าขั้นต่ำ</span>' : '') +
          '<div class="small muted">' + esc(it.sku) + '</div></td>' +
          '<td>' + fmtNum(qty) + ' ' + esc(it.unit) + '</td>' +
          '<td>' + fmtNum(it.reorder_point) + '</td>' +
          '<td>' + (Number(it.lead_time_days) ? it.lead_time_days + ' วัน' : '-') + '</td>' +
          '<td>' + (owed ? fmtNum(owed) : '-') + '</td>' +
          '<td>' + (avg > 0 ? fmtNum(avg) : '-') + '</td>' +
          '<td>' + daysBadge + '</td>' +
          '<td><input type="number" class="pr_qty" min="0" step="any" inputmode="decimal" style="width:100px" placeholder="จำนวน" value="' +
          esc(qtyOf[it.id] === undefined ? '' : qtyOf[it.id]) + '"> ' + esc(it.unit) + '</td></tr>';
      }).join('') || '<tr><td colspan="8" class="empty-state">ไม่พบรายการ — ลองเอาติ๊ก "เฉพาะต่ำกว่าจุดสั่งซื้อ" ออก หรือพิมพ์ค้นหา</td></tr>';

      document.getElementById('pr_body').innerHTML =
        '<div class="table-wrap"><table><thead><tr><th>รายการ</th><th>คงเหลือ</th><th>ขั้นต่ำ</th>' +
        '<th>สั่งล่วงหน้า</th><th>ค้างส่ง</th><th>ใช้เฉลี่ย/เดือน</th><th>คิดเป็นกี่วัน</th>' +
        '<th>จำนวนสั่งซื้อ</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
        '<div class="small muted">ใช้เฉลี่ย/เดือน = ยอดเบิกย้อนหลัง ' + months + ' เดือน ÷ ' + months +
        ' · คิดเป็นกี่วัน = คงเหลือ ÷ ใช้เฉลี่ย/เดือน × 30 · ค้างส่ง = สั่งแล้วยังไม่รับ</div>' +
        (dbReady ? '' : '<div class="alert alert-error">ยังไม่ได้สร้างตารางใบขอซื้อ — รัน supabase/add_purchase_requests.sql ใน Supabase ก่อน</div>');

      document.querySelectorAll('#pr_body tbody tr[data-id]').forEach((tr) => {
        tr.querySelector('.pr_qty').addEventListener('input', (e) => {
          qtyOf[tr.dataset.id] = e.target.value;
          tr.style.background = Number(e.target.value) > 0 ? '#eef6ff' : '';
          updateCount();
        });
      });
      updateCount();
    }

    function buildSheet() {
      const rows = chosen();
      const n = Math.max(MIN_ROWS, rows.length);
      // ความสูงบรรทัดคำนวณให้พอดี A4 แผ่นเดียว (พื้นที่ตารางประมาณ 150 มม.)
      const rowMm = Math.min(9.5, 150 / n);
      const fs = rowMm >= 8 ? 14 : rowMm >= 6 ? 12 : rowMm >= 4.5 ? 10 : 8.5;
      const d = thaiDateParts();
      const type = document.getElementById('pr_type').value;
      const urg = document.getElementById('pr_urg').value;
      const box = (on) => (on ? '☒' : '☐');
      const trs = [];
      for (let i = 0; i < n; i++) {
        const r = rows[i];
        trs.push('<tr style="height:' + rowMm.toFixed(2) + 'mm"><td class="c">' + (r ? i + 1 : '') + '</td>' +
          '<td>' + (r ? esc(r.it.name) : '') + '</td><td class="c">' + (r ? fmtNum(r.qty) : '') + '</td>' +
          '<td class="c">' + (r ? esc(r.it.unit) : '') + '</td>' +
          '<td class="c pr-stock">' + (r ? 'คงเหลือ ' + fmtNum(r.it.qty_on_hand) + ' ' + esc(r.it.unit) : '') + '</td></tr>');
      }
      const note = document.getElementById('pr_note').value.trim();
      const signs = [['ผู้ขอเสนอซื้อ', '(ระดับหัวหน้าแผนก)'], ['ผู้ทวนสอบ(อนุมัติขั้นต้น)', '(ผู้จัดการโรงงาน)'],
        ['ผู้ดำเนินการ', '(แผนกจัดซื้อโรงงาน)'], ['ผู้อนุมัติ', '(กรรมการผู้จัดการ)']];
      const chk = (on, label) => '<span class="pr-chk' + (on ? ' on' : '') + '"><i>' + (on ? '✓' : '') + '</i>' + label + '</span>';
      document.getElementById('pr_sheet').innerHTML =
        '<div class="pr-page" style="font-size:' + fs + 'px">' +
        '<div class="pr-head"><img src="assets/img/logo.png" alt="RMC">' +
        '<div class="pr-co"><b>' + esc(company) + '</b><span>แผนก/ฝ่าย : ' + esc(document.getElementById('pr_dept').value) + '</span></div>' +
        '<div class="pr-title"><b>ใบขอเสนอซื้อ</b><span>PURCHASE REQUEST</span></div></div>' +
        '<div class="pr-info">' +
        '<div><label>วันที่</label>' + d.day + ' ' + d.month + ' ' + d.year + '</div>' +
        '<div><label>เลขที่</label>' + esc(document.getElementById('pr_no').value) + '</div>' +
        '<div class="wide"><label>เรื่อง</label>ขออนุญาตเสนอซื้อ &nbsp;&nbsp; ' +
        chk(type === 'ทั่วไป', 'ทั่วไป') + chk(type === 'อะไหล่เครื่องจักร', 'อะไหล่เครื่องจักร') +
        chk(type === 'วัสดุสิ้นเปลือง', 'วัสดุสิ้นเปลือง') + chk(type === 'วัตถุดิบ', 'วัตถุดิบ') + '</div>' +
        '<div class="wide"><label>ความเร่งด่วน</label>' +
        chk(urg === '1', 'ทันทีภายใน 1 วัน') + chk(urg === '2', 'ภายใน 2-3 วัน') + chk(urg === '3', 'ภายใน 7-10 วัน') + '</div></div>' +
        '<table class="pr-tbl"><thead><tr><th style="width:9%">ลำดับ</th><th>รายการเสนอซื้อ</th>' +
        '<th style="width:14%">จำนวน</th><th style="width:11%">หน่วย</th><th style="width:27%">วัตถุประสงค์การใช้</th></tr></thead><tbody>' +
        trs.join('') + '</tbody></table>' +
        (note ? '<div class="pr-note"><b>หมายเหตุ :</b> ' + esc(note) + '</div>' : '') +
        '<div class="pr-end">จึงเรียนมาเพื่อพิจารณาขออนุมัติ</div>' +
        '<div class="pr-sign">' + signs.map((p) =>
          '<div><div class="sig"></div><b>' + p[0] + '</b><br><span>' + p[1] + '</span><br><span class="dt">วันที่ ......../......../........</span></div>').join('') +
        '</div></div>';
    }

    function printSheet() {
      if (!chosen().length) { toast('เลือกรายการและกรอกจำนวนก่อน', 'error'); return false; }
      buildSheet();
      window.print();
      return true;
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

    document.getElementById('pr_search').addEventListener('input', (e) => { search = e.target.value; render(); });
    document.getElementById('pr_low').addEventListener('change', (e) => { onlyLow = e.target.checked; render(); });
    document.getElementById('pr_fill').addEventListener('click', () => {
      active.forEach((it) => {
        if (Number(it.qty_on_hand) <= Number(it.reorder_point) && !Number(qtyOf[it.id])) {
          const s = suggested(it);
          if (s) qtyOf[it.id] = String(s);
        }
      });
      render();
    });
    document.getElementById('pr_clear').addEventListener('click', () => {
      Object.keys(qtyOf).forEach((k) => delete qtyOf[k]);
      render();
    });
    document.getElementById('pr_opts_btn').addEventListener('click', () => {
      const o = document.getElementById('pr_opts');
      o.style.display = o.style.display === 'none' ? '' : 'none';
    });
    document.getElementById('pr_print').addEventListener('click', printSheet);
    document.getElementById('pr_save_print').addEventListener('click', async () => {
      const lines = chosen().map((r) => ({ item_id: r.it.id, qty: r.qty }));
      if (!lines.length) { toast('เลือกรายการและกรอกจำนวนก่อน', 'error'); return; }
      if (dbReady) {
        try {
          const no = document.getElementById('pr_no').value.trim();
          const note = [no, document.getElementById('pr_note').value.trim()].filter(Boolean).join(' · ');
          const pr = await api.createPurchaseRequest(note, lines);
          toast('บันทึกใบขอซื้อ #' + pr.id + ' แล้ว');
        } catch (err) { toast(err.message, 'error'); return; }
      } else {
        toast('ยังไม่ได้สร้างตารางใบขอซื้อ — พิมพ์โดยไม่บันทึก', 'error');
      }
      printSheet();
      Object.keys(qtyOf).forEach((k) => delete qtyOf[k]);
      await refreshAll();
    });
  } catch (err) {
    showErr(content)(err);
  }
}
