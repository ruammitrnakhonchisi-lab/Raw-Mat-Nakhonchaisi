import { api } from '../api.js';
import { STATE as AUTH } from '../auth.js';
import { esc, fmtNum, showErr, toast, todayISO, openModal, closeModal, downloadCsv } from '../ui.js';

/* ---------- คำนวณยอดคงเหลือรายวันของไซโลหนึ่งใบ ----------
 * ยอดตั้งต้น = silo.opening_kg ณ opening_date; ทุกวันที่มีข้อมูล: คงเหลือ(คำนวณ) = ก่อนหน้า + รับ - ใช้
 * ถ้ามี "นับจริง" -> ขาดเกิน = นับจริง - คงเหลือ(คำนวณ) และ re-baseline ยอดยกไป = นับจริง
 * (ต่างจาก Excel ที่ยอดคลาดเคลื่อนสะสมจนสิ้นเดือนแล้วค่อยรีเซ็ต) */
function computeSilo(silo, rows) {
  let bal = Number(silo.opening_kg) || 0;
  const out = [];
  rows.filter((r) => r.silo_code === silo.code && r.txn_date >= silo.opening_date)
    .sort((a, b) => (a.txn_date < b.txn_date ? -1 : 1))
    .forEach((r) => {
      const opening = bal;
      const rec = Number(r.received_kg) || 0;
      const used = Number(r.used_kg) || 0;
      const calc = opening + rec - used;
      const counted = r.counted_kg === null || r.counted_kg === undefined ? null : Number(r.counted_kg);
      const variance = counted === null ? null : counted - calc;
      bal = counted === null ? calc : counted;
      out.push({ date: r.txn_date, opening, rec, used, calc, counted, variance, close: bal, note: r.note || '' });
    });
  return { silo, days: out, level: bal, lastDate: out.length ? out[out.length - 1].date : silo.opening_date };
}

function avgDailyUse(days, n) {
  const used = days.filter((d) => d.used > 0).slice(-n);
  return used.length ? used.reduce((s, d) => s + d.used, 0) / used.length : 0;
}

