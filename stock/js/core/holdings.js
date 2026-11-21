// 내 자산: 저장 구조, 평가, 배당 추정, 위험 점검 규칙(문제 → 다시 계산한 구체 대안)
import { store } from '../ui/dom.js';
import { assetInfo, loadPx, loadKrAll, getUniverse, searchAssets, norm } from './data.js';
import { runBacktest } from './engine.js';
import { computeMetrics, monthlyReturns } from './metrics.js';
import { todayYm, ymAdd, ymToIso } from './dates.js';

export const ACCOUNT_TYPES = [['pension', '연금저축'], ['isa', 'ISA'], ['irp', 'IRP'], ['dc', '퇴직연금 DC'], ['general', '일반(국내)'], ['overseas', '해외주식'], ['cma', 'CMA·현금'], ['other', '기타']];
export const typeLabel = (t) => ACCOUNT_TYPES.find((x) => x[0] === t)?.[1] || t;

export function loadHoldings() {
  const h = store('ss.holdings') || { accounts: [], holdings: [] };
  h.accounts ||= []; h.holdings ||= [];
  return h;
}
export function saveHoldings(h) { store('ss.holdings', h); }
export const uid = () => Math.random().toString(36).slice(2, 9);

let krAll = null;
export async function ensureKrAll() {
  if (krAll) return krAll;
  try {
    const j = await loadKrAll();
    krAll = new Map();
    for (const [code, name, ex, price] of j.stocks) krAll.set(code, { k: code, n: name, price, t: 'stock', m: 'KR', cur: 'KRW' });
    for (const [code, name, price] of j.etfs) if (!krAll.has(code)) krAll.set(code, { k: code, n: name, price, t: 'etf', m: 'KR', cur: 'KRW' });
  } catch { krAll = new Map(); }
  return krAll;
}
/** 이름·티커 → 종목 찾기(유니버스 먼저, 없으면 국내 전 종목 목록) */
export function matchName(name, ticker) {
  const U = getUniverse();
  if (ticker) {
    const t = String(ticker).toUpperCase().replace(/\.(KS|KQ)$/, '');
    if (U.byKey.has(t)) return { k: t, score: 1 };
    if (krAll?.has(t)) return { k: t, score: 0.95, krOnly: true };
  }
  if (!name) return null;
  const hit = searchAssets(name, 1)[0];
  const n = norm(name);
  if (hit && (norm(hit.n) === n || hit.k.toLowerCase() === n)) return { k: hit.k, score: 1 };
  if (krAll) {
    for (const [k, v] of krAll) if (norm(v.n) === n) return { k, score: 0.95, krOnly: !U.byKey.has(k) };
    let best = null;
    for (const [k, v] of krAll) { const vn = norm(v.n); if (vn.includes(n) || n.includes(vn)) { const s = Math.min(vn.length, n.length) / Math.max(vn.length, n.length); if (!best || s > best.score) best = { k, score: 0.5 + s * 0.4, krOnly: !U.byKey.has(k) }; } }
    if (best && best.score > 0.7) return best;
  }
  return hit ? { k: hit.k, score: 0.6 } : null;
}

export function infoOf(key) { return assetInfo(key) || krAll?.get(key) || null; }
// 환율: 기본은 시세 DB의 최근 값. '지금 환율로 다시 계산'을 누르면 그 순간 가장 최신 값을 골라 고정한다.
let fxPicked = null;
export function fxNow() {
  if (fxPicked) return fxPicked;
  const f = assetInfo('FX_USDKRW');
  return { now: f?.p || 1400, prev: f?.pp || f?.p || 1400, date: f?.e || null, src: '시세 DB', at: null };
}
const ymdNum = (d) => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
/** 버튼을 누른 순간의 환율: 시세 DB 다시 받기 + 공개 환율 API 중 날짜가 더 최신인 값 */
export async function refreshFx() {
  const base = fxNow();
  const cands = [];
  try {
    const r = await fetch(new URL(`../../data/universe.json?t=${Date.now()}`, import.meta.url), { cache: 'no-store' });
    const j = await r.json();
    const it = (j.items || []).find((x) => x.k === 'FX_USDKRW');
    if (it?.p) cands.push({ now: it.p, prev: it.pp || it.p, date: it.e || null, src: '시세 DB' });
  } catch { /* 오프라인 */ }
  try {
    const r = await fetch('https://open.er-api.com/v6/latest/USD', { cache: 'no-store' });
    const j = await r.json();
    const k = j?.rates?.KRW;
    if (k > 0) cands.push({ now: Math.round(k * 100) / 100, prev: base.prev, date: j.time_last_update_unix ? ymdNum(new Date(j.time_last_update_unix * 1000)) : null, src: '공개 환율(open.er-api)' });
  } catch { /* 막힘 */ }
  const best = cands.sort((a, b) => (b.date || 0) - (a.date || 0))[0] || base;
  fxPicked = { ...best, at: Date.now() };
  return fxPicked;
}

