/**
 * ==========================================================
 *  จัดการผู้ใช้งาน (Admin only)
 * ==========================================================
 */

function getUsers(token) {
  requireAdmin_(token);
  return sheetToObjects_(SHEET_USERS).map(function (u) {
    return {
      Username: u.Username,
      ชื่อสกุล: u['ชื่อ-สกุล'],
      Role: u.Role,
      สถานะ: u['สถานะ'],
      สร้างเมื่อ: u['สร้างเมื่อ']
    };
  });
}

function addUser(token, user) {
  requireAdmin_(token);
  if (!user.Username || !user.Password) return { ok: false, message: 'กรุณาระบุ Username และ Password' };

  var existing = sheetToObjects_(SHEET_USERS);
  if (existing.some(function (u) { return u.Username === user.Username; })) {
    return { ok: false, message: 'มี Username นี้อยู่แล้ว' };
  }

  sheet_(SHEET_USERS).appendRow([
    user.Username, hashPassword_(user.Password), user['ชื่อสกุล'] || '',
    user.Role === 'admin' ? 'admin' : 'staff', 'active', nowStr_()
  ]);
  return { ok: true };
}

function updateUser(token, user) {
  requireAdmin_(token);
  var sh = sheet_(SHEET_USERS);
  var data = sh.getDataRange().getValues();
  var headers = data[0];
  var userCol = headers.indexOf('Username');

  for (var i = 1; i < data.length; i++) {
    if (data[i][userCol] === user.Username) {
      var row = i + 1;
      var nameCol = headers.indexOf('ชื่อ-สกุล');
      var roleCol = headers.indexOf('Role');
      var statusCol = headers.indexOf('สถานะ');
      if (user['ชื่อสกุล'] !== undefined) sh.getRange(row, nameCol + 1).setValue(user['ชื่อสกุล']);
      if (user.Role !== undefined) sh.getRange(row, roleCol + 1).setValue(user.Role);
      if (user['สถานะ'] !== undefined) sh.getRange(row, statusCol + 1).setValue(user['สถานะ']);
      if (user.Password) {
        var passCol = headers.indexOf('PasswordHash');
        sh.getRange(row, passCol + 1).setValue(hashPassword_(user.Password));
      }
      return { ok: true };
    }
  }
  return { ok: false, message: 'ไม่พบผู้ใช้งาน' };
}

function deleteUser(token, username) {
  var session = requireAdmin_(token);
  if (username === session.username) return { ok: false, message: 'ไม่สามารถลบบัญชีตัวเองได้' };
  var sh = sheet_(SHEET_USERS);
  var data = sh.getDataRange().getValues();
  var userCol = data[0].indexOf('Username');
  for (var i = 1; i < data.length; i++) {
    if (data[i][userCol] === username) {
      sh.deleteRow(i + 1);
      return { ok: true };
    }
  }
  return { ok: false, message: 'ไม่พบผู้ใช้งาน' };
}
