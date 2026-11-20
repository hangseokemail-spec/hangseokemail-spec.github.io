// 백테스트 엔진 — 순수 계산(화면과 무관). 일별로 보유 수량을 따라가며 평가합니다.
import { loadPx, loadMonthly, assetInfo } from './data.js';
import { dayToYm, ymAdd, firstDayOfYm, todayYm, ymDiff, parseYm } from './dates.js';

export const FX_KEY = 'FX_USDKRW';

/** 기본 전략 객체 */
export function defaultStrategy() {
  return {
    name: '포트폴리오 1',
    kind: 'static',              // static | rank
    assets: [],                  // [{key, w}] w: % (합 100)
    rank: null,                  // {group, metric: mcap|mom|lowvol, top, lookback, skip, weighting: equal|mcap|invvol}
    start: null, end: null,      // 'YYYY-MM' (포함)
    rebalance: 'A',              // none | M | Q | S | A | band
    band: { abs: 5, rel: 0 },    // %p, % (band일 때)
    initial: 10000000,
    flow: { amount: 0, freq: 'M', growth: 0 }, // 음수=인출, growth: 연 증가율 %
    currency: 'KRW',
    reinvest: true,
    feeBp: 0,
    benchmark: null,
  };
}

const MONTHS_OF = { M: null, Q: [3, 6, 9, 12], S: [6, 12], A: [12] };
function isScheduled(freq, ym) {
  if (freq === 'M') return true;
  const arr = MONTHS_OF[freq];
  return arr ? arr.includes(ym % 100) : false;
}

/** 전략 실행: 필요한 데이터를 내려받고 시뮬레이션 */
export async function runBacktest(strat, { onProgress } = {}) {
  const s = { ...defaultStrategy(), ...strat };
  s.flow = { ...defaultStrategy().flow, ...(strat.flow || {}) };
  s.feeBp = +s.feeBp || 0;
  s.band = { ...defaultStrategy().band, ...(strat.band || {}) };
  if (s.kind === 'rank') return runRank(s, onProgress);
  return runStatic(s, onProgress);
}

async function loadMany(keys, onProgress) {
  const out = {};
  let done = 0;
  await Promise.all(keys.map(async (k) => {
    out[k] = await loadPx(k);
    done++;
    onProgress?.(done, keys.length);
  }));
  return out;
}

function currencyOf(key) {
  const a = assetInfo(key);
  return a?.cur || (/^\d{6}$|^[0-9A-Z]{6}$/.test(key) && /\d/.test(key) ? 'KRW' : 'USD');
}

/** 마지막으로 완결된 달(진행 중인 이번 달은 제외) */
function lastCompleteYm(lastDay) {
  const ym = dayToYm(lastDay);
  return ym >= todayYm() ? ymAdd(todayYm(), -1) : ym;
}

/** 여러 시계열을 합집합 달력에 맞춰 기준통화 가격 배열로 */
export function alignSeries(pxs, keys, base, fx, fromDay, toDay, useTR) {
  const set = new Set();
  for (const k of keys) {
    const p = pxs[k];
    for (let i = 0; i < p.day.length; i++) {
      const d = p.day[i];
      if (d >= fromDay && d <= toDay) set.add(d);
    }
  }
  const days = Int32Array.from([...set].sort((a, b) => a - b));
  const fxArr = fx ? ffill(fx, fx.close, days) : null;
  const prices = keys.map((k) => {
    const p = pxs[k];
    const arr = ffill(p, useTR ? p.tr : p.close, days);
    const cur = currencyOf(k);
    if (cur !== base && fxArr) {
      for (let i = 0; i < arr.length; i++) arr[i] = cur === 'USD' ? arr[i] * fxArr[i] : arr[i] / fxArr[i];
    }
    return arr;
  });
  return { days, prices, fx: fxArr };
}