/** 종목 노출 분류(국가·통화·자산군·섹터) */
export function exposure(key, name = '') {
  const it = infoOf(key) || {};
  const n = it.n || name || '';
  const usLike = /(미국|나스닥|S&P|다우|필라델피아|글로벌|선진국|빅테크|테크TOP|AI|월드|전세계)/i.test(n);
  const hedged = /\(H\)|헤지/.test(n);
  const bond = /(채권|국고채|국채|단기채|회사채|금리|CD|KOFR|머니마켓|MMF|BND|AGG|TLT|IEF|SHY|BIL|SGOV|LQD|HYG|TIP)/i.test(n) || ['BND', 'AGG', 'TLT', 'IEF', 'SHY', 'BIL', 'SGOV', 'LQD', 'HYG', 'TIP', 'BNDX', 'VBMFX', 'VUSTX'].includes(key);
  const mixed = /혼합/.test(n);
  let country, fx, cls;
  if (it.m === 'US') { country = /^(VT|VXUS|VEA|EFA|VWO|EEM|IXN|BNDX|VGTSX)$/.test(key) ? '해외(미국 외)' : '미국'; fx = 'USD'; }
  else if (it.m === 'KR') { country = it.t === 'etf' && usLike ? '미국(국내상장)' : '한국'; fx = it.t === 'etf' && usLike && !hedged ? 'USD' : 'KRW'; }
  else { country = '기타'; fx = 'KRW'; }
  cls = key === 'CASH_KRW' || key === 'CASH_USD' ? '현금' : bond ? '채권·현금성' : mixed ? '혼합' : it.t === 'etf' || it.t === 'fund' ? 'ETF' : '개별주';
  const sector = cls === '개별주' ? (it.m === 'KR' ? '국내 주식' : it.g || '기타') : cls === 'ETF' ? (it.m === 'KR' ? (usLike ? '해외 ETF(국내상장)' : '국내 ETF') : '미국 ETF') : cls;
  return { country, fx, cls, sector, hedged };
}

