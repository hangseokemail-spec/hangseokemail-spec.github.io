// 로그인과 계정별 암호화 저장소
// - 계정 목록(config/accounts.json)에는 아이디 해시·솔트·검증값만 있음(아이디·비밀번호 원문 없음)
// - 로그인하면 PBKDF2로 비밀번호에서 검증값과 AES-GCM 키를 만들고, 그 키로 이 기기의 개인 데이터를 암호화해 저장
// - 정적 사이트라서 서버가 없음: 데이터는 기기마다 따로 저장(기기 옮기기는 암호화 백업 파일)
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const PERSONAL = new Set(['ss.plans', 'ss.holdings', 'ss.snapshots', 'ss.bt', 'ss.btHistory', 'ss.planHistory', 'ss.priv', 'ss.finder']);
const SESS = 'ss.sess';

let user = null;     // {h, name, role}
let aesKey = null;   // CryptoKey
let vault = null;    // {key: value}
let guestMem = {};   // 로그인 없이 볼 때(저장 안 함)
let saveTimer = null;

async function sha256hex(s) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join(''); }
async function loadAccounts() {
  const r = await fetch(new URL('../../config/accounts.json', import.meta.url), { cache: 'no-cache' });
  if (!r.ok) throw new Error('계정 목록을 불러오지 못했어요');
  return (await r.json()).accounts || [];
}
async function derive(id, pw, acc) {
  const key = await crypto.subtle.importKey('raw', enc.encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array([...unb64(acc.salt), ...enc.encode(id.toLowerCase())]), iterations: acc.iter }, key, 512));
  return { ver: b64(bits.slice(0, 32)), raw: bits.slice(32) };
}
async function importAes(raw) { return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']); }

async function encryptObj(obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, aesKey, enc.encode(JSON.stringify(obj))));
  return { v: 1, iv: b64(iv), ct: b64(ct) };
}
async function decryptObj(box) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, aesKey, unb64(box.ct));
  return JSON.parse(dec.decode(pt));
}
const vaultKey = () => `ss.vault.${user.h.slice(0, 16)}`;

async function openVault() {
  const raw = localStorage.getItem(vaultKey());
  vault = {};
  if (raw) { try { vault = await decryptObj(JSON.parse(raw)); } catch { vault = {}; throw new Error('저장된 데이터를 풀지 못했어요(비밀번호가 바뀌었을 수 있어요).'); } }
  // 예전(로그인 전) 평문 데이터를 마스터 계정으로 옮기고 평문은 지움
  if (user.role === 'master') {
    let moved = 0;
    for (const k of PERSONAL) {
      const old = localStorage.getItem(k);
      if (old == null) continue;
      if (vault[k] == null) { try { vault[k] = JSON.parse(old); moved++; } catch { /* 무시 */ } }
      localStorage.removeItem(k);
    }
    try { const s = JSON.parse(localStorage.getItem('ss.settings') || '{}'); if (s.apiKey) { vault['ss.priv'] = { ...(vault['ss.priv'] || {}), apiKey: s.apiKey, model: s.model }; delete s.apiKey; localStorage.setItem('ss.settings', JSON.stringify(s)); moved++; } } catch { /* 무시 */ }
    if (moved) await flush();
  }
}
async function flush() {
  if (!user || !aesKey || !vault) return;
  try { localStorage.setItem(vaultKey(), JSON.stringify(await encryptObj(vault))); } catch (e) { console.warn('vault save', e); }
}

/** 로그인 → {ok, error} */
export async function login(id, pw, remember = true) {
  id = String(id || '').trim(); pw = String(pw || '');
  if (!id || !pw) return { ok: false, error: '아이디와 비밀번호를 넣어 주세요.' };
  let accs;
  try { accs = await loadAccounts(); } catch (e) { return { ok: false, error: e.message }; }
  const h = await sha256hex(`ss-acct:${id.toLowerCase()}`);
  const acc = accs.find((a) => a.h === h);
  if (!acc) { await new Promise((r) => setTimeout(r, 400)); return { ok: false, error: '아이디나 비밀번호가 맞지 않아요.' }; }
  const d = await derive(id, pw, acc);
  if (d.ver !== acc.ver) return { ok: false, error: '아이디나 비밀번호가 맞지 않아요.' };
  user = { h, name: acc.name, role: acc.role };
  aesKey = await importAes(d.raw);
  try { await openVault(); } catch (e) { return { ok: false, error: e.message }; }
  const sess = JSON.stringify({ h, name: acc.name, role: acc.role, k: b64(d.raw) });
  sessionStorage.setItem(SESS, sess);
  if (remember) localStorage.setItem(SESS, sess); else localStorage.removeItem(SESS);
  return { ok: true, user };
}
/** 새로 고침해도 로그인 유지 */
export async function restoreSession() {
  const raw = sessionStorage.getItem(SESS) || localStorage.getItem(SESS);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    user = { h: s.h, name: s.name, role: s.role };
    aesKey = await importAes(unb64(s.k));
    await openVault();
    return user;
  } catch { logout(false); return null; }
}
export function logout(reload = true) {
  clearTimeout(saveTimer);
  if (user && vault) flush();
  sessionStorage.removeItem(SESS); localStorage.removeItem(SESS);
  user = null; aesKey = null; vault = null; guestMem = {};
  if (reload) location.reload();
}
export function currentUser() { return user; }
export function isGuest() { return !user; }

/** 개인 데이터 읽기/쓰기(동기 — 화면 코드가 그대로 쓰게) */
export function vaultGet(k) { return user ? (vault?.[k] ?? null) : (guestMem[k] ?? null); }
export function vaultSet(k, v) {
  if (!user) { guestMem[k] = v; return; }
  if (!vault) return;
  if (v == null) delete vault[k]; else vault[k] = v;
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
  vault = await decryptObj(d.box); await flush();
}