/* ---------- ไซโล 3D (SVG: ทรงกระบอก + หลังคาโดม + กรวยล่าง + ขา) ---------- */
function siloSvg(code, pct, tone) {
  const p = Math.max(0, Math.min(1, pct));
  const x = 40, w = 120, rx = w / 2, ry = 14;
  const top = 50, bodyH = 190, bot = top + bodyH;     // ตัวถัง
  const level = bot - bodyH * p;                       // ผิวปูน
  const fill = tone === 'danger' ? ['#f0a39d', '#d93025', '#a8231a'] : tone === 'warn' ? ['#f6d98a', '#e8a91a', '#b8820f'] : ['#9fd0f7', '#1a73e8', '#0f5bc0'];
  const id = 'sg' + code;
  return '<svg viewBox="0 0 200 330" class="silo3d" role="img" aria-label="ไซโล ' + esc(code) + ' ' + Math.round(p * 100) + '%">' +
    '<defs>' +
    '<linearGradient id="' + id + 'b" x1="0" x2="1"><stop offset="0" stop-color="#9aa3b5"/><stop offset=".35" stop-color="#eef1f6"/><stop offset=".7" stop-color="#c3c9d6"/><stop offset="1" stop-color="#7d8699"/></linearGradient>' +
    '<linearGradient id="' + id + 'f" x1="0" x2="1"><stop offset="0" stop-color="' + fill[2] + '"/><stop offset=".4" stop-color="' + fill[0] + '"/><stop offset=".75" stop-color="' + fill[1] + '"/><stop offset="1" stop-color="' + fill[2] + '"/></linearGradient>' +
    '<linearGradient id="' + id + 'c" x1="0" x2="1"><stop offset="0" stop-color="#6e7789"/><stop offset=".4" stop-color="#b7beca"/><stop offset="1" stop-color="#5d6577"/></linearGradient>' +
    '<clipPath id="' + id + 'k"><path d="M' + x + ' ' + top + 'V' + bot + 'A' + rx + ' ' + ry + ' 0 0 0 ' + (x + w) + ' ' + bot + 'V' + top + 'Z"/></clipPath>' +
    '</defs>' +
    // เงาพื้น
    '<ellipse cx="100" cy="318" rx="70" ry="9" fill="rgba(0,0,0,.15)"/>' +
    // ขา
    '<rect x="52" y="262" width="7" height="52" fill="#5d6577"/><rect x="141" y="262" width="7" height="52" fill="#5d6577"/><rect x="94" y="268" width="12" height="46" fill="#6e7789"/>' +
    // กรวยล่าง
    '<path d="M' + x + ' ' + bot + 'A' + rx + ' ' + ry + ' 0 0 0 ' + (x + w) + ' ' + bot + 'L112 276L88 276Z" fill="url(#' + id + 'c)"/>' +
    '<rect x="86" y="274" width="28" height="8" rx="2" fill="#444c5c"/>' +
    // ตัวถัง
    '<path d="M' + x + ' ' + top + 'V' + bot + 'A' + rx + ' ' + ry + ' 0 0 0 ' + (x + w) + ' ' + bot + 'V' + top + 'Z" fill="url(#' + id + 'b)"/>' +
    // ปูนข้างใน (มองทะลุตามระดับ)
    '<g clip-path="url(#' + id + 'k)" opacity=".92"><rect x="' + x + '" y="' + level + '" width="' + w + '" height="' + (bot + ry - level) + '" fill="url(#' + id + 'f)"/>' +
    (p > 0 ? '<ellipse cx="100" cy="' + level + '" rx="' + rx + '" ry="' + ry + '" fill="' + fill[0] + '"/>' : '') + '</g>' +
    // เส้นสเกล 25/50/75
    [0.25, 0.5, 0.75].map((t) => {
      const y = bot - bodyH * t;
      return '<line x1="' + (x + w - 12) + '" x2="' + (x + w) + '" y1="' + y + '" y2="' + y + '" stroke="#3a4152" stroke-width="1.5"/>' +
        '<text x="' + (x + w + 4) + '" y="' + (y + 4) + '" font-size="10" fill="#6b7385">' + Math.round(t * 100) + '</text>';
    }).join('') +
    // หลังคา
    '<ellipse cx="100" cy="' + top + '" rx="' + rx + '" ry="' + ry + '" fill="#dfe3ec" stroke="#aab1c0"/>' +
    '<path d="M' + x + ' ' + top + 'A' + rx + ' 30 0 0 1 ' + (x + w) + ' ' + top + 'A' + rx + ' ' + ry + ' 0 0 0 ' + x + ' ' + top + 'Z" fill="url(#' + id + 'b)" stroke="#aab1c0"/>' +
    '<rect x="94" y="14" width="12" height="14" fill="#5d6577"/><ellipse cx="100" cy="14" rx="6" ry="2.5" fill="#8a93a5"/>' +
    '<text x="100" y="' + (top + 100) + '" text-anchor="middle" font-size="26" font-weight="800" fill="#1f2430" style="paint-order:stroke;stroke:#fff;stroke-width:3px">' + esc(code) + '</text>' +
    '</svg>';
}

function toneOf(silo, level) {
  if (level <= Number(silo.low_kg)) return 'danger';
  if (level >= Number(silo.high_kg)) return 'warn';
  return 'ok';
}

function siloCard(c) {
  const cap = Number(c.silo.capacity_kg) || 1;
  const pct = c.level / cap;
  const tone = toneOf(c.silo, c.level);
  const avg = avgDailyUse(c.days, 14);
  const daysLeft = avg > 0 ? c.level / avg : null;
  const last = c.days.filter((d) => d.variance !== null).slice(-1)[0];
  const badge = tone === 'danger' ? '<span class="badge badge-danger">ต่ำกว่าจุดเตือน</span>'
    : tone === 'warn' ? '<span class="badge badge-warn">ใกล้เต็ม</span>' : '<span class="badge badge-success">ปกติ</span>';
  return '<div class="card silo-card">' + siloSvg(c.silo.code, pct, tone) +
    '<div class="silo-info"><div class="silo-title">' + esc(c.silo.name || c.silo.code) + ' ' + badge + '</div>' +
    '<div class="silo-qty">' + fmtNum(c.level) + ' <small>กก.</small></div>' +
    '<div class="muted small">' + Math.round(pct * 100) + '% ของความจุ ' + fmtNum(cap) + ' กก. (≈ ' + fmtNum(c.level / 1000) + ' ตัน)</div>' +
    '<div class="silo-stats">' +
    '<div><span class="lbl">ใช้เฉลี่ย/วัน (14 วัน)</span><span class="val">' + fmtNum(avg) + '</span></div>' +
    '<div><span class="lbl">พอใช้อีก</span><span class="val">' + (daysLeft === null ? '-' : fmtNum(daysLeft) + ' วัน') + '</span></div>' +
    '<div><span class="lbl">จุดเตือนต่ำ</span><span class="val">' + fmtNum(c.silo.low_kg) + '</span></div>' +
    '<div><span class="lbl">นับจริงล่าสุด</span><span class="val">' + (last ? esc(last.date) + '<br>' + varianceHtml(last.variance) : '-') + '</span></div>' +
    '</div></div></div>';
}

