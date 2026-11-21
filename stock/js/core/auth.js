// 로그인·가입과 계정별 암호화 저장소
// - 계정 정보에는 아이디 해시·솔트·검증값(PBKDF2)만 둔다. 비밀번호 원문은 어디에도 저장하지 않는다.
// - 마스터 계정: config/accounts.json (저장소에 커밋)
// - 가입 계정: 계정 저장소(구글 Apps Script 웹 앱, config/backend.json의 url)가 연결돼 있으면 거기에, 아니면 이 기기에 저장
// - 개인 데이터: 비밀번호에서 만든 AES-GCM 키로 암호화해 이 기기에 두고, 계정 저장소가 있으면 암호문을 올려 다른 기기와 맞춤
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const PERSONAL = new Set(['ss.plans', 'ss.holdings', 'ss.snapshots', 'ss.bt', 'ss.btHistory', 'ss.planHistory', 'ss.priv', 'ss.finder']);
const SESS = 'ss.sess', LOCAL_ACC = 'ss.accounts';
const ITER = 310000;

let user = null;     // {h, name, role}
let aesKey = null;   // CryptoKey
let ver = null;      // 계정 저장소 인증용 검증값(세션 동안만)
let vault = null;    // {key: value, _at}
let guestMem = {};
let saveTimer = null, pushTimer = null;
let backendUrl;

async function sha256hex(s) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join(''); }
const idHash = (id) => sha256hex(`ss-acct:${String(id).trim().toLowerCase()}`);
async function cfg(path) { const r = await fetch(new URL(`../../config/${path}`, import.meta.url), { cache: 'no-cache' }); if (!r.ok) throw new Error(`${path}: ${r.status}`); return r.json(); }
async function masterAccounts() { try { return (await cfg('accounts.json')).accounts || []; } catch { return []; } }
function localAccounts() { try { return JSON.parse(localStorage.getItem(LOCAL_ACC) || '[]'); } catch { return []; } }
function saveLocalAccount(a) { const l = localAccounts().filter((x) => x.h !== a.h); l.push(a); localStorage.setItem(LOCAL_ACC, JSON.stringify(l)); }

// ---- 계정 저장소(Apps Script 웹 앱)
export async function backend() {
  if (backendUrl !== undefined) return backendUrl;
  const local = localStorage.getItem('ss.backendUrl'); // 마스터가 설정에서 넣은 주소(저장소 반영 전 시험용)
  try { backendUrl = local || (await cfg('backend.json')).url || null; } catch { backendUrl = local || null; }
  return backendUrl;
}
export function setBackendOverride(url) { if (url) localStorage.setItem('ss.backendUrl', url); else localStorage.removeItem('ss.backendUrl'); backendUrl = undefined; }
export async function pingBackend(url) {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action: 'ping' }), redirect: 'follow' });
  const j = await r.json(); return j?.ok && j.app === 'seoks-stock';
}
async function call(action, body = {}) {
  const url = await backend();
  if (!url) return null;
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, ...body }), redirect: 'follow' });
  if (!r.ok) throw new Error(`계정 저장소 오류 ${r.status}`);
  return r.json();
}

async function derive(id, pw, salt, iter) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array([...unb64(salt), ...enc.encode(String(id).trim().toLowerCase())]), iterations: iter }, key, 512));
  return { ver: b64(bits.slice(0, 32)), raw: bits.slice(32) };
}
async function importAes(raw) { return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }
async function encryptObj(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, enc.encode(JSON.stringify(obj))));
  return { v: 1, iv: b64(iv), ct: b64(ct) };
}
async function decryptObj(box) { return JSON.parse(dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, aesKey, unb64(box.ct)))); }
const vaultKey = () => `ss.vault.${user.h.slice(0, 16)}`;