/** 직전값 채움. 첫 거래일 이전은 NaN */
export function ffill(p, vals, days) {
  const out = new Float64Array(days.length);
  let j = -1;
  for (let i = 0; i < days.length; i++) {
    while (j + 1 < p.day.length && p.day[j + 1] <= days[i]) j++;
    out[i] = j >= 0 ? vals[j] : NaN;
  }
  return out;
}

/** 월말 거래일 위치(달력 안에서 각 달의 마지막 날) */
function monthEnds(days) {
  const idx = [];
  for (let i = 0; i < days.length; i++) {
    if (i === days.length - 1 || dayToYm(days[i + 1]) !== dayToYm(days[i])) idx.push(i);
  }
  return idx;
}

function flowPctOf(s) {
  return s.flow?.type === 'withdrawPct' ? (+s.flow.pct || 0) / 100 / ({ M: 12, Q: 4, A: 1 }[s.flow.freq] || 1) : 0;
}
function buildFlows(s, days, mEnds) {
  const flows = new Float64Array(days.length);
  const amt = s.flow?.type === 'withdrawPct' ? -1 : +s.flow?.amount || 0;
  if (!amt) return flows;
  const g = (+s.flow.growth || 0) / 100;
  const startYm = dayToYm(days[mEnds[0]]);
  for (let k = 1; k < mEnds.length; k++) {
    const i = mEnds[k];
    const ym = dayToYm(days[i]);
    if (!isScheduled(s.flow.freq || 'M', ym)) continue;
    const years = Math.floor(ymDiff(startYm, ym) / 12 - 1e-9);
    flows[i] = amt * Math.pow(1 + g, Math.max(0, Math.floor((ymDiff(startYm, ym) - 1) / 12)));
    void years;
  }
  return flows;
}

// ------------------------------------------------------------------ 고정 비중
async function runStatic(s, onProgress) {
  const assets = s.assets.filter((a) => a.key && +a.w > 0);
  if (!assets.length) throw new Error('자산을 하나 이상 넣어 주세요.');
  const keys = assets.map((a) => a.key);
  const needFx = keys.some((k) => currencyOf(k) !== s.currency);
  const all = needFx ? [...keys, FX_KEY] : keys;
  const pxs = await loadMany(all, onProgress);
  const notes = [];
  const sumW = assets.reduce((t, a) => t + +a.w, 0);
  const W = Float64Array.from(assets.map((a) => +a.w / sumW));
  if (Math.abs(sumW - 100) > 0.01) notes.push(`비중 합이 ${round2(sumW)}%라서 100%로 맞춰 계산했습니다.`);

  // 공통 시작: 가장 늦게 시작한 자산 기준
  let commonFirst = Math.max(...keys.map((k) => pxs[k].day[0]));
  if (needFx) commonFirst = Math.max(commonFirst, pxs[FX_KEY].day[0]);
  const commonLast = Math.min(...all.map((k) => pxs[k].day[pxs[k].day.length - 1]));
  const earliest = ymAdd(dayToYm(commonFirst), 1);
  let startYm = s.start ? parseYm(s.start) : earliest;
  if (startYm < earliest) {
    const late = keys.reduce((a, k) => (pxs[k].day[0] > pxs[a].day[0] ? k : a), keys[0]);
    notes.push(`${nameOf(late)} 데이터가 ${fmtYm(dayToYm(pxs[late].day[0]))}부터 있어서 시작을 ${fmtYm(earliest)}로 늦췄습니다.`);
    startYm = earliest;
  }
  let endYm = s.end ? parseYm(s.end) : lastCompleteYm(commonLast);
  endYm = Math.min(endYm, lastCompleteYm(commonLast));
  if (endYm < startYm) throw new Error('기간이 너무 짧습니다. 시작·끝 달을 확인해 주세요.');

  const fromDay = firstDayOfYm(startYm) - 20; // 앵커(직전 달 마지막 거래일) 포함용
  const toDay = firstDayOfYm(ymAdd(endYm, 1)) - 1;
  const al = alignSeries(pxs, keys, s.currency, needFx ? pxs[FX_KEY] : null, fromDay, toDay, s.reinvest !== false);
  // 앵커: 시작 달 이전 마지막 거래일
  const startDay = firstDayOfYm(startYm);
  let a0 = 0;
  for (let i = 0; i < al.days.length; i++) if (al.days[i] < startDay) a0 = i;
  const days = al.days.slice(a0);
  const prices = al.prices.map((p) => p.slice(a0));
  const mEnds = monthEnds(days);
  if (mEnds[0] !== 0) mEnds.unshift(0);
  const flows = buildFlows(s, days, mEnds);
  const targets = new Map();
  targets.set(0, W);
  if (s.rebalance !== 'none' && s.rebalance !== 'band') {
    for (let k = 1; k < mEnds.length; k++) {
      const i = mEnds[k];
      if (isScheduled(s.rebalance, dayToYm(days[i])) && i !== days.length - 1) targets.set(i, W);
    }
  }
  const isMonthEnd = new Uint8Array(days.length); mEnds.forEach((i) => { isMonthEnd[i] = 1; });
  const sim = simulate({ days, prices, targets, flows, s, W, flowPct: flowPctOf(s), isMonthEnd });
  return finish(s, sim, { keys, days, prices, mEnds, notes, startYm, endYm, flows: sim.flowsApplied || flows });
}

