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

// ------------------------------------------------------------------ 금액 한글 읽기(Fable 컨펌: 천의 배수만 '천', 나머지는 콤마 숫자)
// 20000000 → '2천만원', 18000000 → '1,800만원', $12,500 → '1만 2,500 달러 · 약 1,800만원'
const UNITS = ['', '만', '억', '조'];
function groupWord(g, alone) { // 1~9999
  if (g % 1000 === 0) return `${g === 1000 && alone ? '' : g / 1000}천`;
  return g.toLocaleString('en-US');
}
/** exact=false면 위 두 묶음만 남기고(1만 이상) 버린 게 있으면 approx */
export function koreanUnits(n, { exact = true } = {}) {
  let v = Math.round(Math.abs(n));
  if (v === 0) return { text: '0', approx: false };
  const split = (x) => { const g = []; while (x > 0) { g.push(x % 10000); x = Math.floor(x / 10000); } return g; };
  let groups = split(v), approx = false;
  if (!exact && groups.length > 1) {
    const keep = Math.max(1, groups.length - 2), unit = 10000 ** keep, r = Math.round(v / unit) * unit;
    approx = r !== v; v = r; groups = split(v); for (let i = 0; i < keep; i++) groups[i] = 0;
  }
  const nz = groups.filter(Boolean).length, parts = [];
  for (let i = groups.length - 1; i >= 0; i--) if (groups[i]) parts.push(groupWord(groups[i], nz === 1) + UNITS[i]);
  return { text: (n < 0 ? MINUS : '') + parts.join(' '), approx };
}
export const readKRW = (n, o) => { const r = koreanUnits(n, o); return `${r.approx ? '약 ' : ''}${r.text}원`; };
/** 환산값: 만원 단위, 유효숫자 3자리, 앞에 '약' */
export function approxKRW(n) {
  const a = Math.abs(n); let v = a >= 1e4 ? Math.round(a / 1e4) * 1e4 : Math.round(a);
  const d = String(v).length; if (d > 3) { const p = 10 ** (d - 3); v = Math.round(v / p) * p; }
  return `약 ${koreanUnits(n < 0 ? -v : v).text}원`;
}
export const readUSD = (n, fx) => `${koreanUnits(Math.round(n)).text} 달러${fx ? ` · ${approxKRW(n * fx)}` : ''}`;
/** 앱 공통 이름(입력칸은 정확히, 표시는 exact:false) */
export function krRead(x, cur = 'KRW', exact = true) {
  if (x == null || !isFinite(x)) return '';
  return cur === 'USD' ? `${koreanUnits(Math.round(x)).text} 달러` : readKRW(x, { exact });
}
export function krReadUSD(x, fx) { return x == null || !isFinite(x) ? '' : readUSD(x, fx); }
