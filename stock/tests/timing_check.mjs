// 타이밍 규칙·조건부 리밸런싱 점검(손계산 가능한 장난감 + 실제 데이터 sanity)
import './node-loader.mjs';
import { runBacktest } from '../js/core/engine.js';
import { computeMetrics } from '../js/core/metrics.js';
import { rsi, sma, planTiming, checkMask, ruleSeries, TIMING_PRESETS } from '../js/core/signals.js';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
// 1) 지표
const v = Float64Array.from([44.34,44.09,44.15,43.61,44.33,44.83,45.10,45.42,45.84,46.08,45.89,46.03,45.61,46.28,46.28,46.00,46.03,46.41,46.22,45.64]);
const r = rsi(v, 14);
ok(Math.abs(r[14] - 70.46) < 0.6, `RSI 와일더 첫 값 ≈70.5 (got ${r[14].toFixed(2)})`);
ok(Math.abs(sma(Float64Array.from([1,2,3,4,5]), 3)[4] - 4) < 1e-12, 'SMA');
// 2) 상태 기계: 하락 → 매도(다음 날), 회복 → 매수
const days = Int32Array.from(Array.from({ length: 10 }, (_, i) => 20000 + i));
const sig = { day: days, v: Float64Array.from([100, 101, 102, 90, 88, 87, 95, 104, 105, 106]) };
const tm = { kind: 'switch', signal: 'X', sell: { type: 'dd', th: -10, op: 'below' }, buy: null, check: 'D' };
const pl = planTiming(tm, { main: sig }, days, checkMask(days, 'D'));
ok(JSON.stringify(Array.from(pl.expo)) === JSON.stringify([1,1,1,1,0,0,0,1,1,1]), `낙폭 매도/회복 매수 노출 ${Array.from(pl.expo)}`);
ok(pl.events[0].kind === 'sell' && pl.events[0].i === 4 && pl.events[0].at === 3, '판단 다음 날 실행');
// 트리거: 조건이 참이 되는 순간만
const tg = planTiming({ kind: 'trigger', rule: { type: 'dd', th: -10, op: 'below' }, check: 'D' }, { main: sig }, days, checkMask(days, 'D'));
ok(tg.events.length === 1 && tg.events[0].i === 4, `트리거 1회 ${JSON.stringify(tg.events)}`);
// 3) 실제 데이터: SPY + 10개월선 → 2008년 대부분 쉬기, MDD 개선
const base = { name: 't', kind: 'static', assets: [{ key: 'SPY', w: 100 }], start: '2005-01', end: '2012-12', rebalance: 'none', initial: 10000, currency: 'USD', reinvest: true, feeBp: 0 };
const a = await runBacktest(base);
const b = await runBacktest({ ...base, timing: TIMING_PRESETS.find((p) => p.id === 'ma10m').tm });
const ma = computeMetrics(a, null, 0), mb = computeMetrics(b, null, 0);
console.log('SPY 2005-2012', (ma.cagr * 100).toFixed(2), (ma.mdd * 100).toFixed(1), '| +10개월선', (mb.cagr * 100).toFixed(2), (mb.mdd * 100).toFixed(1), 'sells', b.timing.nSell, 'in', b.timing.inRatio.toFixed(2));
ok(mb.mdd > ma.mdd + 0.2, '10개월선이 2008 낙폭을 크게 줄임');
ok(b.timing.nSell >= 2 && b.timing.nSell <= 12, '매도 횟수 합리적');
// 각 프리셋이 오류 없이 돈다
for (const p of TIMING_PRESETS) {
  try { const x = await runBacktest({ ...base, assets: [{ key: 'QQQ', w: 60 }, { key: 'SCHD', w: 40 }], start: '2013-01', end: '2025-12', rebalance: 'Q', timing: p.tm }); const m = computeMetrics(x, null, 0); ok(isFinite(m.cagr) && m.final > 0, `프리셋 ${p.id}`); console.log(' ', p.id.padEnd(8), (m.cagr * 100).toFixed(2), (m.mdd * 100).toFixed(1), 'sell', x.timing?.nSell, 'reb', x.timing?.nReb, 'in', x.timing?.inRatio?.toFixed(2)); } catch (e) { ok(false, `프리셋 ${p.id} 오류 ${e.message}`); }
}
// 순위 + 타이밍 + 레버리지 제외
const rk = await runBacktest({ ...base, kind: 'rank', rank: { group: 'US_ETF', metric: 'mom', from: 1, top: 3, lookback: 12, skip: 0, weighting: 'equal', excludeCats: ['lev', 'inv'] }, start: '2015-01', end: '2025-12', rebalance: 'M', timing: TIMING_PRESETS[0].tm });
const levPicked = rk.rankHistory.some((h) => h.picks.some((p) => ['TQQQ', 'SOXL', 'UPRO', 'SQQQ'].includes(p.key)));
ok(!levPicked, '레버리지·인버스 제외');
const rk2 = await runBacktest({ ...base, kind: 'rank', rank: { group: 'US_ETF', metric: 'mom', from: 1, top: 3, lookback: 12, skip: 0, weighting: 'equal' }, start: '2015-01', end: '2025-12', rebalance: 'M' });
ok(rk2.rankHistory.some((h) => h.picks.some((p) => ['TQQQ', 'SOXL', 'UPRO'].includes(p.key))), '제외 안 하면 레버리지가 뽑힘(대조)');
console.log(`timing: 통과 ${pass} / 실패 ${fail}`);
