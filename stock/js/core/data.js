// 시세 데이터 읽기: data/universe.json, data/px/<키>.json, data/monthly_<그룹>.json
import { ymdToDay } from './dates.js';

let loader = async (path) => {
  const url = new URL(`../../data/${path}`, import.meta.url);
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
};
/** Node 테스트 등에서 파일 읽는 방법을 바꿀 때 사용 */
export function setLoader(fn) { loader = fn; }

let universe = null;
const pxCache = new Map();
const monthlyCache = new Map();

export async function loadUniverse() {
  if (universe) return universe;
  const j = await loader('universe.json');
  const byKey = new Map();
  for (const it of j.items) byKey.set(it.k, it);
  universe = { updated: j.updated, items: j.items, byKey };
  return universe;
}
export function getUniverse() { return universe; }
export function assetInfo(key) { return universe?.byKey.get(key) || null; }

/** 종목 일별 시세 → {key, day: Int32Array, close, tr(총수익지수), pr(가격지수=close)} */
export async function loadPx(key) {
  if (pxCache.has(key)) return pxCache.get(key);
  const p = loader(`px/${encodeURIComponent(key)}.json`).then((o) => decodePx(o));
  pxCache.set(key, p);
  try { return await p; } catch (e) { pxCache.delete(key); throw e; }
}

export function decodePx(o) {
  const n = o.c.length;
  const day = new Int32Array(n);
  day[0] = ymdToDay(o.d0);
  for (let i = 1; i < n; i++) day[i] = day[i - 1] + o.dd[i - 1];
  const close = Float64Array.from(o.c);
  const div = new Float64Array(n);
  if (o.dv && o.dv.length) {
    const pos = new Map();
    for (let i = 0; i < n; i++) pos.set(day[i], i);
    for (const [d, a] of o.dv) {
      const i = pos.get(ymdToDay(d));
      if (i !== undefined) div[i] += a;
    }
  }
  // 총수익지수: 야후 adjclose와 같은 방식 — 배당락일 수익 = 종가 / (전일 종가 − 분배금)
  const tr = new Float64Array(n);
  tr[0] = close[0];
  for (let i = 1; i < n; i++) {
    const base = close[i - 1] > div[i] ? close[i - 1] - div[i] : close[i - 1];
    tr[i] = tr[i - 1] * close[i] / base;
  }
  const shares = (o.sh || []).map(([d, v]) => [ymdToDay(d), v]);
  return { key: o.k, day, close, tr, div, shares, src: o.src || 'yahoo' };
}

export async function loadMonthly(group) {
  if (monthlyCache.has(group)) return monthlyCache.get(group);
  const p = loader(`monthly_${group}.json`);
  monthlyCache.set(group, p);
  return p;
}

export async function loadKrAll() { return loader('kr_all.json'); }
export async function loadMeta() { return loader('meta.json'); }

/** 이름·티커·별칭 검색 (자동완성/자연어 해석용) */
export function searchAssets(q, limit = 12, filter = null) {
  if (!universe) return [];
  const s = norm(q);
  if (!s) return [];
  const out = [];
  for (const it of universe.items) {
    if (filter && !filter(it)) continue;
    const k = it.k.toLowerCase();
    const n = norm(it.n);
    let score = 0;
    if (k === s) score = 100;
    else if ((it.al || []).some((a) => norm(a) === s)) score = 95;
    else if (n === s) score = 90;
    else if (k.startsWith(s)) score = 70;
    else if (n.startsWith(s)) score = 60;
    else if (n.includes(s)) score = 40;
    else if ((it.al || []).some((a) => norm(a).includes(s))) score = 35;
    if (score) out.push([score - (it.t === 'index' ? 5 : 0), it]);
  }
  out.sort((a, b) => b[0] - a[0] || (b[1].e || 0) - (a[1].e || 0));
  return out.slice(0, limit).map((x) => x[1]);
}
export function norm(s) { return String(s || '').toLowerCase().replace(/[\s·()&\-_.]/g, ''); }
