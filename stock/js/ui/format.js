// 숫자 서식 — 모든 화면이 같은 규칙을 씁니다(디자인 §5.2).
export const MINUS = '−';
const sign = (x, plus) => (x < 0 ? MINUS : plus && x > 0 ? '+' : '');
const group = (x, d = 0) => Math.abs(x).toLocaleString('ko-KR', { minimumFractionDigits: d, maximumFractionDigits: d });

/** 원화 큰 숫자: 2,906만원 / 3억 2,451만원 / 1.2조 */
export function fmtKRW(x, { plus = false, unit = '원' } = {}) {
  if (x == null || !isFinite(x)) return '–';
  const a = Math.abs(x), s = sign(x, plus);
  if (a >= 1e12) return `${s}${(a / 1e12).toFixed(a >= 1e13 ? 0 : 1)}조${unit === '원' ? '원' : ''}`;
  if (a >= 1e5) {
    const manTotal = Math.round(a / 1e4); // 10만 원 이상은 만 원 단위 반올림
    const eok = Math.floor(manTotal / 1e4), man = manTotal % 1e4;
    if (eok) return `${s}${group(eok)}억${man ? ` ${group(man)}만` : ''}${unit}`;
    return `${s}${group(man)}만${unit}`;
  }
  return `${s}${group(Math.round(a))}${unit}`;
}
/** 원화 축·좁은 칸: 2,906만 / 3.2억 / 1.2조 */
export function fmtKRWShort(x, plus = false) {
  if (x == null || !isFinite(x)) return '–';
  const a = Math.abs(x), s = sign(x, plus);
  if (a >= 1e12) return `${s}${trim(a / 1e12, 1)}조`;
  if (a >= 1e8) return `${s}${trim(roundHalfAway(a / 1e8, a >= 1e10 ? 0 : 1), 1)}억`;
  if (a >= 1e4) return `${s}${group(Math.round(a / 1e4))}만`;
  return `${s}${group(Math.round(a))}`;
}
function trim(v, d) { return String(+v.toFixed(d)).replace(/\.0+$/, ''); }