/** 평가: 필터(owner, accountId) 적용 */
export function valuate(h, filter = {}) {
  const fx = fxNow();
  const accs = h.accounts.filter((a) => (!filter.owner || filter.owner === 'all' || a.owner === filter.owner) && (!filter.account || a.id === filter.account));
  const accIds = new Set(accs.map((a) => a.id));
  const rows = [];
  for (const x of h.holdings) {
    if (!accIds.has(x.account)) continue;
    const it = infoOf(x.key);
    const cur = x.cur || it?.cur || 'KRW';
    const price = x.manualPrice || it?.p || it?.price || null;
    const prev = it?.pp || price;
    const rate = cur === 'USD' ? fx.now : 1, ratePrev = cur === 'USD' ? fx.prev : 1;
    const value = price != null ? x.qty * price * rate : (x.value || 0);
    const cost = x.avg ? x.qty * x.avg * rate : null;
    const dayChange = price != null && prev != null ? x.qty * (price * rate - prev * ratePrev) : 0;
    rows.push({ ...x, name: it?.n || x.name || x.key, cur, price, prev, value, cost, pl: cost != null ? value - cost : null, dayChange, dayPct: prev ? price / prev - 1 : null, inDb: !!assetInfo(x.key), exp: exposure(x.key, x.name) });
  }
  for (const a of accs) {
    for (const [c, amt] of Object.entries(a.cash || {})) {
      if (!amt) continue;
      const v = c === 'USD' ? amt * fx.now : amt;
      rows.push({ id: `cash-${a.id}-${c}`, account: a.id, key: `CASH_${c}`, name: c === 'USD' ? '달러 현금' : '원화 현금', qty: amt, cur: c, price: 1, value: v, cost: v, pl: 0, dayChange: c === 'USD' ? amt * (fx.now - fx.prev) : 0, isCash: true, exp: { country: c === 'USD' ? '미국' : '한국', fx: c, cls: '현금', sector: '현금' } });
    }
  }
  const total = rows.reduce((t, r) => t + r.value, 0);
  rows.forEach((r) => { r.weight = total ? r.value / total : 0; });
  rows.sort((a, b) => b.value - a.value);
  const cost = rows.reduce((t, r) => t + (r.cost ?? r.value), 0);
  const day = rows.reduce((t, r) => t + r.dayChange, 0);
  // 수익률은 평균단가를 아는 종목만으로(모르는 종목을 0%로 섞으면 수익률이 묽어짐)
  const known = rows.filter((r) => !r.isCash && r.cost != null && r.cost > 0);
  const kCost = known.reduce((t, r) => t + r.cost, 0), kVal = known.reduce((t, r) => t + r.value, 0);
  const noAvg = rows.filter((r) => !r.isCash && r.cost == null).length;
  // 통화별 합계(종목이 거래되는 통화 기준: 미국 상장·달러 현금 = 달러, 나머지 = 원화)
  const usdKRW = rows.filter((r) => r.cur === 'USD').reduce((t, r) => t + r.value, 0);
  const byCur = { KRW: total - usdKRW, USDinKRW: usdKRW, USD: usdKRW / fx.now };
  return { rows, total, cost, pl: kVal - kCost, plPct: kCost ? kVal / kCost - 1 : null, plCoverage: { n: known.length, noAvg }, day, dayPct: total - day ? day / (total - day) : null, accounts: accs, fx, byCur };
}

/** 같은 종목 합치기(계좌 무관) */
export function mergeByKey(rows) {
  const m = new Map();
  for (const r of rows) {
    const k = r.isCash ? r.key : r.key || r.name;
    const o = m.get(k);
    if (o) { o.value += r.value; o.qty += r.qty; o.cost = (o.cost ?? 0) + (r.cost ?? 0); o.dayChange += r.dayChange; o.weight += r.weight; o.accounts.push(r.account); }
    else m.set(k, { ...r, accounts: [r.account] });
  }
  return [...m.values()].sort((a, b) => b.value - a.value);
}

/** 배당: 최근 1년 배당 이벤트로 연간·월별 예상 */
export async function dividendForecast(rows) {
  const fx = fxNow();
  const byMonth = Array(12).fill(0);
  const events = [];
  let annual = 0;
  const today = new Date();
  const yearAgo = today.getTime() / 864e5 - 365;
  for (const r of rows) {
    if (r.isCash || !r.inDb) continue;
    let px;
    try { px = await loadPx(r.key); } catch { continue; }
    const rate = r.cur === 'USD' ? fx.now : 1;
    for (let i = 0; i < px.day.length; i++) {
      if (!px.div[i] || px.day[i] < yearAgo) continue;
      const amt = px.div[i] * r.qty * rate;
      const d = new Date(px.day[i] * 864e5);
      const next = new Date(d.getTime() + 365 * 864e5);
      byMonth[next.getMonth()] += amt;
      annual += amt;
      events.push({ key: r.key, name: r.name, account: r.account, accounts: r.accounts, date: next, amt, perShare: px.div[i], cur: r.cur });
    }
  }
  events.sort((a, b) => a.date - b.date);
  return { annual, byMonth, events };
}

