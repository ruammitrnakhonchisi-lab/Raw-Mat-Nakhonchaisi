import { api } from '../api.js';
import { STATE as AUTH } from '../auth.js';
import { STATE } from '../app.js';
import { isPcWireCategory } from '../report-categories.js';
import { esc, fmtNum, field, val, todayISO, toast, showErr, showSuccessPopup } from '../ui.js';

let selectedItemId = null;

const key = (s) => String(s || '').trim().toLowerCase();

function dateLabel(d) {
  return d ? new Date(d + 'T00:00:00').toLocaleDateString('th-TH') : '-';
}

function daysSince(d) {
  if (!d) return '-';
  const days = Math.floor((Date.now() - new Date(d + 'T00:00:00').getTime()) / 86400000);
  return Math.max(days, 0);
}

export async function renderPcWire(content) {
  try {
    const allItems = await api.getItems();
    STATE.itemsCache = allItems;
    const items = allItems.filter((it) => isPcWireCategory(it.category));
    if (!items.length) {
      content.innerHTML = '<div class="card"><div class="empty-state">ยังไม่มีวัตถุดิบหมวด PC wire ในระบบ</div></div>';
      return;
    }

    const stock = await api.getPcWireStock(items.map((it) => it.id));
    const byItem = {};
    items.forEach((it) => { byItem[it.id] = []; });
    stock.forEach((r) => { if (byItem[r.item_id]) byItem[r.item_id].push(r); });
    if (!items.some((it) => it.id === selectedItemId)) selectedItemId = items[0].id;

    const isAdmin = AUTH.profile && AUTH.profile.role === 'admin';
    const usedCache = {};
    let view = 'stock';

    content.innerHTML =
      '<div class="card">' +
      '<div class="toolbar" id="pw_chips"></div>' +
      '<div id="pw_summary"></div>' +
      '<div class="toolbar">' +
      '<input type="text" id="pw_search" placeholder="ค้นหาเลข Coil..." style="flex:1;min-width:200px;">' +
      '<button type="button" class="btn btn-sm" id="pw_view_stock">ในสต๊อก</button>' +
      '<button type="button" class="btn btn-sm" id="pw_view_used">ใช้ไปแล้ว</button>' +
      (isAdmin ? '<button type="button" class="btn btn-ghost" id="pw_count_btn">🧮 นับสต๊อก / ปรับสต๊อก</button>' : '') +
      '</div>' +
      '<div id="pw_count_panel" style="display:none;"></div>' +
      '<div id="pw_list"></div>' +
      '</div>';

    const currentItem = () => items.find((it) => it.id === selectedItemId);
    const currentCoils = () => byItem[selectedItemId] || [];
    const searchText = () => key(document.getElementById('pw_search').value);

    function drawChips() {
      document.getElementById('pw_chips').innerHTML = items.map((it) =>
        '<button type="button" class="btn btn-sm ' + (it.id === selectedItemId ? 'btn-primary' : 'btn-ghost') + '" data-id="' + it.id + '">' +
        esc(it.name) + ' (' + fmtNum(byItem[it.id].length) + ' ขด)</button>'
      ).join('');
      document.querySelectorAll('#pw_chips [data-id]').forEach((btn) => {
        btn.addEventListener('click', () => {
          selectedItemId = Number(btn.dataset.id);
          closeCountPanel();
          drawAll();
        });
      });
    }

    function drawSummary() {
      const it = currentItem();
      const n = currentCoils().length;
      const mismatch = Number(it.qty_on_hand) !== n
        ? '<div class="alert alert-info">ยอดคงเหลือในทะเบียนวัตถุดิบ (' + fmtNum(it.qty_on_hand) + ' ' + esc(it.unit) +
          ') ไม่ตรงกับจำนวน Coil ที่อยู่ในสต๊อก (' + fmtNum(n) + ' ขด)' +
          (isAdmin ? ' — ใช้ปุ่ม "นับสต๊อก / ปรับสต๊อก" เพื่อปรับให้ตรง' : ' — แจ้งผู้ดูแลระบบเพื่อปรับสต๊อก') + '</div>'
        : '';
      document.getElementById('pw_summary').innerHTML =
        '<p style="margin:0 0 10px;"><b style="font-size:20px;">' + fmtNum(n) + '</b> ขด คงเหลือในสต๊อก</p>' + mismatch;
    }

    function drawViewButtons() {
      document.getElementById('pw_view_stock').className = 'btn btn-sm ' + (view === 'stock' ? 'btn-primary' : 'btn-ghost');
      document.getElementById('pw_view_used').className = 'btn btn-sm ' + (view === 'used' ? 'btn-primary' : 'btn-ghost');
    }

    function drawStockList() {
      const q = searchText();
      const rows = currentCoils().filter((c) => !q || key(c.lot_batch).includes(q));
      const target = document.getElementById('pw_list');
      if (!rows.length) {
        target.innerHTML = '<div class="empty-state">' + (q ? 'ไม่พบเลข Coil ที่ค้นหา' : 'ไม่มี Coil ในสต๊อก') + '</div>';
        return;
      }
      const body = rows.map((c, i) =>
        '<tr><td>' + (i + 1) + '</td><td><b>' + esc(c.lot_batch || '-') + '</b></td>' +
        '<td>' + esc(dateLabel(c.txn_date)) + '</td><td>' + esc(c.po_number || '-') + '</td>' +
        '<td>' + daysSince(c.txn_date) + ' วัน</td></tr>'
      ).join('');
      const cards = rows.map((c) =>
        '<div class="item-card"><div class="item-card-name">' + esc(c.lot_batch || '-') + '</div>' +
        '<div class="item-card-meta">รับเข้า ' + esc(dateLabel(c.txn_date)) + ' • อยู่ในสต๊อก ' + daysSince(c.txn_date) + ' วัน • ' +
        esc(c.po_number || '-') + '</div></div>'
      ).join('');
      target.innerHTML =
        '<div class="table-wrap desktop-only"><table><thead><tr><th>#</th><th>เลข Coil</th><th>วันที่รับเข้า</th>' +
        '<th>เลขที่เอกสาร/PO</th><th>อยู่ในสต๊อก</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
        '<div class="item-card-list">' + cards + '</div>';
    }

    async function drawUsedList() {
      const target = document.getElementById('pw_list');
      const itemId = selectedItemId;
      if (!usedCache[itemId]) {
        target.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
        try {
          usedCache[itemId] = await api.getUsedCoils(itemId, 300);
        } catch (err) {
          target.innerHTML = '<div class="alert alert-error">โหลดข้อมูลไม่สำเร็จ: ' + esc(err.message || String(err)) + '</div>';
          return;
        }
        if (itemId !== selectedItemId || view !== 'used') return;
      }
      const q = searchText();
      const rows = usedCache[itemId].filter((r) => !q || key(r.stock_in && r.stock_in.lot_batch).includes(q));
      if (!rows.length) {
        target.innerHTML = '<div class="empty-state">' + (q ? 'ไม่พบเลข Coil ที่ค้นหา' : 'ยังไม่มีประวัติเบิก Coil ผ่านระบบ') + '</div>';
        return;
      }
      const coilNo = (r) => (r.stock_in && r.stock_in.lot_batch) || '-';
      const body = rows.map((r) =>
        '<tr><td><b>' + esc(coilNo(r)) + '</b></td><td>' + esc(dateLabel(r.txn_date)) + '</td>' +
        '<td>' + esc(r.usage_type || '-') + '</td><td>' + esc((r.stock_in && r.stock_in.po_number) || '-') + '</td></tr>'
      ).join('');
      const cards = rows.map((r) =>
        '<div class="item-card"><div class="item-card-name">' + esc(coilNo(r)) + '</div>' +
        '<div class="item-card-meta">เบิก ' + esc(dateLabel(r.txn_date)) + ' • ใช้งาน ' + esc(r.usage_type || '-') + '</div></div>'
      ).join('');
      target.innerHTML =
        '<p class="muted small">แสดงเฉพาะ Coil ที่เบิกผ่านระบบนี้ (ล่าสุด 300 รายการ)</p>' +
        '<div class="table-wrap desktop-only"><table><thead><tr><th>เลข Coil</th><th>วันที่เบิก</th><th>ใช้งาน</th>' +
        '<th>เลขที่เอกสาร/PO (ตอนรับเข้า)</th></tr></thead><tbody>' + body + '</tbody></table></div>' +
        '<div class="item-card-list">' + cards + '</div>';
    }

    function drawList() {
      drawViewButtons();
      if (view === 'stock') drawStockList(); else drawUsedList();
    }

    function drawAll() {
      drawChips();
      drawSummary();
      drawList();
    }

    document.getElementById('pw_search').addEventListener('input', drawList);
    document.getElementById('pw_view_stock').addEventListener('click', () => { view = 'stock'; drawList(); });
    document.getElementById('pw_view_used').addEventListener('click', () => { view = 'used'; drawList(); });

    /* ---------- โหมดนับสต๊อก / ปรับสต๊อก (admin) ---------- */
    function closeCountPanel() {
      const panel = document.getElementById('pw_count_panel');
      panel.style.display = 'none';
      panel.innerHTML = '';
    }

    function openCountPanel() {
      const panel = document.getElementById('pw_count_panel');
      panel.style.display = 'block';
      panel.innerHTML =
        '<div class="card" style="background:#f7f9fc;margin-bottom:14px;">' +
        '<p class="muted small">พิมพ์หรือวางเลข Coil ที่นับได้จริงของ <b>' + esc(currentItem().name) + '</b> บรรทัดละ 1 เลข ' +
        'แล้วกด "เปรียบเทียบ" ระบบจะแสดงว่า Coil ไหนขาดหรือเกิน ให้ตรวจสอบก่อนกดยืนยันปรับ</p>' +
        '<div class="form-field"><label>เลข Coil ที่นับได้จริง (<b id="pw_count_n">0</b> ขด)</label>' +
        '<textarea id="pw_count_list" rows="8" placeholder="C6616CC304\nC6616CC305\nC6616CC306"></textarea></div>' +
        '<div class="form-grid" style="margin-top:10px;">' +
        field('วันที่ปรับ', 'pw_date', todayISO(), false, 'date') +
        field('สาเหตุ/หมายเหตุ', 'pw_reason', 'นับสต๊อกประจำงวด') +
        '</div>' +
        '<div class="form-actions"><button type="button" class="btn btn-ghost" id="pw_count_cancel">ปิด</button>' +
        '<button type="button" class="btn btn-primary" id="pw_count_compare">🔍 เปรียบเทียบ</button></div>' +
        '<div id="pw_count_result"></div>' +
        '</div>';

      const list = document.getElementById('pw_count_list');
      const parseCounted = () => {
        const seen = new Set();
        const out = [];
        list.value.split(/\r?\n/).map((s) => s.trim()).filter((s) => s).forEach((no) => {
          const k = key(no);
          if (!seen.has(k)) { seen.add(k); out.push({ no, key: k }); }
        });
        return out;
      };
      list.addEventListener('input', () => {
        document.getElementById('pw_count_n').textContent = fmtNum(parseCounted().length);
      });
      document.getElementById('pw_count_cancel').addEventListener('click', closeCountPanel);
      document.getElementById('pw_count_compare').addEventListener('click', async function () {
        const counted = parseCounted();
        if (!counted.length) { toast('กรุณาพิมพ์หรือวางเลข Coil ที่นับได้อย่างน้อย 1 เลข', 'error'); return; }
        const btn = this;
        btn.disabled = true;
        try {
          const it = currentItem();
          const coils = currentCoils();
          const stockKeys = new Set(coils.map((c) => key(c.lot_batch)));
          const countedKeys = new Set(counted.map((c) => c.key));
          const matched = counted.filter((c) => stockKeys.has(c.key));
          const missing = coils.filter((c) => !countedKeys.has(key(c.lot_batch)));
          const extra = counted.filter((c) => !stockKeys.has(c.key));
          const depleted = new Set((await api.getDepletedCoilNumbers(it.id)).map(key));
          const extraNew = extra.filter((c) => !depleted.has(c.key));
          const extraUsed = extra.filter((c) => depleted.has(c.key));
          drawCompareResult(it, matched, missing, extraNew, extraUsed);
        } catch (err) {
          toast(err.message || String(err), 'error');
        }
        btn.disabled = false;
      });
    }

    function checkList(cls, entries, checked) {
      return '<div style="display:flex;flex-wrap:wrap;gap:6px 14px;margin:6px 0 12px;">' +
        entries.map((e) =>
          '<label style="display:inline-flex;align-items:center;gap:5px;font-size:13px;">' +
          '<input type="checkbox" class="' + cls + '" value="' + e.value + '"' + (checked ? ' checked' : '') + '> ' + esc(e.label) + '</label>'
        ).join('') + '</div>';
    }

    function sectionHtml(title, hint, cls, entries, checked) {
      if (!entries.length) return '';
      return '<div style="margin-top:14px;"><b>' + title + ' (' + fmtNum(entries.length) + ')</b> ' +
        '<span class="muted small">' + hint + '</span> ' +
        '<button type="button" class="btn btn-ghost btn-sm" data-toggle="' + cls + '" data-state="1">ติ๊กทั้งหมด</button> ' +
        '<button type="button" class="btn btn-ghost btn-sm" data-toggle="' + cls + '" data-state="0">ล้างทั้งหมด</button>' +
        checkList(cls, entries, checked) + '</div>';
    }

    function drawCompareResult(it, matched, missing, extraNew, extraUsed) {
      const target = document.getElementById('pw_count_result');
      const missingEntries = missing.map((c) => ({ value: c.id, label: c.lot_batch || '(ไม่มีเลข)' }));
      const extraNewEntries = extraNew.map((c) => ({ value: c.no, label: c.no }));
      const extraUsedEntries = extraUsed.map((c) => ({ value: c.no, label: c.no }));
      // ใช้ index แทนค่าข้อความใน value กันอักขระพิเศษในเลข Coil
      const idxEntries = (arr) => arr.map((e, i) => ({ value: i, label: e.label }));

      target.innerHTML =
        '<hr style="margin:16px 0;border:none;border-top:1px solid var(--border);">' +
        '<p><span class="badge badge-success">ตรงกัน ' + fmtNum(matched.length) + '</span> ' +
        '<span class="badge badge-danger">ขาด ' + fmtNum(missing.length) + '</span> ' +
        '<span class="badge badge-warn">เกิน ' + fmtNum(extraNew.length + extraUsed.length) + '</span></p>' +
        sectionHtml('ขาด', 'มีในระบบแต่นับไม่เจอ — จะตัดออกจากสต๊อก (เอาติ๊กออกถ้ายังไม่ต้องการตัด)', 'pw_chk_missing', idxEntries(missingEntries), true) +
        sectionHtml('เกิน', 'นับเจอแต่ไม่มีในระบบ — จะเพิ่มเป็น Coil ใหม่ 1 ขด', 'pw_chk_extra', idxEntries(extraNewEntries), true) +
        sectionHtml('เกิน (ระบบบันทึกว่าเบิกไปแล้ว)', 'เลขนี้เคยถูกเบิกใช้หมดแล้ว อาจพิมพ์ผิดหรือเบิกผิด — ไม่ติ๊กไว้ให้ ติ๊กเองถ้าต้องการเพิ่มกลับเข้าสต๊อกจริงๆ', 'pw_chk_extra_used', idxEntries(extraUsedEntries), false) +
        (!missing.length && !extraNew.length && !extraUsed.length
          ? '<div class="alert alert-info">ตรงกับในระบบทั้งหมด ไม่ต้องปรับสต๊อก</div>'
          : '<div class="form-actions"><button type="button" class="btn btn-primary" id="pw_count_apply">✅ ยืนยันปรับสต๊อก</button></div>');

      target.querySelectorAll('[data-toggle]').forEach((b) => {
        b.addEventListener('click', () => {
          target.querySelectorAll('.' + b.dataset.toggle).forEach((chk) => { chk.checked = b.dataset.state === '1'; });
        });
      });

      const applyBtn = document.getElementById('pw_count_apply');
      if (!applyBtn) return;
      applyBtn.addEventListener('click', async function () {
        const pickIds = [];
        target.querySelectorAll('.pw_chk_missing:checked').forEach((chk) => pickIds.push(Number(missingEntries[Number(chk.value)].value)));
        const pickCoils = [];
        target.querySelectorAll('.pw_chk_extra:checked').forEach((chk) => pickCoils.push(extraNewEntries[Number(chk.value)].value));
        target.querySelectorAll('.pw_chk_extra_used:checked').forEach((chk) => pickCoils.push(extraUsedEntries[Number(chk.value)].value));
        if (!pickIds.length && !pickCoils.length) { toast('ยังไม่ได้เลือกรายการที่จะปรับ', 'error'); return; }
        const reason = val('pw_reason').trim();
        if (!reason) { toast('กรุณาระบุสาเหตุ/หมายเหตุ', 'error'); return; }
        if (!confirm('ยืนยันปรับสต๊อก ' + it.name + '\nตัดออก ' + pickIds.length + ' ขด / เพิ่มเข้า ' + pickCoils.length + ' ขด ?')) return;

        applyBtn.disabled = true;
        try {
          const res = await api.recordPcWireCountAdjustment({
            p_sku: it.sku,
            p_txn_date: val('pw_date') || todayISO(),
            p_missing_ids: pickIds,
            p_extra_coils: pickCoils,
            p_reason: reason,
          });
          toast('ปรับสต๊อกสำเร็จ', 'success');
          renderPcWire(content);
          showSuccessPopup('ปรับสต๊อกสำเร็จ', [
            it.name + ': ตัดออก ' + pickIds.length + ' ขด / เพิ่มเข้า ' + pickCoils.length + ' ขด',
            'คงเหลือใหม่: ' + fmtNum(res.new_qty) + ' ขด',
          ]);
        } catch (err) {
          toast(err.message || String(err), 'error');
          applyBtn.disabled = false;
        }
      });
    }

    const countBtn = document.getElementById('pw_count_btn');
    if (countBtn) {
      countBtn.addEventListener('click', () => {
        const panel = document.getElementById('pw_count_panel');
        if (panel.style.display === 'none') openCountPanel(); else closeCountPanel();
      });
    }

    drawAll();
  } catch (err) {
    showErr(content)(err);
  }
}
