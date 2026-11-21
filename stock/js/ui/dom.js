// 작은 화면 도구: 요소 만들기, 토스트, 시트(모달), 팝오버, 저장소
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/** html 문자열 → 요소 */
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

import { PERSONAL, vaultGet, vaultSet } from '../core/auth.js';
import { krRead, krReadUSD } from './format.js';
import { assetInfo } from '../core/data.js';
export function store(key, val) {
  if (PERSONAL.has(key)) { // 계정별 암호화 저장소
    if (val === undefined) return structuredClone(vaultGet(key));
    vaultSet(key, structuredClone(val));
    return val;
  }
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) { /* 저장 공간 부족 등 */ }
  return val;
}

let toastTimer = null;
export function toast(msg, action = null) {
  document.querySelector('.toast')?.remove();
  const t = el(`<div class="toast" role="status"><span></span></div>`);
  t.firstChild.textContent = msg;
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.onclick = () => { action.fn(); t.remove(); };
    t.appendChild(b);
  }
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), action ? 7000 : 3500);
}

export function announce(msg) { const l = document.getElementById('live'); if (l) { l.textContent = ''; setTimeout(() => { l.textContent = msg; }, 50); } }

/** 바텀시트/모달. content: 요소 또는 html. 반환: {close, root} */
export function sheet(content, { wide = false, onClose = null, label = '' } = {}) {
  const prev = document.activeElement;
  const ov = el(`<div class="overlay"><div class="sheet${wide ? ' wide' : ''}" role="dialog" aria-modal="true" ${label ? `aria-label="${label}"` : ''}></div></div>`);
  const sh = ov.firstChild;
  if (typeof content === 'string') sh.innerHTML = content; else sh.appendChild(content);
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); onClose?.(); prev?.focus?.(); };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') { // 포커스 가두기
      const f = $$('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])', sh).filter((x) => !x.disabled && x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(ov);
  moneyHints(sh);
  setTimeout(() => ($('input, select, textarea, button', sh))?.focus(), 30);
  return { close, root: sh };
}

/** 도움말 팝오버 */
export function popover(anchor, html) {
  document.querySelector('.pop')?.remove();
  const p = el(`<div class="pop" role="dialog"></div>`);
  p.innerHTML = html;
  document.body.appendChild(p);
  const r = anchor.getBoundingClientRect();
  const w = p.offsetWidth;
  p.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + window.scrollX - w / 2 + r.width / 2))}px`;
  p.style.top = `${r.bottom + window.scrollY + 8}px`;
  const off = (e) => { if (!p.contains(e.target) && e.target !== anchor) { p.remove(); document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc); } };
  const esc = (e) => { if (e.key === 'Escape') { p.remove(); anchor.focus(); } };
  setTimeout(() => { document.addEventListener('mousedown', off); document.addEventListener('keydown', esc); }, 0);
  return p;
}

export function debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

/** 설정 */
const DEFAULT_SETTINGS = { theme: 'dark', bandDaily: false, updown: 'kr', currency: 'KRW', feeBp: 10, apiKey: '', model: 'claude-sonnet-5-5', altStyle: 'equity', noCommodity: true, bandAbs: 3, capSingle: 20, capProduct: 25, hideAmounts: false };
export function settings() { return { ...DEFAULT_SETTINGS, ...(store('ss.settings') || {}), ...(vaultGet('ss.priv') || {}) }; }
export function saveSettings(patch) {
  const s = { ...settings(), ...patch };
  const { apiKey, model, ...dev } = s;
  store('ss.settings', dev);
  vaultSet('ss.priv', { ...(vaultGet('ss.priv') || {}), apiKey, model });
  applyTheme(s);
  return s;
}
export function applyTheme(s = settings()) {
  const dark = s.theme === 'dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  if (dark) document.documentElement.dataset.theme = 'dark'; else delete document.documentElement.dataset.theme;
  if (s.updown === 'global') document.documentElement.dataset.updown = 'global'; else delete document.documentElement.dataset.updown;
  const lb = document.getElementById('themeLb'); if (lb) lb.textContent = dark ? '밝게' : '어둡게';
  window.dispatchEvent(new Event('themechange'));
}

/** 금액 입력칸 아래에 한글 읽기(2천만원 / 1만 2천5백 달러 · 약 1,750만원)를 붙임: <input data-money="KRW|USD"> */
export function moneyHints(root = document) {
  $$('input[data-money]', root).forEach((inp) => {
    const host = inp.closest('.input-unit') || inp;
    let hint = host.nextElementSibling?.classList?.contains('kr-hint') ? host.nextElementSibling : null;
    if (!hint) { hint = document.createElement('span'); hint.className = 'kr-hint'; hint.setAttribute('aria-live', 'polite'); host.after(hint); }
    const upd = () => {
      const v = +String(inp.value).replace(/[^\d.\-]/g, '');
      const cur = inp.dataset.money;
      const fx = assetInfo('FX_USDKRW')?.p;
      hint.textContent = !v ? '' : cur === 'USD' ? krReadUSD(v, fx) : krRead(v, 'KRW');
    };
    if (!inp.dataset.hinted) { inp.addEventListener('input', upd); inp.dataset.hinted = '1'; }
    upd();
  });
}