// ------------------------------------------------------------------ 위험 점검
const STRESS = [
  { name: '2020 코로나 급락', from: '2020-02-19', to: '2020-03-23' },
  { name: '2022 금리 인상기', from: '2022-01-03', to: '2022-10-14' },
  { name: '2025 관세 충격', from: '2025-02-19', to: '2025-04-08' },
  { name: '2018 4분기 급락', from: '2018-10-03', to: '2018-12-24' },
];
// 국내상장 해외 ETF의 과거 구간 대용(상장 전 구간용)
const PROXY = [[/나스닥100/, 'QQQ'], [/S&P500|S&P 500/, 'SPY'], [/필라델피아|미국반도체|반도체/, 'SOXX'], [/배당다우존스/, 'SCHD'], [/글로벌AI|AI인공지능|테크TOP10|빅테크/, 'QQQ'], [/코스피|200/, '069500'], [/채권혼합/, 'AGG']];
const US_PROXY = { QQQM: 'QQQ', VOO: 'SPY', IVV: 'SPY', SPLG: 'SPY', JEPQ: 'QQQ', SGOV: 'BIL', SOXL: 'SOXX', DRAM: 'SMH' };
export function proxyOf(key) {
  if (US_PROXY[key]) return US_PROXY[key];
  const it = infoOf(key);
  if (!it || it.m !== 'KR' || it.t !== 'etf') return null;
  for (const [re, p] of PROXY) if (re.test(it.n)) return p;
  return null;
}

const dayNum = (iso) => Math.round(Date.parse(iso) / 864e5);
async function windowReturn(key, from, to) {
  const px = await loadPx(key);
  const d0 = dayNum(from), d1 = dayNum(to);
  let i0 = -1, i1 = -1;
  for (let i = 0; i < px.day.length; i++) { if (px.day[i] <= d0) i0 = i; if (px.day[i] <= d1) i1 = i; }
  if (i0 < 0 || px.day[0] > d0 + 5) return null;
  return px.tr[i1] / px.tr[i0] - 1;
}
/** 위기 구간 손실률(원화 기준 근사: 각 자산 현지 통화 총수익률 × 환율 변화) */
export async function stressTest(weights) {
  const out = [];
  for (const s of STRESS) {
    let r = 0, covered = 0;
    const used = [];
    const fxr = await windowReturn('FX_USDKRW', s.from, s.to).catch(() => 0) || 0;
    for (const w of weights) {
      if (w.key?.startsWith('CASH_')) { r += w.w * (w.key === 'CASH_USD' ? fxr : 0); covered += w.w; continue; }
      let key = w.key, est = false;
      let ret = assetInfo(key) ? await windowReturn(key, s.from, s.to).catch(() => null) : null;
      if (ret == null) { const p = proxyOf(key); if (p) { ret = await windowReturn(p, s.from, s.to).catch(() => null); key = p; est = true; } }
      if (ret == null) continue;
      const cur = assetInfo(key)?.cur || 'KRW';
      const krw = cur === 'USD' ? (1 + ret) * (1 + fxr) - 1 : ret;
      r += w.w * krw; covered += w.w;
      if (est) used.push(`${infoOf(w.key)?.n}→${key}`);
    }
    out.push({ ...s, ret: covered ? r / covered : null, covered, proxies: used });
  }
  return out;
}

/** 현재 비중 → 백테스트용(유니버스에 있고 기간이 충분한 종목만) */
export function toBacktestAssets(rows, minStartYm = null) {
  const items = [];
  const skipped = [];
  for (const r of rows) {
    if (r.isCash) { items.push({ key: r.cur === 'USD' ? 'BIL' : '459580', w: r.weight * 100, cash: true }); continue; }
    if (!r.inDb) { skipped.push(r.name); continue; }
    const s = assetInfo(r.key)?.s;
    if (minStartYm && s && Math.floor(s / 100) > minStartYm) {
      const p = proxyOf(r.key);
      if (p) { items.push({ key: p, w: r.weight * 100, proxyFor: r.key }); continue; }
      skipped.push(r.name); continue;
    }
    items.push({ key: r.key, w: r.weight * 100 });
  }
  const merged = [];
  for (const a of items) { const f = merged.find((x) => x.key === a.key); if (f) f.w += a.w; else merged.push({ ...a }); }
  const t = merged.reduce((s, a) => s + a.w, 0) || 1;
  return { assets: merged.map((a) => ({ ...a, w: +(a.w * 100 / t).toFixed(2) })), skipped };
}

async function quickBacktest(assets, years = 3) {
  const end = ymAdd(todayYm(), -1);
  const res = await runBacktest({ kind: 'static', assets, start: ymToIso(ymAdd(end, -years * 12 + 1)), end: ymToIso(end), rebalance: 'A', currency: 'KRW', initial: 10000000 });
  return { res, m: computeMetrics(res, null, 0) };
}