// ------------------------------------------------------------------ 순위 전략
async function runRank(s, onProgress) {
  const r = { group: 'US_STOCK', metric: 'mcap', top: 3, lookback: 12, skip: 0, weighting: 'equal', ...(s.rank || {}) };
  const tbl = await loadMonthly(r.group);
  const notes = [];
  const M = tbl.months;
  const mi = new Map(M.map((m, i) => [m, i]));
  const val = (arr, ti, m) => {
    const j = m - tbl.o[ti];
    return j >= 0 && j < arr[ti].length ? arr[ti][j] : null;
  };
  const freq = ['M', 'Q', 'S', 'A'].includes(s.rebalance) ? s.rebalance : 'M';
  if (freq !== s.rebalance) notes.push('순위 전략은 정해진 주기로만 종목을 바꿀 수 있어 매월 리밸런싱으로 계산했습니다.');
  const lastTblYm = M[M.length - 1];
  let endYm = s.end ? Math.min(parseYm(s.end), lastCompleteYm(firstDayOfYm(lastTblYm))) : lastCompleteYm(firstDayOfYm(lastTblYm));
  const need = r.metric === 'mom' ? r.lookback + (r.skip || 0) : r.metric === 'lowvol' ? r.lookback : 0;
  const earliest = ymAdd(M[0], need + 1);
  let startYm = s.start ? parseYm(s.start) : ymAdd(endYm, -119);
  if (startYm < earliest) { startYm = earliest; notes.push(`데이터가 있는 ${fmtYm(earliest)}부터 계산했습니다.`); }

  // 리밸런싱 달: 앵커(시작 직전 달) + 이후 주기
  const rebMonths = [ymAdd(startYm, -1)];
  for (let ym = startYm; ym < endYm; ym = ymAdd(ym, 1)) if (isScheduled(freq, ym)) rebMonths.push(ym);
  const picks = new Map();
  const used = new Set();
  for (const ym of rebMonths) {
    const m = mi.get(ym);
    if (m === undefined) continue;
    const cand = [];
    for (let ti = 0; ti < tbl.tickers.length; ti++) {
      const tr = val(tbl.tr, ti, m);
      if (tr == null) continue;
      let score = null;
      if (r.metric === 'mcap') score = val(tbl.mc, ti, m);
      else if (r.metric === 'mom') {
        const a = val(tbl.tr, ti, m - (r.skip || 0));
        const b = val(tbl.tr, ti, m - (r.skip || 0) - r.lookback);
        if (a != null && b != null) score = a / b - 1;
      } else if (r.metric === 'lowvol') {
        // 최근 L개월 월간 수익률의 표준편차(연환산)가 낮을수록 위
        const L = r.lookback || 12, rs = [];
        for (let q = m - L + 1; q <= m; q++) {
          const a = val(tbl.tr, ti, q), b = val(tbl.tr, ti, q - 1);
          if (a == null || b == null) { rs.length = 0; break; }
          rs.push(a / b - 1);
        }
        if (rs.length === L && L > 1) {
          const mu = rs.reduce((t, x) => t + x, 0) / L;
          score = -Math.sqrt(rs.reduce((t, x) => t + (x - mu) ** 2, 0) / (L - 1)) * Math.sqrt(12);
        }
      }
      if (score == null || !isFinite(score)) continue;
      cand.push({ k: tbl.tickers[ti], score, mc: val(tbl.mc, ti, m), vol: val(tbl.vol, ti, m) });
    }
    const ex = new Set(r.exclude || []);
    const pool = cand.filter((c) => !ex.has(c.k));
    pool.sort((a, b) => b.score - a.score || (a.k < b.k ? -1 : 1));
    const sel = pool.slice(Math.max(0, (r.from || 1) - 1), r.top);
    if (!sel.length) continue;
    let w;
    if (r.weighting === 'mcap' && sel.every((x) => x.mc)) {
      const t = sel.reduce((a, x) => a + x.mc, 0); w = sel.map((x) => x.mc / t);
    } else if (r.weighting === 'invvol' && sel.every((x) => x.vol)) {
      const t = sel.reduce((a, x) => a + 1 / x.vol, 0); w = sel.map((x) => 1 / x.vol / t);
    } else w = sel.map(() => 1 / sel.length);
    if (r.maxW) w = capWeights(w, r.maxW / 100);
    picks.set(ym, sel.map((x, i) => ({ key: x.k, w: w[i], score: x.score, mc: x.mc })));
    sel.forEach((x) => used.add(x.k));
  }
  if (!picks.size) throw new Error('조건에 맞는 종목을 찾지 못했습니다.');
  const keys = [...used];
  const needFx = keys.some((k) => currencyOf(k) !== s.currency);
  const all = needFx ? [...keys, FX_KEY] : keys;
  const pxs = await loadMany(all, onProgress);
  const fromDay = firstDayOfYm(startYm) - 20;
  const toDay = firstDayOfYm(ymAdd(endYm, 1)) - 1;
  const al = alignSeries(pxs, keys, s.currency, needFx ? pxs[FX_KEY] : null, fromDay, toDay, s.reinvest !== false);
  const startDay = firstDayOfYm(startYm);
  let a0 = 0;
  for (let i = 0; i < al.days.length; i++) if (al.days[i] < startDay) a0 = i;
  const days = al.days.slice(a0);
  const prices = al.prices.map((p) => p.slice(a0));
  const mEnds = monthEnds(days);
  if (mEnds[0] !== 0) mEnds.unshift(0);
  const kIndex = new Map(keys.map((k, i) => [k, i]));
  const targets = new Map();
  const history = [];
  for (const i of mEnds) {
    const ym = dayToYm(days[i]);
    const pk = picks.get(ym);
    if (!pk || (i === days.length - 1 && i !== 0)) continue;
    const W = new Float64Array(keys.length);
    pk.forEach((p) => { W[kIndex.get(p.key)] = p.w; });
    targets.set(i, W);
    history.push({ ym, picks: pk });
  }
  const sim = simulate({ days, prices, targets, flows: buildFlows(s, days, mEnds), s, W: targets.get(0), flowPct: flowPctOf(s) });
  const res = finish(s, sim, { keys, days, prices, mEnds, notes, startYm, endYm, flows: sim.flowsApplied });
  res.rankHistory = history;
  res.notes.push(rankDisclaimer(r));
  return res;
}

