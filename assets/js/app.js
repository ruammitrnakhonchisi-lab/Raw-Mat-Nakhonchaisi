import { STATE as AUTH, login, logout, restoreSession } from './auth.js';
import { toast } from './ui.js';

import { renderDashboard } from './pages/dashboard.js';
import { renderItems } from './pages/items.js';
import { renderStockIn } from './pages/stockin.js';
import { renderStockOut } from './pages/stockout.js';
import { renderAdjust } from './pages/adjust.js';
import { renderLedger } from './pages/ledger.js';
import { renderAlerts } from './pages/alerts.js';
import { renderReports } from './pages/reports.js';
import { renderUsers } from './pages/users.js';
import { renderSettings } from './pages/settings.js';

export const STATE = {
  page: 'dashboard',
  itemsCache: null,
  categoriesCache: null,
};

const PAGE_TITLES = {
  dashboard: 'แดชบอร์ด', items: 'ข้อมูลวัตถุดิบ', stockin: 'รับเข้าวัตถุดิบ',
  stockout: 'เบิกวัตถุดิบ', adjust: 'ปรับสต๊อค', ledger: 'ประวัติการเคลื่อนไหว',
  alerts: 'แจ้งเตือน', reports: 'รายงาน', users: 'จัดการผู้ใช้งาน', settings: 'ตั้งค่าระบบ'
};

const RENDERERS = {
  dashboard: renderDashboard, items: renderItems, stockin: renderStockIn,
  stockout: renderStockOut, adjust: renderAdjust, ledger: renderLedger,
  alerts: renderAlerts, reports: renderReports, users: renderUsers, settings: renderSettings
};

export function navigate(page) {
  STATE.page = page;
  document.querySelectorAll('.nav-item').forEach(function (a) {
    a.classList.toggle('active', a.dataset.page === page);
  });
  document.getElementById('pageTitle').textContent = PAGE_TITLES[page] || '';
  const content = document.getElementById('content');
  content.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  (RENDERERS[page] || renderDashboard)(content);
}
window.navigate = navigate; // ใช้จาก onclick="" inline ในหน้าต่างๆ

function tickClock() {
  const el = document.getElementById('clock');
  if (el) el.textContent = new Date().toLocaleString('th-TH', { dateStyle: 'full', timeStyle: 'short' });
}

function showLogin() {
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appShell').style.display = 'none';
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appShell').style.display = 'flex';
  const name = AUTH.profile.display_name || AUTH.profile.email;
  document.getElementById('userName').textContent = name;
  document.getElementById('userRole').textContent = AUTH.profile.role === 'admin' ? 'ผู้ดูแลระบบ' : 'พนักงาน';
  document.getElementById('userAvatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('navUsers').style.display = AUTH.profile.role === 'admin' ? '' : 'none';
  navigate('dashboard');
}
window.showApp = showApp;

async function onLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'กำลังเข้าสู่ระบบ...';

  const res = await login(email, password);

  btn.disabled = false;
  btn.textContent = 'เข้าสู่ระบบ';
  if (!res.ok) {
    errEl.textContent = res.message;
    errEl.style.display = 'block';
    return;
  }
  showApp();
}

async function onLogout() {
  await logout();
  showLogin();
}
window.onLogout = onLogout;

window.addEventListener('DOMContentLoaded', async function () {
  document.getElementById('loginForm').addEventListener('submit', onLogin);
  document.getElementById('logoutBtn').addEventListener('click', onLogout);
  document.getElementById('hamburgerBtn').addEventListener('click', function () {
    document.getElementById('sidebar').classList.add('open');
  });
  document.getElementById('sidebarClose').addEventListener('click', function () {
    document.getElementById('sidebar').classList.remove('open');
  });
  document.querySelectorAll('.nav-item').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      navigate(a.dataset.page);
      document.getElementById('sidebar').classList.remove('open');
    });
  });
  tickClock();
  setInterval(tickClock, 1000 * 30);

  try {
    const ok = await restoreSession();
    if (ok) showApp(); else showLogin();
  } catch (err) {
    console.error(err);
    showLogin();
  }
});