/** 위험 점검 → 카드 [{id, level, title, why, alt:{label, weights(after)}, before/after 수치}] */
export async function riskCheck(view, cfg) {
  const rows = mergeByKey(view.rows).filter((r) => r.value > 0);
  const W = rows.map((r) => ({ key: r.key, name: r.name, w: r.weight, cls: r.exp.cls, fx: r.exp.fx, sector: r.exp.sector, isCash: r.isCash }));
  const cards = [];
  const capS = (cfg.capSingle || 20) / 100, capP = (cfg.capProduct || 25) / 100;
  const startLimit = ymAdd(todayYm(), -37);
  const asBT = (ws) => toBacktestAssets(ws.map((x) => ({ ...rows.find((r) => r.key === x.key), weight: x.w })), startLimit);
  const compare = async (after) => {
    try {
      const a = asBT(W), b = asBT(after);
      const [x, y] = await Promise.all([quickBacktest(a.assets), quickBacktest(b.assets)]);
      const [sx, sy] = await Promise.all([stressTest(W), stressTest(after)]);
      const worst = (s) => Math.min(...s.map((v) => v.ret ?? 0));
      return { before: { cagr: x.m.cagr, mdd: x.m.mdd, vol: x.m.vol, stress: worst(sx) }, after: { cagr: y.m.cagr, mdd: y.m.mdd, vol: y.m.vol, stress: worst(sy) }, skipped: [...new Set([...a.skipped, ...b.skipped])] };
    } catch (e) { console.warn(e); return null; }
  };
  const capped = (cap, which) => {
    let ws = W.map((x) => ({ ...x }));
    for (let it = 0; it < 50; it++) {
      let ex = 0;
      ws.forEach((x) => { const c = which(x) ? cap(x) : 1; if (x.w > c + 1e-9) { ex += x.w - c; x.w = c; } });
      if (ex < 1e-9) break;
      const free = ws.filter((x) => !x.isCash && (!which(x) || x.w < cap(x) - 1e-9));
      const ft = free.reduce((t, x) => t + x.w, 0);
      if (!ft) break;
      free.forEach((x) => { x.w += ex * x.w / ft; });
    }
    return ws;
  };
  // R1 상한 초과
  const over = W.filter((x) => !x.isCash && x.w > (x.cls === '개별주' ? capS : capP) + 1e-9);
  if (over.length) {
    const after = capped((x) => (x.cls === '개별주' ? capS : capP), () => true);
    cards.push({ id: 'R1', level: 'warning', title: `${over.map((x) => x.name).join(', ')}이(가) 상한을 넘었어요`, why: over.map((x) => `${x.name} ${(x.w * 100).toFixed(1)}% (상한 ${((x.cls === '개별주' ? capS : capP) * 100).toFixed(0)}%)`).join(' · '), altLabel: `상한까지 줄이고 넘친 만큼 나머지에 비례로 나누기`, after, cmp: await compare(after), diff: diffText(W, after) });
  }
  // R2 집중도
  const hhi = W.reduce((t, x) => t + x.w * x.w, 0);
  const effN = hhi ? 1 / hhi : 0;
  const top3 = W.filter((x) => !x.isCash).slice(0, 3).reduce((t, x) => t + x.w, 0);
  if ((top3 > 0.5 || effN < 5) && W.length > 3 && !over.length) {
    const after = W.map((x) => ({ ...x }));
    const tops = after.filter((x) => !x.isCash).slice(0, 3);
    const cut = tops.reduce((t, x) => t + x.w * 0.2, 0);
    tops.forEach((x) => { x.w *= 0.8; });
    const rest = after.filter((x) => !x.isCash && !tops.includes(x));
    const rt = rest.reduce((t, x) => t + x.w, 0) || 1;
    rest.forEach((x) => { x.w += cut * x.w / rt; });
    const effN2 = 1 / after.reduce((t, x) => t + x.w * x.w, 0);
    cards.push({ id: 'R2', level: 'caution', title: `상위 3개가 ${(top3 * 100).toFixed(0)}%, 실제로는 ${effN.toFixed(1)}종목처럼 움직여요`, why: `${W.filter((x) => !x.isCash).length}종목을 들고 있지만 비중이 몰려 있어 유효 종목 수(1/HHI)가 ${effN.toFixed(1)}개예요.`, altLabel: `상위 3개를 각각 20%씩 줄여 나머지 보유 종목에 나누기 → 유효 종목 수 ${effN2.toFixed(1)}개`, after, cmp: await compare(after), diff: diffText(W, after) });
  }
  // R4 사실상 중복(상관 0.95 이상)
  const dup = await duplicates(W.filter((x) => !x.isCash && assetInfo(x.key)).slice(0, 12));
  if (dup) {
    const [a, b, c] = dup;
    const after = W.map((x) => ({ ...x })).filter((x) => x.key !== b.key);
    after.find((x) => x.key === a.key).w += b.w;
    cards.push({ id: 'R4', level: 'info', title: `${a.name}와 ${b.name}는 거의 똑같이 움직여요`, why: `최근 3년 월간 상관계수 ${c.toFixed(2)}. 두 개를 들고 있어도 분산 효과는 거의 없어요.`, altLabel: `${b.name}를 ${a.name}로 합치기 → 관리할 종목 1개 줄이고 그 자리를 다른 노출에 쓰기`, after, cmp: await compare(after), diff: diffText(W, after) });
  }
  // R5 통화 노출
  const usd = W.filter((x) => x.fx === 'USD').reduce((t, x) => t + x.w, 0);
  if (usd > 0.85) {
    const loss = usd * 0.1 * view.total;
    const target = 0.7;
    cards.push({ id: 'R5', level: 'info', title: `달러 노출이 ${(usd * 100).toFixed(0)}%예요`, why: `원/달러 환율이 10% 내리면 원화 평가액이 약 ${Math.round(loss / 1e4).toLocaleString('ko-KR')}만원 줄어요(주가 변화 없을 때).`, altLabel: `달러 노출 일부(${((usd - target) * 100).toFixed(0)}%p)를 환헤지(H) ETF나 국내 자산으로 바꾸면 같은 상황에서 ${Math.round((target * 0.1 * view.total) / 1e4).toLocaleString('ko-KR')}만원 감소`, fxOnly: { before: usd, after: target } });
  }
  // R6 스트레스
  const st = await stressTest(W);
  const worst = st.reduce((a, b) => ((b.ret ?? 0) < (a.ret ?? 0) ? b : a), st[0]);
  const stressCard = { id: 'R6', level: worst.ret < -0.4 ? 'warning' : 'info', title: worst.ret == null ? '과거 위기 구간 손실' : `과거 위기 때라면: ${worst.name} ${(worst.ret * 100).toFixed(1)}%`, why: `지금 비중을 그대로 과거 급락 구간에 넣어 본 손실률이에요(원화 기준, 상장 전 국내 ETF는 같은 지수 ETF로 대신 계산).`, table: st };
  if (worst.ret < -0.35 && cards[0]?.after) stressCard.altLabel = `위 첫 번째 대안을 쓰면 가장 나빴던 구간 손실이 ${(cards[0].cmp?.before.stress * 100 || 0).toFixed(1)}% → ${(cards[0].cmp?.after.stress * 100 || 0).toFixed(1)}%`;
  cards.push(stressCard);
  // R8 평균 상관 높음 → 상관 낮은 후보 10% 편입
  const avgC = await averageCorr(W.filter((x) => !x.isCash && assetInfo(x.key)).slice(0, 10));
  if (avgC != null && avgC > 0.7) {
    const pool = cfg.altStyle === 'bond' ? ['IEF', 'BND', 'XLV', 'XLP', 'USMV'] : ['XLV', 'XLP', 'USMV', 'SCHD', cfg.noCommodity ? 'GDX' : 'GLD'];
    const best = await lowestCorr(W, pool);
    if (best) {
      const after = W.map((x) => ({ ...x, w: x.w * 0.9 }));
      after.push({ key: best.key, name: assetInfo(best.key)?.n || best.key, w: 0.1, cls: 'ETF', fx: 'USD' });
      cards.push({ id: 'R8', level: 'caution', title: `보유 종목끼리 평균 상관이 ${avgC.toFixed(2)}로 높아요`, why: '떨어질 때 함께 떨어질 가능성이 커요.', altLabel: `지금과 상관이 가장 낮은 ${assetInfo(best.key)?.n}(${best.key}, 상관 ${best.c.toFixed(2)})를 10% 편입`, after, cmp: await compare(after), diff: diffText(W, after) });
    }
  }
  return { cards, effN, top3, usd, stress: st, avgCorr: avgC };
}

