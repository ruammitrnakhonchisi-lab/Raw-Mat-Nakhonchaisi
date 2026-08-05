/**
 * ==========================================================
 *  ระบบยืนยันตัวตน (Login / Session)
 *  Session tokens are kept in CacheService (6 ชม.) so the web app
 *  works even though it's deployed to execute as the deploying user.
 * ==========================================================
 */

function hashPassword_(plain) {
  var raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, plain, Utilities.Charset.UTF_8);
  return raw.map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
}

/**
 * Client calls this to log in.
 * Returns { ok, token, name, role, username } or { ok:false, message }
 */
function login(username, password) {
  username = String(username || '').trim();
  var users = sheetToObjects_(SHEET_USERS);
  var user = users.filter(function (u) { return u.Username === username; })[0];

  if (!user) return { ok: false, message: 'ไม่พบชื่อผู้ใช้นี้' };
  if (String(user['สถานะ']).toLowerCase() !== 'active') return { ok: false, message: 'บัญชีนี้ถูกระงับการใช้งาน' };
  if (user.PasswordHash !== hashPassword_(password)) return { ok: false, message: 'รหัสผ่านไม่ถูกต้อง' };

  var token = Utilities.getUuid();
  var cache = CacheService.getScriptCache();
  cache.put('session_' + token, JSON.stringify({
    username: user.Username,
    name: user['ชื่อ-สกุล'],
    role: user.Role
  }), 21600); // 6 hours

  return {
    ok: true,
    token: token,
    username: user.Username,
    name: user['ชื่อ-สกุล'],
    role: user.Role
  };
}

function logout(token) {
  CacheService.getScriptCache().remove('session_' + token);
  return { ok: true };
}

/**
 * Validate a session token. Throws if invalid — call at the top of every
 * privileged server function via requireSession_(token).
 */
function requireSession_(token) {
  if (!token) throw new Error('AUTH: กรุณาเข้าสู่ระบบ');
  var raw = CacheService.getScriptCache().get('session_' + token);
  if (!raw) throw new Error('AUTH: เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่');
  return JSON.parse(raw);
}

function requireAdmin_(token) {
  var session = requireSession_(token);
  if (session.role !== 'admin') throw new Error('AUTH: ต้องเป็นผู้ดูแลระบบเท่านั้น');
  return session;
}

/** Client calls to verify an existing token still works (e.g. on page reload) */
function whoAmI(token) {
  try {
    var s = requireSession_(token);
    return { ok: true, session: s };
  } catch (e) {
    return { ok: false };
  }
}

function changeMyPassword(token, oldPassword, newPassword) {
  var session = requireSession_(token);
  var sh = sheet_(SHEET_USERS);
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var userCol = headers.indexOf('Username');
  var passCol = headers.indexOf('PasswordHash');
  for (var i = 1; i < data.length; i++) {
    if (data[i][userCol] === session.username) {
      if (data[i][passCol] !== hashPassword_(oldPassword)) {
        return { ok: false, message: 'รหัสผ่านเดิมไม่ถูกต้อง' };
      }
      sh.getRange(i + 1, passCol + 1).setValue(hashPassword_(newPassword));
      return { ok: true };
    }
  }
  return { ok: false, message: 'ไม่พบผู้ใช้งาน' };
}
