// 성과 지표 — 기본 정의는 Portfolio Visualizer와 같게(월간 수익률 기반) 맞춥니다.
import { dayToYm } from './dates.js';

const mean = (a) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
export function stdev(a) { // 표본표준편차
  if (a.length < 2) return NaN;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

/** 월말 지수 배열 → 월간 수익률 */
export function monthlyReturns(levels) {
  const r = [];
  for (let i = 1; i < levels.length; i++) r.push(levels[i] / levels[i - 1] - 1);
  return r;
}

export function cagrFromLevels(levels, months) {
  if (!levels.length || months <= 0) return NaN;
  return Math.pow(levels[levels.length - 1] / levels[0], 12 / months) - 1;
}

/** 낙폭 시계열과 최대낙폭 (levels: 지수) */
export function drawdown(levels) {
  let peak = -Infinity, mdd = 0, mi = 0;
  const dd = new Float64Array(levels.length);
  for (let i = 0; i < levels.length; i++) {
    if (levels[i] > peak) peak = levels[i];
    dd[i] = levels[i] / peak - 1;
    if (dd[i] < mdd) { mdd = dd[i]; mi = i; }
  }
  return { dd, mdd, at: mi };
}

/** 낙폭 구간 목록(깊은 순) */
export function drawdownEpisodes(levels, labels, top = 5) {
  const eps = [];
  let peakI = 0, inDd = false, troughI = 0;
  for (let i = 1; i < levels.length; i++) {
    if (levels[i] >= levels[peakI]) {
      if (inDd) eps.push({ start: peakI, trough: troughI, end: i, depth: levels[troughI] / levels[peakI] - 1 });
      inDd = false; peakI = i; troughI = i;
    } else {
      if (!inDd) { inDd = true; troughI = i; }
      if (levels[i] < levels[troughI]) troughI = i;
    }
  }
  if (inDd) eps.push({ start: peakI, trough: troughI, end: null, depth: levels[troughI] / levels[peakI] - 1 });
  eps.sort((a, b) => a.depth - b.depth);
  return eps.slice(0, top).map((e) => ({
    ...e,
    startL: labels[e.start], troughL: labels[e.trough], endL: e.end == null ? null : labels[e.end],
    lenDown: e.trough - e.start, lenRecover: e.end == null ? null : e.end - e.trough,
  }));
}

/** 무위험 월수익률 배열(같은 길이). rfAnnual: 숫자(연%) 또는 월말 레벨 배열 대신 연수익률 배열 */
export function rfMonthly(nMonths, rf) {
  if (rf && Array.isArray(rf.monthly)) return rf.monthly.slice(0, nMonths);
  if (Array.isArray(rf)) return rf.map((y) => Math.pow(1 + y / 100, 1 / 12) - 1);
  return Array(nMonths).fill(Math.pow(1 + (rf || 0) / 100, 1 / 12) - 1);
}

function regress(y, x) {
  const mx = mean(x), my = mean(y);
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  const beta = sxy / sxx;
  const alpha = my - beta * mx;
  const r = sxy / Math.sqrt(sxx * syy);
  return { alpha, beta, r };
}

/**
 * 결과 객체(engine) → 지표 묶음
 * bench: 같은 기간 벤치마크 결과(선택), rf: 연 무위험수익률(%) 또는 월별 연수익률 배열
 */
export function computeMetrics(res, bench = null, rf = 0) {
  const lv = res.monthly.map((m) => m.t);         // 시간가중 지수(입출금 영향 제거)
  const labels = res.monthly.map((m) => m.ym);
  const months = lv.length - 1;
  const r = monthlyReturns(lv);
  const rfm = rfMonthly(r.length, Array.isArray(rf) ? rf.slice(1) : rf);
  while (rfm.length < r.length) rfm.push(rfm[rfm.length - 1] || 0);
  const ex = r.map((x, i) => x - rfm[i]);
  const cagr = cagrFromLevels(lv, months);
  const vol = stdev(r) * Math.sqrt(12);
  const down = Math.sqrt(ex.reduce((s, x) => s + Math.min(0, x) ** 2, 0) / (ex.length || 1)) * Math.sqrt(12);
  const sharpe = (mean(ex) * 12) / (stdev(ex) * Math.sqrt(12));
  const sortino = (mean(ex) * 12) / down;
  const ddM = drawdown(lv);
  const ddD = drawdown(Array.from(res.twr));
  const years = annualReturns(res);
  const yrsFull = years.some((y) => y.full) ? years.filter((y) => y.full) : years;
  const best = yrsFull.length ? yrsFull.reduce((a, b) => (b.r > a.r ? b : a)) : null;
  const worst = yrsFull.length ? yrsFull.reduce((a, b) => (b.r < a.r ? b : a)) : null;
  const pos = r.filter((x) => x > 0).length;
  const out = {
    start: labels[1] ?? labels[0], end: labels[labels.length - 1], months,
    initial: res.monthly[0].v, final: res.monthly[res.monthly.length - 1].v,
    invested: res.monthly[res.monthly.length - 1].inv,
    totalReturn: lv[lv.length - 1] / lv[0] - 1,
    cagr, vol, sharpe, sortino, downside: down,
    mdd: ddM.mdd, mddDaily: ddD.mdd,
    mddAt: labels[ddM.at],
    calmar: calmar36(r),
    best, worst, posMonths: pos, posRatio: r.length ? pos / r.length : NaN,
    bestMonth: Math.max(...r), worstMonth: Math.min(...r),
    years, monthlyR: r, labels,
    irr: res.flows && res.flows.some((f) => f) ? moneyWeighted(res) : null,
  };
  if (bench) {
    const blv = bench.monthly.map((m) => m.t);
    const br = monthlyReturns(blv);
    const n = Math.min(br.length, r.length);
    const y = ex.slice(0, n), x = br.slice(0, n).map((v, i) => v - rfm[i]);
    const g = regress(y, x);
    const rawCorr = regress(r.slice(0, n), br.slice(0, n)).r;
    const active = r.slice(0, n).map((v, i) => v - br[i]);
    const te = stdev(active) * Math.sqrt(12);
    const bc = cagrFromLevels(blv, blv.length - 1);
    const annP = Math.pow(r.slice(0, n).reduce((t, v) => t * (1 + v), 1), 12 / n) - 1;
    const annB = Math.pow(br.slice(0, n).reduce((t, v) => t * (1 + v), 1), 12 / n) - 1;
    const upI = br.map((v, i) => [v, r[i]]).filter((p) => p[0] > 0);
    const dnI = br.map((v, i) => [v, r[i]]).filter((p) => p[0] < 0);
    const geo = (a) => Math.pow(a.reduce((s, v) => s * (1 + v), 1), 12 / (a.length || 1)) - 1;
    Object.assign(out, {
      benchCagr: bc, excessCagr: cagr - bc,
      beta: g.beta, alpha: g.alpha * 12, corr: rawCorr, r2: g.r * g.r,
      trackingError: te, infoRatio: (annP - annB) / te, activeReturn: annP - annB,
      upCapture: upI.length ? geo(upI.map((p) => p[1])) / geo(upI.map((p) => p[0])) : NaN,
      downCapture: dnI.length ? geo(dnI.map((p) => p[1])) / geo(dnI.map((p) => p[0])) : NaN,
    });
  }
  return out;
}

/** 칼마 비율(PV 정의): 최근 36개월 연환산 수익률 / 최근 36개월 최대낙폭 */
export function calmar36(r) {
  if (r.length < 36) return NaN;
  const last = r.slice(-36);
  const lv = [1]; last.forEach((x) => lv.push(lv[lv.length - 1] * (1 + x)));
  const ann = Math.pow(lv[36], 12 / 36) - 1;
  const mdd = drawdown(lv).mdd;
  return mdd < 0 ? ann / -mdd : NaN;
}

/** 연도별 수익률(시간가중). 12개월이 다 차지 않은 해는 full=false(최고·최악 후보에서 제외) */
export function annualReturns(res) {
  const m = res.monthly;
  const out = [];
  let prev = m[0];
  let cnt = 0;
  for (let k = 1; k < m.length; k++) {
    const y = Math.floor(m[k].ym / 100);
    cnt++;
    const isYearEnd = k === m.length - 1 || Math.floor(m[k + 1].ym / 100) !== y;
    if (isYearEnd) {
      out.push({ year: y, r: m[k].t / prev.t - 1, months: cnt, full: cnt === 12, endValue: m[k].v });
      prev = m[k]; cnt = 0;
    }
  }
  return out;
}

/** 월별 수익률 표 {year: [12개, 없으면 null]} */
export function monthlyTable(res) {
  const m = res.monthly, tbl = {};
  for (let k = 1; k < m.length; k++) {
    const y = Math.floor(m[k].ym / 100), mo = m[k].ym % 100;
    (tbl[y] ||= Array(12).fill(null))[mo - 1] = m[k].t / m[k - 1].t - 1;
  }
  return tbl;
}

/** 롤링 연환산 수익률 (window 개월) */
export function rolling(res, window) {
  const lv = res.monthly.map((m) => m.t), lab = res.monthly.map((m) => m.ym);
  const out = [];
  for (let i = window; i < lv.length; i++) out.push({ ym: lab[i], r: window >= 12 ? Math.pow(lv[i] / lv[i - window], 12 / window) - 1 : lv[i] / lv[i - window] - 1 });
  return out;
}

/** 금액가중수익률(IRR, 연) — 일별 현금흐름 XIRR, 이분법 */
export function moneyWeighted(res) {
  const d0 = res.days[0], n = res.days.length;
  const cfs = [[0, -(res.strategy.initial || res.monthly[0].v)]];
  for (let i = 1; i < n; i++) if (res.flows[i]) cfs.push([(res.days[i] - d0) / 365, -res.flows[i]]);
  cfs.push([(res.days[n - 1] - d0) / 365, res.value[n - 1]]);
  return xirr(cfs);
}

/** cfs: [[연 단위 시점, 금액]] → 연수익률 */
export function xirr(cfs) {
  const npv = (r) => cfs.reduce((s, [t, c]) => s + c / Math.pow(1 + r, t), 0);
  let lo = -0.9999, hi = 10;
  let flo = npv(lo), fhi = npv(hi);
  if (flo * fhi > 0) return NaN;
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2, fm = npv(mid);
    if (Math.abs(fm) < 1e-9 || hi - lo < 1e-12) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

/** 위험 기여: %RC_i = w_i(Σw)_i / w'Σw (Σ: 월간 표본공분산) */
export function riskContribution(w, R) {
  const k = w.length;
  const S = [];
  for (let a = 0; a < k; a++) {
    S.push([]);
    for (let b = 0; b < k; b++) {
      const x = R[a], y = R[b], mx = mean(x), my = mean(y);
      let sxy = 0; for (let i = 0; i < x.length; i++) sxy += (x[i] - mx) * (y[i] - my);
      S[a].push(sxy / (x.length - 1));
    }
  }
  const Sw = S.map((row) => row.reduce((t, c, b) => t + c * w[b], 0));
  const v = w.reduce((t, wi, i) => t + wi * Sw[i], 0);
  const sig = Math.sqrt(v);
  return { portVolAnnual: sig * Math.sqrt(12), pctRC: w.map((wi, i) => (wi * Sw[i]) / v), volContribAnnual: w.map((wi, i) => (wi * Sw[i]) / sig * Math.sqrt(12)) };
}

/** 자산별 통계(같은 기간·기준통화) + 상관행렬 + 위험 기여 */
export function assetStats(res) {
  const R = res.assetMonthly.map((lv) => monthlyReturns(lv));
  const n = R.length;
  const stats = R.map((r, j) => {
    const lv = res.assetMonthly[j];
    return {
      key: res.keys[j], cagr: cagrFromLevels(lv, lv.length - 1), vol: stdev(r) * Math.sqrt(12),
      mdd: drawdown(lv).mdd, weightEnd: res.finalWeights[j], contrib: res.contrib[j],
    };
  });
  const corr = [];
  const cov = [];
  for (let a = 0; a < n; a++) {
    corr.push([]); cov.push([]);
    for (let b = 0; b < n; b++) {
      const x = R[a], y = R[b], mx = mean(x), my = mean(y);
      let sxy = 0, sxx = 0, syy = 0;
      for (let i = 0; i < x.length; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
      cov[a].push(sxy / (x.length - 1) * 12);
      corr[a].push(sxy / Math.sqrt(sxx * syy));
    }
  }
  // 위험 기여: 목표(초기) 비중 기준 w_i (Σw)_i / σ²
  const w = res.strategy.kind === 'static'
    ? (() => { const a = res.strategy.assets.filter((x) => x.key && +x.w > 0); const t = a.reduce((s, x) => s + +x.w, 0); return a.map((x) => +x.w / t); })()
    : res.finalWeights;
  const sw = cov.map((row) => row.reduce((s, c, b) => s + c * w[b], 0));
  const varP = w.reduce((s, wi, i) => s + wi * sw[i], 0);
  stats.forEach((st, i) => { st.riskContrib = varP > 0 ? (w[i] * sw[i]) / varP : NaN; st.weightTarget = w[i]; });
  return { stats, corr };
}

export { dayToYm };