async function openVault(remoteBox = null) {
  const raw = localStorage.getItem(vaultKey());
  vault = {};
  if (raw) { try { vault = await decryptObj(JSON.parse(raw)); } catch { vault = {}; throw new Error('저장된 데이터를 풀지 못했어요(비밀번호가 바뀌었을 수 있어요).'); } }
  if (remoteBox) { // 다른 기기에서 더 최근에 고친 데이터면 그걸 씀
    try { const rv = await decryptObj(remoteBox); if ((rv._at || 0) > (vault._at || 0)) vault = rv; } catch { /* 무시 */ }
  }
  if (user.role === 'master') { // 예전(로그인 전) 평문 데이터를 옮기고 평문은 지움
    let moved = 0;
    for (const k of PERSONAL) {
      const old = localStorage.getItem(k);
      if (old == null) continue;
      if (vault[k] == null) { try { vault[k] = JSON.parse(old); moved++; } catch { /* 무시 */ } }
      localStorage.removeItem(k);
    }
    try { const s = JSON.parse(localStorage.getItem('ss.settings') || '{}'); if (s.apiKey) { vault['ss.priv'] = { ...(vault['ss.priv'] || {}), apiKey: s.apiKey, model: s.model }; delete s.apiKey; localStorage.setItem('ss.settings', JSON.stringify(s)); moved++; } } catch { /* 무시 */ }
    if (moved) vault._at = Date.now();
  }
  localStorage.setItem(vaultKey(), JSON.stringify(await encryptObj(vault)));
}
async function flush() {
  if (!user || !aesKey || !vault) return;
  try {
    const box = await encryptObj(vault);
    localStorage.setItem(vaultKey(), JSON.stringify(box));
    if (ver && await backend()) { clearTimeout(pushTimer); pushTimer = setTimeout(() => call('push', { h: user.h, ver, box, at: new Date(vault._at || Date.now()).toISOString() }).catch((e) => console.warn('push', e)), 1500); }
  } catch (e) { console.warn('vault save', e); }
}
function startSession(acc, d, remember) {
  ver = d.ver;
  const sess = JSON.stringify({ h: acc.h, name: acc.name, role: acc.role, k: b64(d.raw), v: d.ver });
  sessionStorage.setItem(SESS, sess);
  if (remember) localStorage.setItem(SESS, sess); else localStorage.removeItem(SESS);
}

/** 로그인 → {ok, error} */
export async function login(id, pw, remember = true) {
  id = String(id || '').trim(); pw = String(pw || '');
  if (!id || !pw) return { ok: false, error: '아이디와 비밀번호를 넣어 주세요.' };
  const h = await idHash(id);
  const bad = async () => { await new Promise((r) => setTimeout(r, 400)); return { ok: false, error: '아이디나 비밀번호가 맞지 않아요.' }; };
  // 1) 마스터 → 2) 이 기기에 저장된 계정 → 3) 계정 저장소
  let acc = (await masterAccounts()).find((a) => a.h === h) || localAccounts().find((a) => a.h === h);
  let remote = null;
  try {
    if (!acc && await backend()) { const s = await call('salt', { h }); if (s?.ok) acc = { h, salt: s.salt, iter: +s.iter, role: 'member', name: id, remoteOnly: true }; }
  } catch (e) { return { ok: false, error: `계정 저장소에 연결하지 못했어요. ${e.message}` }; }
  if (!acc) return bad();
  const d = await derive(id, pw, acc.salt, acc.iter);
  if (acc.ver && d.ver !== acc.ver) return bad();
  try {
    if (await backend()) {
      remote = await call('login', { h, ver: d.ver });
      if (remote && !remote.ok && remote.error === 'none') { await call('register', { h, id, email: acc.email || '', name: acc.name || id, salt: acc.salt, iter: acc.iter, ver: d.ver }); remote = await call('login', { h, ver: d.ver }); }
      if (remote && !remote.ok) {
        if (remote.error === 'locked') return { ok: false, error: '비밀번호를 여러 번 틀려 15분 동안 잠겼어요.' };
        if (remote.error === 'wrong' || acc.remoteOnly) return bad();
      }
    }
  } catch (e) { if (acc.remoteOnly) return { ok: false, error: `계정 저장소에 연결하지 못했어요. ${e.message}` }; remote = null; }
  user = { h, name: acc.role === 'master' ? acc.name : (remote?.name || acc.name || id), role: acc.role === 'master' ? 'master' : 'member' };
  aesKey = await importAes(d.raw);
  if (acc.remoteOnly) saveLocalAccount({ h, salt: acc.salt, iter: acc.iter, ver: d.ver, name: user.name, role: user.role });
  try { await openVault(remote?.box || null); } catch (e) { return { ok: false, error: e.message }; }
  startSession(user, d, remember);
  return { ok: true, user };
}

