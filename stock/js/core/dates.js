// 날짜 도구: 내부에서는 'epoch day'(1970-01-01부터 지난 날 수, UTC)로 계산합니다.
export const DAY = 86400000;

export function ymdToDay(n) {
  const y = Math.floor(n / 10000), m = Math.floor(n / 100) % 100, d = n % 100;
  return Math.round(Date.UTC(y, m - 1, d) / DAY);
}
export function dayToDate(day) { return new Date(day * DAY); }
export function dayToYmd(day) {
  const t = dayToDate(day);
  return t.getUTCFullYear() * 10000 + (t.getUTCMonth() + 1) * 100 + t.getUTCDate();
}
export function dayToYm(day) {
  const t = dayToDate(day);
  return t.getUTCFullYear() * 100 + (t.getUTCMonth() + 1);
}
export function dayToIso(day) {
  return dayToDate(day).toISOString().slice(0, 10);
}
export function ymToLabel(ym) { return `${Math.floor(ym / 100)}.${String(ym % 100).padStart(2, '0')}`; }
export function ymAdd(ym, k) {
  let y = Math.floor(ym / 100), m = ym % 100 - 1 + k;
  y += Math.floor(m / 12); m = ((m % 12) + 12) % 12;
  return y * 100 + m + 1;
}
export function ymDiff(a, b) { // b - a (개월)
  return (Math.floor(b / 100) - Math.floor(a / 100)) * 12 + (b % 100) - (a % 100);
}
export function firstDayOfYm(ym) { return Math.round(Date.UTC(Math.floor(ym / 100), ym % 100 - 1, 1) / DAY); }
export function todayYm() { const t = new Date(); return t.getFullYear() * 100 + t.getMonth() + 1; }
export function parseYm(s) { // '2017-01', '2017.1', 201701
  if (typeof s === 'number') return s;
  const m = String(s).match(/(\d{4})\D*(\d{1,2})?/);
  if (!m) return null;
  return +m[1] * 100 + (m[2] ? +m[2] : 1);
}
export function ymToIso(ym) { return `${Math.floor(ym / 100)}-${String(ym % 100).padStart(2, '0')}`; }