/** 상한 초과분을 나머지에 비례 재배분(반복) */
export function capWeights(w, cap) {
  const out = w.slice();
  if (cap * out.length < 1 - 1e-12) return out.map(() => 1 / out.length);
  for (let it = 0; it < 100; it++) {
    let excess = 0, free = 0;
    for (let i = 0; i < out.length; i++) { if (out[i] > cap) { excess += out[i] - cap; out[i] = cap; } else if (out[i] < cap) free += out[i]; }
    if (excess < 1e-12) break;
    for (let i = 0; i < out.length; i++) if (out[i] < cap) out[i] += excess * (out[i] / free);
  }
  return out;
}

function rankDisclaimer(r) {
  const base = '순위 전략은 지금 수집 목록(현재 대형주 중심)에 있는 종목만 후보로 삼아, 과거에 상장폐지·탈락한 종목이 빠져 있습니다(생존 편향).';
  if (r.metric === 'mcap') return `${base} 과거 시가총액은 종가×상장주식수로 추정하며, 과거 주식수가 없는 기간은 가장 오래된 주식수를 씁니다.`;
  return base;
}

// ------------------------------------------------------------------ 시뮬레이션 코어
/**
 * days: Int32Array, prices: Float64Array[] (기준통화, 총수익 또는 가격)
 * targets: Map<dayIndex, Float64Array 비중>, flows: Float64Array(그날 종가 뒤 입출금)
 */