function diffText(a, b) {
  const m = new Map(a.map((x) => [x.key, x.w]));
  const out = [];
  for (const x of b) { const d = x.w - (m.get(x.key) || 0); if (Math.abs(d) > 0.002) out.push({ key: x.key, name: x.name, from: m.get(x.key) || 0, to: x.w }); m.delete(x.key); }
  for (const [k, w] of m) out.push({ key: k, name: a.find((x) => x.key === k)?.name || k, from: w, to: 0 });
  return out.sort((p, q) => Math.abs(q.to - q.from) - Math.abs(p.to - p.from));
}

async function monthlyOf(key, months = 36) {
  const px = await loadPx(key);
  const lv = [];
  let lastYm = null;
  for (let i = 0; i < px.day.length; i++) {
    const d = new Date(px.day[i] * 864e5); const ym = d.getUTCFullYear() * 100 + d.getUTCMonth() + 1;
    if (ym !== lastYm) { lv.push(px.tr[i]); lastYm = ym; } else lv[lv.length - 1] = px.tr[i];
  }
  return monthlyReturns(lv.slice(-months - 1));
}
function corr(x, y) {
  const n = Math.min(x.length, y.length); if (n < 12) return null;
  const a = x.slice(-n), b = y.slice(-n);
  const ma = a.reduce((t, v) => t + v, 0) / n, mb = b.reduce((t, v) => t + v, 0) / n;
  let sab = 0, saa = 0, sbb = 0; for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
  return sab / Math.sqrt(saa * sbb);
}
async function duplicates(W) {
  const R = await Promise.all(W.map((x) => monthlyOf(x.key).catch(() => [])));
  let best = null;
  for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) {
    const c = corr(R[i], R[j]);
    if (c != null && c >= 0.95 && (!best || c > best[2])) best = W[i].w >= W[j].w ? [W[i], W[j], c] : [W[j], W[i], c];
  }
  return best;
}
async function averageCorr(W) {
  if (W.length < 3) return null;
  const R = await Promise.all(W.map((x) => monthlyOf(x.key).catch(() => [])));
  let s = 0, n = 0;
  for (let i = 0; i < W.length; i++) for (let j = i + 1; j < W.length; j++) { const c = corr(R[i], R[j]); if (c != null) { s += c; n++; } }
  return n ? s / n : null;
}
async function lowestCorr(W, pool) {
  const held = W.filter((x) => !x.isCash && assetInfo(x.key));
  const R = await Promise.all(held.map((x) => monthlyOf(x.key).catch(() => [])));
  const n = Math.min(...R.map((r) => r.length).filter((l) => l >= 12));
  if (!isFinite(n)) return null;
  const port = Array.from({ length: n }, (_, i) => held.reduce((t, x, j) => t + x.w * (R[j].slice(-n)[i] || 0), 0));
  let best = null;
  for (const k of pool) {
    if (!assetInfo(k) || W.some((x) => x.key === k)) continue;
    const c = corr(port, await monthlyOf(k).catch(() => []));
    if (c != null && (!best || c < best.c)) best = { key: k, c };
  }
  return best;
}

/** 리밸런싱 도우미: 계좌별 목표 비중 대비 주문 수량 */
export function rebalanceOrders(view, h, bandPp) {
  const out = [];
  for (const acc of view.accounts) {
    const rows = view.rows.filter((r) => r.account === acc.id && !r.isCash);
    const withT = rows.filter((r) => r.target != null && r.target !== '');
    if (!withT.length) continue;
    const accTotal = view.rows.filter((r) => r.account === acc.id).reduce((t, r) => t + r.value, 0);
    for (const r of withT) {
      const w = r.value / accTotal, t = +r.target / 100;
      const dev = w - t;
      if (Math.abs(dev) * 100 <= bandPp) continue;
      const rate = r.cur === 'USD' ? view.fx.now : 1;
      const qty = r.price ? Math.round((t * accTotal - r.value) / (r.price * rate)) : null;
      out.push({ account: acc, row: r, w, t, dev, qty });
    }
  }
  return out;
}
export { STRESS };
