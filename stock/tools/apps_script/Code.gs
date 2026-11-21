/**
 * Seok's Stock 계정·데이터 저장소 (Google Apps Script 웹 앱)
 * - 계정: 구글 시트 'Seok's Stock 계정'에 아이디·이메일·검증값만 저장(비밀번호 원문 없음)
 * - 개인 데이터: 브라우저에서 이미 암호화된 덩어리를 드라이브 폴더에 계정별 파일로 보관(여기서는 내용을 볼 수 없음)
 * 배포: 배포 → 새 배포 → 유형 '웹 앱' → 실행: 나 / 액세스: 모든 사용자 → 배포 → 웹 앱 URL을 앱 운영자에게 전달
 */
const P = PropertiesService.getScriptProperties();
const HEAD = ['h', 'id', 'email', 'name', 'role', 'salt', 'iter', 'ver', 'created', 'lastLogin', 'vaultAt', 'fails', 'lockUntil'];

function sheet_() {
  let id = P.getProperty('SHEET_ID'), ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create("Seok's Stock 계정");
    P.setProperty('SHEET_ID', ss.getId());
    const sh = ss.getSheets()[0]; sh.setName('계정'); sh.appendRow(HEAD); sh.setFrozenRows(1);
  }
  return ss.getSheetByName('계정');
}
function folder_() {
  const id = P.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) { /* 새로 */ } }
  const f = DriveApp.createFolder("Seok's Stock 개인 데이터(암호화)");
  P.setProperty('FOLDER_ID', f.getId());
  return f;
}
function find_(sh, h) {
  const v = sh.getDataRange().getValues();
  for (let i = 1; i < v.length; i++) if (v[i][0] === h) { const o = {}; HEAD.forEach((k, j) => { o[k] = v[i][j]; }); o.row = i + 1; return o; }
  return null;
}
function set_(sh, row, key, val) { sh.getRange(row, HEAD.indexOf(key) + 1).setValue(val); }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet(e) { return out_(handle_(e.parameter || {})); }
function doPost(e) { let q = {}; try { q = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'bad json' }); } return out_(handle_(q)); }

function handle_(q) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_();
    const h = String(q.h || '');
    if (q.action === 'ping') return { ok: true, app: 'seoks-stock' };
    if (!/^[0-9a-f]{64}$/.test(h)) return { ok: false, error: 'bad id' };
    const acc = find_(sh, h);
    if (q.action === 'salt') return acc ? { ok: true, salt: acc.salt, iter: acc.iter } : { ok: false, error: 'none' };
    if (q.action === 'register') {
      if (acc) return { ok: false, error: 'dup' };
      if (!/^[a-z0-9_.-]{3,20}$/.test(String(q.id || ''))) return { ok: false, error: 'bad id' };
      if (q.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(q.email))) return { ok: false, error: 'bad email' };
      const now = new Date().toISOString();
      sh.appendRow([h, q.id, q.email, q.name || q.id, 'member', q.salt, Number(q.iter) || 310000, q.ver, now, now, '', 0, '']);
      return { ok: true, role: 'member', name: q.name || q.id };
    }
    if (!acc) return { ok: false, error: 'none' };
    // 비밀번호 확인(검증값 비교) + 연속 실패 잠금
    const until = acc.lockUntil ? new Date(acc.lockUntil).getTime() : 0;
    if (until > Date.now()) return { ok: false, error: 'locked' };
    if (String(q.ver || '') !== String(acc.ver)) {
      const f = (Number(acc.fails) || 0) + 1;
      set_(sh, acc.row, 'fails', f);
      if (f >= 10) { set_(sh, acc.row, 'lockUntil', new Date(Date.now() + 15 * 60000).toISOString()); set_(sh, acc.row, 'fails', 0); }
      return { ok: false, error: 'wrong' };
    }
    if (Number(acc.fails)) set_(sh, acc.row, 'fails', 0);
    const name = 'vault_' + h.slice(0, 16) + '.json';
    const files = folder_().getFilesByName(name);
    const file = files.hasNext() ? files.next() : null;
    if (q.action === 'login') {
      set_(sh, acc.row, 'lastLogin', new Date().toISOString());
      return { ok: true, name: acc.name, role: acc.role, vaultAt: acc.vaultAt || null, box: file ? JSON.parse(file.getBlob().getDataAsString()) : null };
    }
    if (q.action === 'push') {
      const body = JSON.stringify(q.box || null);
      if (body.length > 20e6) return { ok: false, error: 'too big' };
      if (file) file.setContent(body); else folder_().createFile(name, body, MimeType.PLAIN_TEXT);
      set_(sh, acc.row, 'vaultAt', q.at || new Date().toISOString());
      return { ok: true };
    }
    return { ok: false, error: 'unknown action' };
  } finally { lock.releaseLock(); }
}