function varianceHtml(v) {
  if (v === null || v === undefined) return '<span class="muted">-</span>';
  const pct = v === 0 ? 0 : v;
  const cls = Math.abs(pct) >= 3000 ? 'text-danger' : Math.abs(pct) >= 1000 ? 'text-warn' : '';
  return '<span class="' + cls + '">' + (v > 0 ? '+' : '') + fmtNum(v) + '</span>';
}

/* ---------- กราฟคงเหลือย้อนหลัง (SVG เส้น) ---------- */
function trendSvg(calcs) {
  const N = 45;
  const series = calcs.map((c) => c.days.slice(-N));
  const W = 640, H = 160, padL = 44, padB = 20, padT = 8;
  const maxV = Math.max(1, ...calcs.map((c) => Number(c.silo.capacity_kg)));
  const colors = ['#1a73e8', '#e8750a'];
  const len = Math.max(...series.map((s) => s.length), 1);
  const X = (i) => padL + (len <= 1 ? 0 : (i / (len - 1)) * (W - padL - 10));
  const Y = (v) => padT + (1 - v / maxV) * (H - padT - padB);
  let g = [0, 0.5, 1].map((t) => '<line x1="' + padL + '" x2="' + (W - 10) + '" y1="' + Y(maxV * t) + '" y2="' + Y(maxV * t) + '" stroke="#e3e7ee"/>' +
    '<text x="' + (padL - 4) + '" y="' + (Y(maxV * t) + 3) + '" text-anchor="end" font-size="10" fill="#6b7385">' + fmtNum(maxV * t / 1000) + 't</text>').join('');
  calcs.forEach((c, k) => {
    const s = series[k];
    if (!s.length) return;
    g += '<polyline fill="none" stroke="' + colors[k % 2] + '" stroke-width="2" points="' + s.map((d, i) => X(i + (len - s.length)).toFixed(1) + ',' + Y(d.close).toFixed(1)).join(' ') + '"/>';
    g += '<line x1="' + padL + '" x2="' + (W - 10) + '" y1="' + Y(c.silo.low_kg) + '" y2="' + Y(c.silo.low_kg) + '" stroke="' + colors[k % 2] + '" stroke-dasharray="4 4" opacity=".4"/>';
  });
  const first = series.find((s) => s.length);
  if (first) g += '<text x="' + padL + '" y="' + (H - 4) + '" font-size="10" fill="#6b7385">' + esc(first[0].date) + '</text>' +
    '<text x="' + (W - 10) + '" y="' + (H - 4) + '" text-anchor="end" font-size="10" fill="#6b7385">' + esc(first[first.length - 1].date) + '</text>';
  const legend = calcs.map((c, k) => '<span><i style="background:' + colors[k % 2] + '"></i>' + esc(c.silo.code) + '</span>').join('');
  return '<div class="legend">' + legend + '<span class="muted">เส้นประ = จุดเตือนต่ำ</span></div><svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto">' + g + '</svg>';
}

/* ---------- หน้า ---------- */
export async function renderCement(content) {
  try {
    const [silos, daily] = await Promise.all([api.getCementSilos(), api.getCementDaily()]);
    if (!silos.length) {
      content.innerHTML = '<div class="alert alert-error">ยังไม่มีข้อมูลไซโล — รัน supabase/add_cement_silos.sql ก่อน</div>';
      return;
    }
    const isAdmin = AUTH.profile.role === 'admin';
    const calcs = silos.map((s) => computeSilo(s, daily));
    const months = Array.from(new Set(daily.map((r) => r.txn_date.slice(0, 7)))).sort().reverse();
    let month = months[0] || todayISO().slice(0, 7);

    content.innerHTML =
      '<div class="silo-grid">' + calcs.map(siloCard).join('') + '</div>' +
      '<div class="card" style="margin-top:16px"><div class="section-title"><h3>📈 ระดับปูนย้อนหลัง 45 วัน</h3></div>' + trendSvg(calcs) + '</div>' +
      '<div class="card" style="margin-top:16px"><div class="section-title"><h3>✍️ บันทึกประจำวัน</h3></div><div id="cmForm"></div></div>' +
      '<div class="section-title" style="margin-top:20px"><h3>📅 ตารางประจำเดือน</h3>' +
      '<div class="toolbar"><select id="cmMonth">' + (months.length ? months : [month]).map((m) => '<option value="' + m + '">' + m + '</option>').join('') + '</select>' +
      '<button class="btn btn-ghost" id="cmCsv">⬇️ CSV</button>' +
      (isAdmin ? '<button class="btn btn-ghost" id="cmSettings">⚙️ ตั้งค่าไซโล</button>' : '') + '</div></div>' +
      '<div id="cmTable"></div>';

    renderForm(calcs, daily);
    const draw = () => { document.getElementById('cmTable').innerHTML = monthTable(calcs, month); };
    draw();
    document.getElementById('cmMonth').addEventListener('change', (e) => { month = e.target.value; draw(); });
    document.getElementById('cmCsv').addEventListener('click', () => downloadCsv(monthCsv(calcs, month), 'cement-' + month + '.csv'));
    if (isAdmin) document.getElementById('cmSettings').addEventListener('click', () => settingsModal(silos, () => renderCement(content)));
  } catch (err) {
    showErr(content)(err);
  }
}