export function simulate({ days, prices, targets, flows, s, W, flowPct = 0, isMonthEnd = null }) {
  const n = days.length, m = prices.length;
  const sh = new Float64Array(m);
  const value = new Float64Array(n);       // 입출금 반영 후
  const twr = new Float64Array(n);
  const invested = new Float64Array(n);
  const weights = [];
  let tgt = W || targets.get(0);
  const feeRate = (+s.feeBp || 0) / 10000;
  let trades = 0, turnover = 0, depleted = -1;
  const contrib = new Float64Array(m); // 수익 기여(가중 일간 수익 합)
  const flowsApplied = new Float64Array(n);
  const rebDays = [];

  const valueAt = (i) => { let v = 0; for (let j = 0; j < m; j++) if (sh[j]) v += sh[j] * prices[j][i]; return v; };
  const rebalanceTo = (i, w, V, charge = true) => {
    let to = 0;
    for (let j = 0; j < m; j++) {
      const p = prices[j][i];
      const want = w[j] > 0 && p > 0 ? (V * w[j]) / p : 0;
      to += Math.abs(want - sh[j]) * (p > 0 ? p : 0);
      sh[j] = want;
    }
    if (charge && feeRate && to > 0) {
      const fee = to * feeRate;
      const k = (V - fee) / V;
      for (let j = 0; j < m; j++) sh[j] *= k;
    }
    trades++; turnover += V > 0 ? to / V / 2 : 0;
    rebDays.push(i);
  };

  // 0일: 초기 투자(매수 비용이 있으면 첫 기간 기준값은 비용을 뺀 금액)
  const V0 = +s.initial || 0;
  rebalanceTo(0, tgt, V0, false); // 첫 매수에는 비용을 물리지 않음(PV와 같음)
  trades = 0; turnover = 0; rebDays.length = 0;
  value[0] = valueAt(0); twr[0] = 1; invested[0] = V0;
  let prevV = value[0];
  let feeTotal = V0 - value[0];

  for (let i = 1; i < n; i++) {
    // 수익 기여: 전일 비중 × 오늘 자산 수익
    if (prevV > 0) {
      for (let j = 0; j < m; j++) {
        if (!sh[j]) continue;
        const p0 = prices[j][i - 1], p1 = prices[j][i];
        if (p0 > 0 && p1 > 0) contrib[j] += (sh[j] * p0 / prevV) * (p1 / p0 - 1);
      }
    }
    let V = valueAt(i);
    let f = flows[i] || 0;
    if (flowPct && f) f = -flowPct * V; // 정률 인출: 그날 평가액의 x%
    const newT = targets.get(i);
    if (newT) tgt = newT;
    let fApplied = f;
    if (f) {
      if (V + f <= 0) { // 고갈: 남은 돈을 다 꺼내고 끝
        fApplied = -V;
        for (let j = 0; j < m; j++) sh[j] = 0;
        V = 0; if (depleted < 0) depleted = i;
      } else if (newT) {
        V += f;
      } else if (f > 0) { // 적립: 목표 비중대로 매수
        for (let j = 0; j < m; j++) { const p = prices[j][i]; if (tgt[j] > 0 && p > 0) sh[j] += (f * tgt[j]) / p; }
        V += f;
      } else { // 인출: 현재 비중대로 매도
        const k = (V + f) / V;
        for (let j = 0; j < m; j++) sh[j] *= k;
        V += f;
      }
    }
    if (V > 0) {
      const before = V;
      if (newT) rebalanceTo(i, tgt, V);
      else if (s.rebalance === 'band' && i < n - 1 && (s.band?.daily !== false || isMonthEnd?.[i]) && bandBreached(sh, prices, i, V, tgt, s.band)) rebalanceTo(i, tgt, V);
      feeTotal += before - valueAt(i) > 1e-9 ? before - valueAt(i) : 0;
    }
    flowsApplied[i] = fApplied;
    invested[i] = invested[i - 1] + fApplied;
    value[i] = valueAt(i);
    // 시간가중수익률: (기말 평가액 − 그날 입출금) / 전기 평가액 (비용은 그 기간 수익에 포함)
    twr[i] = prevV > 0 ? twr[i - 1] * ((value[i] - fApplied) / prevV) : twr[i - 1];
    prevV = value[i];
    if (depleted >= 0 && i > depleted) { twr[i] = twr[depleted]; }
  }
  // 마지막 날 보유 비중
  const Vn = value[n - 1];
  for (let j = 0; j < m; j++) weights.push(Vn > 0 ? (sh[j] * prices[j][n - 1]) / Vn : 0);
  return { value, twr, invested, weights, trades, turnover, contrib, depleted, rebDays, feeTotal, flowsApplied };
}

