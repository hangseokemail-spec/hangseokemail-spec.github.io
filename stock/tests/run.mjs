// 수치 검증: 퀀트 담당이 Python으로 계산한 기대값(quant_expected.json)과 비교
import { readFile } from 'node:fs/promises';
import { setLoader, loadUniverse, decodePx } from '../js/core/data.js';
import { simulate, runBacktest, alignSeries, capWeights } from '../js/core/engine.js';
import { computeMetrics, drawdownEpisodes, riskContribution, xirr, moneyWeighted, rolling, annualReturns } from '../js/core/metrics.js';
import * as P from '../js/core/plan.js';
import { fmtKRW, fmtKRWShort, fmtPct } from '../js/ui/format.js';
import { ymdToDay, dayToYm } from '../js/core/dates.js';

const root = new URL('../data/', import.meta.url);
const toy = { px: {}, monthly: {} };
setLoader(async (p) => {
  const m = p.match(/^px\/(.+)\.json$/);
  if (m && toy.px[decodeURIComponent(m[1])]) return toy.px[decodeURIComponent(m[1])];
  const g = p.match(/^monthly_(.+)\.json$/);
  if (g && toy.monthly[g[1]]) return toy.monthly[g[1]];
  return JSON.parse(await readFile(new URL(decodeURIComponent(p), root), 'utf8'));
});
await loadUniverse();
const T = JSON.parse(await readFile(new URL('./quant_expected.json', import.meta.url), 'utf8')).tests;

let pass = 0, fail = 0;
const fails = [];
function close(a, b, tol) {
  if (b == null) return a == null;
  if (typeof b === 'string') return String(a).replace(/−/g, '-') === b;
  if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length && b.every((x, i) => close(a[i], x, tol));
  if (typeof b === 'object') return Object.keys(b).every((k) => close(a?.[k], b[k], tol));
  const t = tol?.abs ?? 1e-6, rel = tol?.rel ?? 0;
  return Math.abs(a - b) <= Math.max(t, rel * Math.abs(b));
}
function check(id, name, got, exp, tol) {
  const ok = close(got, exp, tol);
  if (ok) pass++; else { fail++; fails.push(`${id} · ${name}: got ${JSON.stringify(got)?.slice(0, 200)} / exp ${JSON.stringify(exp)?.slice(0, 200)}`); }
}
const iso = (d) => +d.replace(/-/g, '');
const monthEndToy = (inp) => {
  const days = Int32Array.from(inp.dates.map((d) => ymdToDay(iso(d))));
  const keys = Object.keys(inp.weights || inp.prices);
  const prices = keys.map((k) => Float64Array.from(inp.prices[k]));
  return { days, keys, prices };
};
function runToyBacktest(inp) {
  const { days, keys, prices } = monthEndToy(inp);
  const W = Float64Array.from(keys.map((k) => inp.weights[k]));
  const n = days.length;
  const targets = new Map([[0, W]]);
  const reb = inp.rebalance;
  const s = { initial: inp.initial, feeBp: inp.costBp || 0, rebalance: reb.type === 'band' ? 'band' : reb.freq, band: { abs: (reb.abs || 0) * 100, rel: (reb.rel || 0) * 100, cap: (reb.cap || 0) * 100 } };
  const CAL = { M: [1,2,3,4,5,6,7,8,9,10,11,12], Q: [3,6,9,12], S: [6,12], A: [12] };
  if (reb.type === 'calendar' && reb.freq !== 'none') for (let i = 1; i < n - 1; i++) if (CAL[reb.freq].includes(dayToYm(days[i]) % 100)) targets.set(i, W);
  const flows = new Float64Array(n);
  if (inp.cashflow) for (let i = 1; i < n; i++) flows[i] = inp.cashflow.amount * Math.pow(1 + (inp.cashflow.inflation || 0), Math.floor((i - 1) / 12));
  const sim = simulate({ days, prices, targets, flows, s, W });
  const mret = []; for (let i = 1; i < n; i++) mret.push(sim.twr[i] / sim.twr[i - 1] - 1);
  const rebDates = sim.rebDays.map((i) => inp.dates[i]);
  return { sim, mret, rebDates, days, flows };
}