function renderForm(calcs, daily) {
  const el = document.getElementById('cmForm');
  const byKey = {};
  daily.forEach((r) => { byKey[r.txn_date + '|' + r.silo_code] = r; });
  const rowHtml = (c) => {
    const k = c.silo.code;
    return '<div class="cm-row"><div class="cm-code">' + esc(k) + '</div>' +
      '<div class="form-field"><label>รับเข้า (กก.)</label><input type="number" min="0" step="1" id="cm_rec_' + k + '"></div>' +
      '<div class="form-field"><label>ใช้ไป (กก.)</label><input type="number" min="0" step="1" id="cm_use_' + k + '"></div>' +
      '<div class="form-field"><label>นับจริง (กก.) <span class="muted">ถ้ามี</span></label><input type="number" min="0" step="1" id="cm_cnt_' + k + '"></div>' +
      '<div class="form-field"><label>หมายเหตุ</label><input type="text" id="cm_note_' + k + '"></div></div>';
  };
  el.innerHTML = '<div class="form-field" style="max-width:220px"><label>วันที่</label><input type="date" id="cm_date" max="' + todayISO() + '" value="' + todayISO() + '"></div>' +
    calcs.map(rowHtml).join('') +
    '<div class="muted small" style="margin:6px 0 10px">วันที่มีข้อมูลอยู่แล้วจะถูกโหลดมาให้แก้ไข • ถ้ากรอก "นับจริง" ระบบจะคำนวณส่วนต่าง และใช้ยอดนับเป็นยอดยกไปวันถัดไป</div>' +
    '<button class="btn btn-primary" id="cmSave">บันทึก</button>';
  const load = () => {
    const d = document.getElementById('cm_date').value;
    calcs.forEach((c) => {
      const r = byKey[d + '|' + c.silo.code] || {};
      const set = (id, v) => { document.getElementById(id + c.silo.code).value = v === null || v === undefined || v === 0 ? '' : v; };
      set('cm_rec_', r.received_kg); set('cm_use_', r.used_kg); set('cm_cnt_', r.counted_kg);
      document.getElementById('cm_note_' + c.silo.code).value = r.note || '';
    });
  };
  load();
  document.getElementById('cm_date').addEventListener('change', load);
  document.getElementById('cmSave').addEventListener('click', async () => {
    const d = document.getElementById('cm_date').value;
    if (!d) { toast('เลือกวันที่ก่อน', 'error'); return; }
    const btn = document.getElementById('cmSave');
    btn.disabled = true;
    try {
      let n = 0;
      for (const c of calcs) {
        const k = c.silo.code;
        const g = (id) => document.getElementById(id + k).value;
        const rec = Number(g('cm_rec_')) || 0, use = Number(g('cm_use_')) || 0;
        const cnt = g('cm_cnt_') === '' ? null : Number(g('cm_cnt_'));
        const had = byKey[d + '|' + k];
        if (!rec && !use && cnt === null && !g('cm_note_') && !had) continue;
        if (rec < 0 || use < 0 || (cnt !== null && cnt < 0)) throw new Error('ห้ามกรอกค่าติดลบ');
        await api.saveCementDay({ p_txn_date: d, p_silo_code: k, p_received_kg: rec, p_used_kg: use, p_counted_kg: cnt, p_note: g('cm_note_') });
        n++;
      }
      if (!n) { toast('ไม่มีข้อมูลให้บันทึก', 'error'); btn.disabled = false; return; }
      toast('บันทึกแล้ว', 'success');
      renderCement(document.getElementById('content'));
    } catch (err) {
      toast(err.message || String(err), 'error');
      btn.disabled = false;
    }
  });
}