export function fmtUSD(x, { plus = false, cents = false } = {}) {
  if (x == null || !isFinite(x)) return '–';
  return `${sign(x, plus)}$${group(x, cents ? 2 : 0)}`;
}
export function fmtUSDShort(x, plus = false) {
  if (x == null || !isFinite(x)) return '–';
  const a = Math.abs(x), s = sign(x, plus);
  if (a >= 1e9) return `${s}$${trim(a / 1e9, 1)}B`;
  if (a >= 1e6) return `${s}$${trim(a / 1e6, 1)}M`;
  if (a >= 1e3) return `${s}$${trim(a / 1e3, a >= 1e5 ? 0 : 1)}K`;
  return `${s}$${Math.round(a)}`;
}
export function fmtMoney(x, cur = 'KRW', opts = {}) { return cur === 'USD' ? fmtUSD(x, opts) : fmtKRW(x, opts); }
export function fmtMoneyShort(x, cur = 'KRW', plus = false) { return cur === 'USD' ? fmtUSDShort(x, plus) : fmtKRWShort(x, plus); }
export function fmtPrice(x, cur = 'KRW') {
  if (x == null || !isFinite(x)) return '–';
  return cur === 'USD' ? `$${group(x, 2)}` : `${group(Math.round(x))}원`;
}
/** 수익률(비율 0.115 → '11.5%') */
export function roundHalfAway(v, d) { const f = Math.pow(10, d); return Math.sign(v) * Math.round(Math.abs(v) * f + 1e-9) / f; }
export function fmtPct(x, d = 1, plus = false) {
  if (x == null || !isFinite(x)) return '–';
  const r = roundHalfAway(Math.abs(x * 100), d);
  return `${r === 0 ? '' : sign(x, plus)}${r.toFixed(d)}%`;
}
export function fmtPp(x, d = 1) { // 비율 차이 → %p
  if (x == null || !isFinite(x)) return '–';
  const r = +Math.abs(x * 100).toFixed(d);
  return `${r === 0 ? '' : sign(x, true)}${r.toFixed(d)}%p`;
}
export function fmtNum(x, d = 2) {
  if (x == null || !isFinite(x)) return '–';
  return `${sign(x)}${group(x, d)}`;
}
export function fmtInt(x) { return x == null || !isFinite(x) ? '–' : `${sign(x)}${group(Math.round(x))}`; }
export function arrow(x) { return x > 0 ? '▲' : x < 0 ? '▼' : ''; }
export function dirClass(x) { return x > 0 ? 'up' : x < 0 ? 'down' : 'flat'; }
export function fmtYm(ym) { return `${Math.floor(ym / 100)}.${String(ym % 100).padStart(2, '0')}`; }
export function fmtYmKo(ym) { return `${Math.floor(ym / 100)}년 ${ym % 100}월`; }
export function fmtSpan(m) { // 개월 수 → '9년 10개월'
  const y = Math.floor(m / 12), mo = m % 12;
  return `${y ? `${y}년` : ''}${y && mo ? ' ' : ''}${mo ? `${mo}개월` : ''}` || '0개월';
}
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ------------------------------------------------------------------ 금액 한글 읽기: 20000000 → '2천만원', 123456789 → '약 1억 2,346만원'
function manWords(n) { // 0~9999 → '2천5백' / '2,345' / '3백' / '천'
  if (!n) return '';
  if (n % 100 === 0) {
    const ch = Math.floor(n / 1000), bk = Math.floor((n % 1000) / 100);
    return `${ch ? `${ch === 1 ? '' : ch}천` : ''}${bk ? `${bk === 1 && !ch ? '' : bk}백` : ''}` || '';
  }
  return n.toLocaleString('ko-KR');
}
/** 원·달러 금액을 한글 단위로 읽기. cur: 'KRW'|'USD' */
export function krRead(x, cur = 'KRW') {
  if (x == null || !isFinite(x)) return '';
  const neg = x < 0, a = Math.abs(x);
  const unit = cur === 'USD' ? ' 달러' : '원';
  let txt, approx = false;
  if (a < 1e4) {
    const r = Math.round(a);
    txt = r >= 1000 && r % 100 === 0 ? `${manWords(r)}` : r.toLocaleString('ko-KR');
    approx = Math.abs(r - a) > 0.5;
  } else if (a < 1e6) {
    const man = Math.floor(a / 1e4), rest = Math.round(a - man * 1e4);
    const r2 = rest >= 1000 ? Math.round(rest / 100) * 100 : rest;
    approx = Math.abs(r2 - rest) > 0.5;
    txt = `${man}만${r2 ? ` ${manWords(r2)}` : ''}`;
  } else {
    let man = Math.round(a / 1e4);
    if (a >= 1e8) { const step = a >= 1e10 ? 1000 : a >= 1e9 ? 100 : 1; man = Math.round(a / 1e4 / step) * step; }
    approx = Math.abs(man * 1e4 - a) > a * 0.002;
    const jo = Math.floor(man / 1e8), eok = Math.floor((man % 1e8) / 1e4), m = man % 1e4;
    const parts = [];
    if (jo) parts.push(`${jo.toLocaleString('ko-KR')}조`);
    if (eok) parts.push(`${eok.toLocaleString('ko-KR')}억`);
    if (m) parts.push(`${manWords(m)}만`);
    txt = parts.join(' ');
    if (!m && !eok && jo) txt = `${jo.toLocaleString('ko-KR')}조`;
  }
  return `${approx ? '약 ' : ''}${neg ? '마이너스 ' : ''}${txt}${unit}`;
}
/** 달러 금액 옆 설명: '1만 2천5백 달러 · 약 1,750만원' */
export function krReadUSD(x, fx) {
  const a = krRead(x, 'USD');
  return fx ? `${a} · ${krRead(x * fx, 'KRW').replace(/^약 /, '')}` : a;
}