/** 가입 → {ok, error, where:'remote'|'local'} */
export async function signup({ id, email, pw, pw2, remember = true }) {
  id = String(id || '').trim().toLowerCase(); email = String(email || '').trim(); pw = String(pw || '');
  if (!/^[a-z0-9_.-]{3,20}$/.test(id)) return { ok: false, error: '아이디는 영문 소문자·숫자·_ . - 로 3~20자예요.' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: '이메일 형식을 확인해 주세요.' };
  if (pw.length < 6) return { ok: false, error: '비밀번호는 6자 이상으로 해 주세요.' };
  if (pw !== pw2) return { ok: false, error: '비밀번호 확인이 달라요.' };
  const h = await idHash(id);
  if ((await masterAccounts()).some((a) => a.h === h) || localAccounts().some((a) => a.h === h)) return { ok: false, error: '이미 있는 아이디예요.' };
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
  const d = await derive(id, pw, salt, ITER);
  let where = 'local';
  try {
    if (await backend()) {
      const r = await call('register', { h, id, email, name: id, salt, iter: ITER, ver: d.ver });
      if (!r?.ok) return { ok: false, error: r?.error === 'dup' ? '이미 있는 아이디예요.' : `가입하지 못했어요(${r?.error || '알 수 없음'}).` };
      where = 'remote';
    }
  } catch (e) { return { ok: false, error: `계정 저장소에 연결하지 못했어요. ${e.message}` }; }
  saveLocalAccount({ h, salt, iter: ITER, ver: d.ver, name: id, role: 'member', email });
  user = { h, name: id, role: 'member' };
  aesKey = await importAes(d.raw);
  await openVault(null);
  startSession(user, d, remember);
  return { ok: true, where };
}

/** 새로 고침해도 로그인 유지(계정 저장소가 있으면 다른 기기에서 고친 데이터를 받아 옴) */
export async function restoreSession() {
  const raw = sessionStorage.getItem(SESS) || localStorage.getItem(SESS);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    user = { h: s.h, name: s.name, role: s.role };
    aesKey = await importAes(unb64(s.k));
    ver = s.v || null;
    let box = null;
    if (ver && await backend()) { try { const r = await call('login', { h: s.h, ver }); if (r?.ok) box = r.box; } catch { /* 오프라인 */ } }
    await openVault(box);
    return user;
  } catch { logout(false); return null; }
}
export function logout(reload = true) {
  clearTimeout(saveTimer);
  if (user && vault) flush();
  sessionStorage.removeItem(SESS); localStorage.removeItem(SESS);
  user = null; aesKey = null; vault = null; ver = null; guestMem = {};
  if (reload) setTimeout(() => location.reload(), 300);
}
export function currentUser() { return user; }
export function isGuest() { return !user; }

/** 개인 데이터 읽기/쓰기(동기 — 화면 코드가 그대로 쓰게) */
export function vaultGet(k) { return user ? (vault?.[k] ?? null) : (guestMem[k] ?? null); }
export function vaultSet(k, v) {
  if (!user) { guestMem[k] = v; return; }
  if (!vault) return;
  if (v == null) delete vault[k]; else vault[k] = v;
  vault._at = Date.now();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 300);
}
window.addEventListener('pagehide', () => { if (user && vault) { clearTimeout(saveTimer); flush(); } });

/** 기기 옮기기: 암호화된 백업(같은 계정으로 로그인해야 풀림) */
export async function exportVault() { if (!user) return null; return { app: 'seoks-stock', kind: 'vault', h: user.h.slice(0, 16), at: new Date().toISOString(), box: await encryptObj(vault) }; }
export async function importVault(d) {
  if (!user) throw new Error('먼저 로그인해 주세요.');
  if (d.kind !== 'vault') throw new Error('암호화 백업 파일이 아니에요.');
  if (d.h !== user.h.slice(0, 16)) throw new Error('다른 계정의 백업이에요.');
  vault = await decryptObj(d.box); vault._at = Date.now(); await flush();
}
