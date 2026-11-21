// 시세 데이터 읽기: data/universe.json, data/px/<키>.json, data/monthly_<그룹>.json
import { ymdToDay } from './dates.js';

// ---- 브라우저 캐시: 데이터 버전(meta.updated)이 같으면 IndexedDB에서 즉시 꺼내고, 바뀌었을 때만 내려받음
let dataVersion = null;
const IDB = (() => {
  if (typeof indexedDB === 'undefined') return null;
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('ss-cache', 1); r.onupgradeneeded = () => r.result.createObjectStore('files'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }).catch(() => null));
  const tx = async (mode, fn) => { const db = await open(); if (!db) return null; return new Promise((res) => { try { const t = db.transaction('files', mode); const q = fn(t.objectStore('files')); t.oncomplete = () => res(q?.result ?? null); t.onerror = () => res(null); } catch { res(null); } }); };
  return { get: (k) => tx('readonly', (s) => s.get(k)), put: (k, v) => tx('readwrite', (s) => s.put(v, k)), clear: () => tx('readwrite', (s) => s.clear()) };
})();
async function fetchJson(path, bust) {
  const url = new URL(`../../data/${path}`, import.meta.url);
  if (bust) url.searchParams.set('v', bust);
  const r = await fetch(url, { cache: bust ? 'default' : 'no-cache' });
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}
let loader = async (path) => {
  if (path === 'meta.json' || !IDB) return fetchJson(path, null);
  if (!dataVersion) { try { dataVersion = (await fetchJson('meta.json', null)).updated || String(Date.now()); } catch { dataVersion = 'x'; } }
  const hit = await IDB.get(path);
  if (hit && hit.v === dataVersion) return hit.d;
  const d = await fetchJson(path, dataVersion);
  IDB.put(path, { v: dataVersion, d });
  return d;
};
export function clearDataCache() { return IDB?.clear(); }
export function setDataVersion(v) { dataVersion = v; }
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

/** 실적(펀더멘털) DB: data/fund/<그룹>.json(없으면 null) */
const fundCache = new Map();
export async function loadFund(group) {
  if (!fundCache.has(group)) fundCache.set(group, loader(`fund/${group}.json`).catch(() => null));
  return fundCache.get(group);
}

export async function loadKrAll() { return loader('kr_all.json'); }
export async function loadMeta() { const m = await loader('meta.json'); if (m?.updated) dataVersion = m.updated; return m; }

/** 자주 쓰는 종목을 한가할 때 미리 받아 둠(다음 실행이 즉시 시작되게) */
export function prefetch(keys) {
  const go = () => keys.reduce((p, k) => p.then(() => loadPx(k).catch(() => null)), Promise.resolve());
  if (typeof requestIdleCallback !== 'undefined') requestIdleCallback(go, { timeout: 4000 }); else setTimeout(go, 1500);
}

/** 종목 분류(제외 조건·전략 찾기용): lev 레버리지, inv 인버스, bond 채권, cash 현금성, cmdty 원자재·금, single 단일종목 */
const LEV_US = new Set(['TQQQ', 'SOXL', 'UPRO', 'SPXL', 'SSO', 'QLD', 'TECL', 'FNGU', 'LABU', 'TNA', 'NVDL', 'TSLL', 'CONL', 'MSTU', 'USD', 'ROM', 'UDOW', 'TMF', 'UGL', 'BITX']);
const INV_US = new Set(['SQQQ', 'SOXS', 'SPXU', 'SDS', 'SH', 'PSQ', 'SPXS', 'TZA', 'TMV', 'TBT', 'SDOW', 'DOG', 'QID']);
export function assetCats(it) {
  if (!it) return new Set();
  const out = new Set();
  const n = `${it.n || ''} ${(it.al || []).join(' ')}`;
  const g = it.g || '';
  if (g === '레버리지' || LEV_US.has(it.k) || /레버리지|2X|3X|2배|3배|울트라|ultra/i.test(n)) out.add('lev');
  if (g === '인버스' || INV_US.has(it.k) || /인버스|inverse|곰|bear/i.test(n)) out.add('inv');
  if (g === '채권' || /채권|국고채|국채|회사채|크레딧|통안채|bond|treasury/i.test(n)) out.add('bond');
  if (g === '현금성' || /머니마켓|CD금리|KOFR|단기채|초단기|단기통안|SOFR/i.test(n) || ['BIL', 'SGOV', 'SHV'].includes(it.k)) out.add('cash');
  if (g === '원자재' || /금현물|골드|금선물|은선물|원유|구리|원자재|gold|silver|oil/i.test(n) || ['GLD', 'IAU', 'SLV', 'USO', 'DBC'].includes(it.k)) out.add('cmdty');
  if (/단일종목/.test(n)) out.add('single');
  if (/커버드콜|타겟.*프리미엄|covered/i.test(n) || g === '커버드콜') out.add('cc');
  return out;
}
export const CAT_LABEL = { lev: '레버리지', inv: '인버스', bond: '채권', cash: '현금성', cmdty: '원자재·금', single: '단일종목', cc: '커버드콜' };

/** 일별 시세 → 월말 총수익지수 {yms:[YYYYMM], v:[...]}(진행 중인 달 포함) */
export function monthEndSeries(px, useTR = true) {
  const yms = [], v = [];
  const src = useTR ? px.tr : px.close;
  for (let i = 0; i < px.day.length; i++) {
    const t = new Date(px.day[i] * 864e5); const ym = t.getUTCFullYear() * 100 + t.getUTCMonth() + 1;
    if (yms.length && yms[yms.length - 1] === ym) v[v.length - 1] = src[i]; else { yms.push(ym); v.push(src[i]); }
  }
  return { yms, v };
}

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