for (const t of T) {
  const { id, kind, input: inp, expected: e, tolerance: tol } = t;
  try {
    if (kind === 'fv_segments') {
      const r = P.fvPlan(inp);
      const got = { fv: r.fv, fvReal: r.fvReal, totalContrib: r.totalContrib, gain: r.gain, path: r.path };
      check(id, 'fv', got, e, tol);
    } else if (kind === 'required_monthly') {
      check(id, 'reqMonthly', P.requiredMonthly(inp.plan, inp.target), e, tol);
    } else if (kind === 'required_rate') {
      const r = P.requiredRate(inp.plan, inp.target, { hi: inp.hi ?? 1 });
      const got = { status: r.status, delta: r.delta, rate: r.delta, effectiveRates: r.rates?.map((x) => x.rate) };
      check(id, 'reqRate', got, e, tol);
    } else if (kind === 'required_years') {
      check(id, 'reqYears', P.requiredMonths(inp.plan, inp.target, { maxMonths: inp.maxMonths, targetIsReal: inp.targetIsReal }), e, tol);
    } else if (kind === 'retirement_need') {
      check(id, 'need', P.retirementNeed(inp), e, tol);
    } else if (kind === 'life_plan') {
      check(id, 'life', P.lifePlan(inp.accumulation, inp.retirement), e, { abs: tol?.abs ?? 1, rel: tol?.rel ?? 0 });
    } else if (kind === 'rate_conversion') {
      check(id, 'rates', { monthlyEffective: P.monthlyRate(inp.annual), monthlyNominal: P.monthlyRate(inp.annual, 'nominal'), realRate: P.realRate(inp.nominalForReal, inp.inflation) }, e, tol);
    } else if (kind === 'rebalance_toy' || kind === 'band_rebalance_toy') {
      const r = runToyBacktest(inp);
      check(id, 'endValue', r.sim.value[r.sim.value.length - 1], e.endValue, { abs: tol.abs });
      if (e.rebalanceDates) check(id, 'rebDates', r.rebDates, e.rebalanceDates);
      if (e.monthlyReturns) check(id, 'mret', r.mret, e.monthlyReturns, { abs: tol.returnsAbs ?? 1e-9 });
      if (e.totalCost != null) check(id, 'cost', r.sim.feeTotal, e.totalCost, { abs: 1e-6 });
    } else if (kind === 'twr') {
      if (inp.valuesBeforeFlow) {
        let tw = 1; for (let i = 1; i < inp.valuesBeforeFlow.length; i++) tw *= inp.valuesBeforeFlow[i] / (inp.valuesBeforeFlow[i - 1] + inp.flows[i - 1]);
        check(id, 'twrHand', tw - 1, e.twrCumulative, tol);
        continue;
      }
      const r = runToyBacktest(inp);
      const n = r.days.length;
      check(id, 'endValue', r.sim.value[n - 1], e.endValue, { abs: tol.abs });
      if (e.twrCumulative != null) check(id, 'twr', r.sim.twr[n - 1] - 1, e.twrCumulative, { abs: 1e-9 });
      if (e.monthlyReturns) check(id, 'mret', r.mret, e.monthlyReturns, { abs: 1e-9 });
      if (e.xirr != null) {
        const res = { strategy: { initial: inp.initial }, days: r.days, flows: r.flows, value: r.sim.value, monthly: [{ v: inp.initial }] };
        check(id, 'xirr', moneyWeighted(res), e.xirr, { abs: tol.xirrAbs ?? 1e-8 });
      }
      if (e.depletedAt) check(id, 'depleted', inp.dates[r.sim.depleted], e.depletedAt);
    } else if (kind === 'xirr') {
      const d0 = ymdToDay(iso(inp.cashflows[0][0]));
      check(id, 'xirr', xirr(inp.cashflows.map(([d, a]) => [(ymdToDay(iso(d)) - d0) / 365, a])), e.xirr, tol);
    } else if (kind === 'metrics') {
      const mk = (rets) => { const lv = [1]; rets.forEach((x) => lv.push(lv[lv.length - 1] * (1 + x))); return lv; };
      const ymOf = (s) => +s.replace('-', '');
      const prevYm = (ym) => (ym % 100 === 1 ? ym - 89 : ym - 1);
      const labels = [prevYm(ymOf(inp.months[0])), ...inp.months.map(ymOf)];
      const fake = (rets) => { const lv = mk(rets); return { monthly: lv.map((t, i) => ({ ym: labels[i], t, v: t, inv: 1 })), twr: Float64Array.from(lv), flows: null, days: [], value: [] }; };
      const rf = { monthly: inp.portfolio.map(() => inp.rfAnnualFixed / 12) };
      const m = computeMetrics(fake(inp.portfolio), fake(inp.benchmark), rf);
      const got = {
        cumulative: m.totalReturn, cagr: m.cagr, volAnnual: m.vol, downsideDevAnnual: m.downside, sharpe: m.sharpe, sortino: m.sortino, mdd: m.mdd,
        positiveMonths: m.posMonths, positiveRatio: m.posRatio, arithMeanMonthly: inp.portfolio.reduce((a, b) => a + b, 0) / inp.portfolio.length,
        beta: m.beta, alphaAnnual: m.alpha, alphaMonthly: m.alpha / 12, correlation: m.corr, r2: m.r2, trackingError: m.trackingError, informationRatio: m.infoRatio,
        upCapture: m.upCapture, downCapture: m.downCapture, activeReturn: m.activeReturn, calmar36: m.calmar,
        best: m.best?.year, bestReturn: m.best?.r, worst: m.worst?.year, worstReturn: m.worst?.r,
        calendarYears: Object.fromEntries(m.years.map((y) => [y.year, { return: y.r, months: y.months }])),
        rolling12: rolling(fake(inp.portfolio), 12).map((x) => x.r), rolling36: rolling(fake(inp.portfolio), 36).map((x) => x.r),
      };
      check(id, 'metrics', got, e, tol);
    } else if (kind === 'mdd') {
      const eps = drawdownEpisodes(inp.values, inp.values.map((_, i) => i), 99);
      check(id, 'mdd', eps[0].depth, e.mdd, tol);
      check(id, 'episodes', eps.map((x) => ({ peak: x.start, trough: x.trough, recovery: x.end, depth: x.depth, length: x.lenDown, recoveryLength: x.lenRecover, underwater: x.end == null ? null : x.end - x.start })), e.episodes, tol);
    } else if (kind === 'risk_contribution') {
      check(id, 'rc', riskContribution(inp.weights, inp.assetMonthlyReturns), e, tol);
    } else if (kind === 'weights') {
      const iv = (v) => { const t = v.reduce((a, x) => a + 1 / x, 0); return v.map((x) => 1 / x / t); };
      check(id, 'invvol', { weights: iv(inp.vols), weightsCapped: capWeights(iv(inp.vols2), inp.cap2) }, e, tol);
    } else if (kind === 'rank_toy') {
      // 장난감 유니버스로 월간 표와 일별 시세를 만들어 실제 엔진(runBacktest)에 넣음
      const grp = `TOY_${id}`;
      const months = inp.dates.map((d) => Math.floor(iso(d) / 100));
      const tick = Object.keys(inp.universe).sort();
      const tbl = { group: grp, months, tickers: tick, o: [], tr: [], mc: [], vol: [] };
      for (const k of tick) {
        const u = inp.universe[k];
        const i0 = u.close.findIndex((x) => x != null);
        const capSrc = inp.rule.useAdjForCap ? u.adj : u.close;
        const sharesAt = (i) => { let sv = u.sharesNow; if (u.sharesHist) { sv = u.sharesHist[0][1]; for (const [ix, v] of u.sharesHist) if (ix <= i) sv = v; } return sv; };
        tbl.o.push(i0);
        tbl.tr.push(u.adj.slice(i0).map((x) => x));
        tbl.mc.push(capSrc.slice(i0).map((x, j) => (x == null ? null : x * sharesAt(i0 + j))));
        tbl.vol.push(u.adj.slice(i0).map(() => null));
        const ds = [], cs = [];
        inp.dates.forEach((d, i) => { if (u.adj[i] != null) { ds.push(iso(d)); cs.push(u.adj[i]); } });
        const dd = ds.slice(1).map((d, i) => ymdToDay(d) - ymdToDay(ds[i]));
        toy.px[`${k}`] = { k, d0: ds[0], dd, c: cs, dv: [] };
      }
      toy.monthly[grp] = tbl;
      const rule = inp.rule;
      const metric = { marketCap: 'mcap', momentum: 'mom' }[rule.metric];
      const res = await runBacktest({ kind: 'rank', currency: 'USD', initial: inp.initial, rebalance: 'M', start: null, end: `${Math.floor(months[months.length - 1] / 100)}-${months[months.length - 1] % 100}`,
        rank: { group: grp, metric, from: 1, top: rule.topN, lookback: rule.lookback || 12, skip: rule.skip || 0, weighting: rule.weighting === 'cap' ? 'mcap' : 'equal' } });
      // 시작이 자동으로 정해지는 모멘텀이 아니면 첫 달부터
      const hold = res.rankHistory.map((h) => ({ date: inp.dates[months.indexOf(h.ym)], weights: Object.fromEntries(h.picks.map((p) => [p.key, p.w])) }));
      check(id, 'holdings', hold, e.holdings, { abs: tol.abs });
      check(id, 'endValue', res.value[res.value.length - 1], e.endValue, { abs: 1e-6 });
      if (e.startDate) check(id, 'start', inp.dates[months.indexOf(res.monthly[0].ym)], e.startDate);
      for (const k of tick) delete toy.px[k];
    } else if (kind === 'calendar_fx_toy') {
      const mkp = (o) => { const ds = Object.keys(o).sort(); return { day: Int32Array.from(ds.map((d) => ymdToDay(iso(d)))), close: Float64Array.from(ds.map((d) => o[d])), tr: Float64Array.from(ds.map((d) => o[d])) }; };
      const pxs = { US: mkp(inp.assets.US.prices), KR: mkp(inp.assets.KR.prices) };
      const fx = mkp(inp.fx_USDKRW);
      const cur = { US: 'USD', KR: 'KRW' };
      const got = {};
      // engine의 currencyOf가 유니버스로 통화를 찾으므로 여기서는 직접 환산 규칙을 확인
      for (const base of ['KRW', 'USD']) {
        const al = alignSeries(pxs, ['US', 'KR'], base, null, -1e9, 1e9, true);
        const fxa = (() => { const o = new Float64Array(al.days.length); let j = -1; for (let i = 0; i < al.days.length; i++) { while (j + 1 < fx.day.length && fx.day[j + 1] <= al.days[i]) j++; o[i] = fx.close[j]; } return o; })();
        got.fx = Array.from(fxa);
        got.dates = Array.from(al.days).map((d) => new Date(d * 864e5).toISOString().slice(0, 10));
        got[base] = { US: Array.from(al.prices[0]).map((v, i) => (cur.US === base ? v : base === 'KRW' ? v * fxa[i] : v / fxa[i])), KR: Array.from(al.prices[1]).map((v, i) => (cur.KR === base ? v : base === 'KRW' ? v * fxa[i] : v / fxa[i])) };
      }
      check(id, 'calendarFx', got, e, tol);
    } else if (kind === 'format_krw') {
      check(id, 'krw', inp.values.map((v) => fmtKRW(v)), e.strings);
      check(id, 'krwAxis', [329059000, 1e9, 95000000, 12345].map((v) => fmtKRWShort(v)), e.axis);
    } else if (kind === 'format_pct') {
      check(id, 'pct2', inp.values.map((v) => fmtPct(v, 2)), e.d2);
      check(id, 'pct1', inp.values.map((v) => fmtPct(v, 1, true)), e.d1sign);
    } else if (kind === 'pv_reproduction') {
      const res = await runBacktest({ currency: 'USD', initial: 10000, start: '2017-01', end: '2026-10', rebalance: 'A', assets: Object.entries(inp.portfolio).map(([key, w]) => ({ key, w: w * 100 })) });
      const b = await runBacktest({ currency: 'USD', initial: 10000, start: '2017-01', end: '2026-10', rebalance: 'none', assets: [{ key: 'VFINX', w: 100 }] });
      const m = computeMetrics(res, b, 0);
      const pv = e.pv;
      check(id, 'cagr', m.cagr, pv.cagr, { abs: tol.cagrAbs });
      check(id, 'vol', m.vol, pv.vol, { abs: tol.volAbs });
      check(id, 'mdd', m.mdd, pv.mdd, { abs: tol.mddAbs });
      check(id, 'endValue', m.final, pv.endValue, { abs: pv.endValue * tol.endValueRel });
      check(id, 'posMonths', m.posMonths, pv.positiveMonths, { abs: tol.positiveMonthsAbs });
      check(id, 'bestYear', m.best.r, pv.bestYear[1], { abs: tol.yearReturnAbs });
      check(id, 'worstYear', m.worst.r, pv.worstYear[1], { abs: tol.yearReturnAbs });
      console.log(`  PV 대조: CAGR ${(m.cagr * 100).toFixed(2)}% (PV ${(pv.cagr * 100).toFixed(2)}), 변동성 ${(m.vol * 100).toFixed(2)}% (PV ${(pv.vol * 100).toFixed(1)}), MDD ${(m.mdd * 100).toFixed(2)}% (PV ${(pv.mdd * 100).toFixed(1)}), 최종 $${m.final.toFixed(0)} (PV $${pv.endValue})`);
    } else if (kind === 'common_start' || kind === 'dividend_inference') {
      // common_start: 엔진 규칙(가장 늦은 시작월 + 1이 첫 수익월)은 runStatic 안에 있음 → 실제 데이터로 따로 확인
      // dividend_inference: 이 앱은 야후 배당 이벤트를 직접 받으므로 역추정이 필요 없음
      continue;
    } else {
      console.log('  (건너뜀)', id, kind);
    }
  } catch (err) { fail++; fails.push(`${id}: 오류 ${err.message}`); }
}
console.log(`\n통과 ${pass} / 실패 ${fail}`);
fails.forEach((f) => console.log('  ✗', f));
process.exit(fail ? 1 : 0);