function monthRows(calcs, month) {
  const dates = new Set();
  calcs.forEach((c) => c.days.forEach((d) => { if (d.date.slice(0, 7) === month) dates.add(d.date); }));
  return Array.from(dates).sort().map((date) => ({
    date, by: calcs.map((c) => c.days.find((d) => d.date === date) || null),
  }));
}

function monthTable(calcs, month) {
  const rows = monthRows(calcs, month);
  if (!rows.length) return '<div class="empty-state">ไม่มีข้อมูลเดือนนี้</div>';
  const head = '<tr><th rowspan="2">วันที่</th>' + calcs.map((c) => '<th colspan="5" style="text-align:center">' + esc(c.silo.code) + '</th>').join('') + '</tr><tr>' +
    calcs.map(() => '<th>รับ</th><th>ใช้</th><th>คงเหลือ</th><th>นับจริง</th><th>ขาด/เกิน</th>').join('') + '</tr>';
  const sum = calcs.map(() => ({ rec: 0, used: 0, var: 0 }));
  const body = rows.map((r) => '<tr><td>' + esc(r.date) + '</td>' + r.by.map((d, i) => {
    if (!d) return '<td colspan="5" class="muted">-</td>';
    sum[i].rec += d.rec; sum[i].used += d.used; sum[i].var += d.variance || 0;
    return '<td>' + (d.rec ? fmtNum(d.rec) : '') + '</td><td>' + (d.used ? fmtNum(d.used) : '') + '</td><td><b>' + fmtNum(d.close) + '</b></td>' +
      '<td>' + (d.counted === null ? '' : fmtNum(d.counted)) + '</td><td>' + varianceHtml(d.variance) + '</td>';
  }).join('') + '</tr>').join('');
  const foot = '<tr><th>รวม</th>' + sum.map((s) => '<th>' + fmtNum(s.rec) + '</th><th>' + fmtNum(s.used) + '</th><th></th><th></th><th>' + (s.var > 0 ? '+' : '') + fmtNum(s.var) + '</th>').join('') + '</tr>';
  return '<div class="table-wrap"><table class="cm-table"><thead>' + head + '</thead><tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table></div>';
}

function monthCsv(calcs, month) {
  return monthRows(calcs, month).map((r) => {
    const o = { วันที่: r.date };
    calcs.forEach((c, i) => {
      const d = r.by[i], k = c.silo.code;
      o[k + ' รับ'] = d ? d.rec : ''; o[k + ' ใช้'] = d ? d.used : ''; o[k + ' คงเหลือ'] = d ? d.close : '';
      o[k + ' นับจริง'] = d && d.counted !== null ? d.counted : ''; o[k + ' ขาดเกิน'] = d && d.variance !== null ? d.variance : '';
    });
    return o;
  });
}

function settingsModal(silos, done) {
  const f = (s, key, label, type) => '<div class="form-field"><label>' + label + '</label><input type="' + (type || 'number') + '" id="cs_' + key + '_' + s.code + '" value="' + esc(s[key]) + '"></div>';
  const body = silos.map((s) => '<h4>' + esc(s.code) + '</h4>' + f(s, 'name', 'ชื่อ', 'text') + f(s, 'capacity_kg', 'ความจุ (กก.)') + f(s, 'low_kg', 'จุดเตือนต่ำ (กก.)') +
    f(s, 'high_kg', 'จุดเตือนใกล้เต็ม (กก.)') + f(s, 'opening_date', 'วันที่ยอดตั้งต้น', 'date') + f(s, 'opening_kg', 'ยอดตั้งต้น (กก.)')).join('') +
    '<p class="muted small">ความจุ/จุดเตือนเป็นค่าประมาณตั้งต้น ปรับให้ตรงกับไซโลจริง • เปลี่ยนยอดตั้งต้นจะคำนวณยอดทุกวันใหม่</p><button class="btn btn-primary" id="csSave">บันทึก</button>';
  openModal('ตั้งค่าไซโล', body, () => {
    document.getElementById('csSave').addEventListener('click', async () => {
      try {
        for (const s of silos) {
          const g = (k) => document.getElementById('cs_' + k + '_' + s.code).value;
          const cap = Number(g('capacity_kg'));
          if (!(cap > 0)) throw new Error('ความจุต้องมากกว่า 0');
          await api.updateCementSilo(s.code, { name: g('name'), capacity_kg: cap, low_kg: Number(g('low_kg')), high_kg: Number(g('high_kg')), opening_date: g('opening_date'), opening_kg: Number(g('opening_kg')) });
        }
        closeModal(); toast('บันทึกแล้ว', 'success'); done();
      } catch (err) { toast(err.message || String(err), 'error'); }
    });
  });
}