export function bandBreached(sh, prices, i, V, tgt, band) {
  const abs = (+band.abs || 0) / 100, rel = (+band.rel || 0) / 100, cap = (+band.cap || 0) / 100;
  for (let j = 0; j < sh.length; j++) {
    const w = (sh[j] * prices[j][i]) / V;
    const d = Math.abs(w - tgt[j]);
    if (cap && w > cap + 1e-12) return true;
    if (abs && d > abs + 1e-12) return true;
    if (rel && tgt[j] > 0 && d / tgt[j] > rel + 1e-12) return true;
  }
  return false;
}

function finish(s, sim, ctx) {
  const { days, prices, mEnds, keys } = ctx;
  const monthly = mEnds.map((i) => ({ i, ym: dayToYm(days[i]), v: sim.value[i], t: sim.twr[i], inv: sim.invested[i] }));
  // 자산별 월말 지수(같은 기준통화)
  const assetMonthly = keys.map((k, j) => mEnds.map((i) => prices[j][i]));
  return {
    strategy: s,
    keys,
    days,
    value: sim.value,
    twr: sim.twr,
    invested: sim.invested,
    flows: ctx.flows,
    monthly,
    assetMonthly,
    assetDaily: prices,
    finalWeights: sim.weights,
    contrib: sim.contrib,
    trades: sim.trades,
    turnover: sim.turnover,
    depletedDay: sim.depleted >= 0 ? days[sim.depleted] : null,
    rebDays: sim.rebDays,
    startYm: ctx.startYm,
    endYm: ctx.endYm,
    notes: ctx.notes,
  };
}

function nameOf(k) { return assetInfo(k)?.n || k; }
function fmtYm(ym) { return `${Math.floor(ym / 100)}년 ${ym % 100}월`; }
function round2(x) { return Math.round(x * 100) / 100; }
