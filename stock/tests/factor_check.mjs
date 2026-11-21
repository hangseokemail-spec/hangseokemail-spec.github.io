// 팩터 순위(core/factors.js) 시험: 값 계산이 손계산과 같은지, 공시 전 값을 안 쓰는지, 복합 점수·매출 비례·회전율 목표, 전략 찾기 규칙 문장
import './node-loader.mjs';
import { loadMonthly } from '../js/core/data.js';
import { loadFundPrep, fundAt, cutoffOf } from '../js/core/fund.js';
import { FACTORS, factorValue, rankPool, pickWeights, tblVal } from '../js/core/factors.js';
import { runBacktest } from '../js/core/engine.js';
import { findStrategies, candRule } from '../js/core/finder.js';
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('실패:', msg); } };
const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e * Math.max(1, Math.abs(b));

const t = await loadMonthly('US_STOCK');
const fp = await loadFundPrep('US_STOCK');
const mi = new Map(t.months.map((m, i) => [m, i]));
const m = mi.get(202406), ti = t.tickers.indexOf('AAPL');
// 1) 모멘텀 12-1 = tr[t-1]/tr[t-12]-1
ok(near(factorValue('x:mom121', t, ti, m, null), tblVal(t, t.tr, ti, m - 1) / tblVal(t, t.tr, ti, m - 12) - 1), '모멘텀 12-1 손계산');
// 2) 이익수익률 = 최근 4분기 순이익 ÷ 시가총액, 그달 말 이틀 전까지 공시된 분기만
const fd = fundAt(fp, 'AAPL', cutoffOf(202406));
const q = fp.by.get('AAPL').filter((x) => x.filed <= cutoffOf(202406)).at(-1);
ok(fd && q && fd.end === q.end && fd.ni4 != null, '애플 2024.06 말에 쓸 수 있는 분기와 4분기 순이익');
ok(near(factorValue('x:ep', t, ti, m, fd), fd.ni4 / tblVal(t, t.mc, ti, m)), '이익수익률 손계산');
// 3) 52주 고점 근접은 0~1
const h = factorValue('x:hi52', t, ti, m, null);
ok(h > 0 && h <= 1, `52주 고점 근접 ${h}`);
// 4) 베타: 낮은 베타 = −높은 베타
ok(near(factorValue('x:lowbeta', t, ti, m, null), -factorValue('x:highbeta', t, ti, m, null)), '낮은 베타와 높은 베타는 부호만 다름');
// 5) 복합 점수: 0~1, 후보는 시총 상위 50개 안
const pool = rankPool(t, { group: 'US_STOCK', metric: 'x:vm', top: 10 }, m, fp);
ok(pool.length > 15 && pool.length <= 50 && pool.every((x) => x.score >= 0 && x.score <= 1), `가치+모멘텀 점수 0~1, 후보 ${pool.length}개`);
ok(pool.every((x, i) => i === 0 || pool[i - 1].score >= x.score), '점수 높은 순');
// 6) 매출 비례 + 5% 상한
const top50 = rankPool(t, { group: 'US_STOCK', metric: 'mcap', top: 50 }, m, fp).slice(0, 50);
const w = pickWeights(top50, { weighting: 'rev', maxW: 5 });
ok(near(w.reduce((a, x) => a + x, 0), 1, 1e-9) && Math.max(...w) <= 0.05 + 1e-9, `매출 비례 합 100%·최대 5% (최대 ${(Math.max(...w) * 100).toFixed(2)}%)`);
// 7) 백테스트 엔진: 팩터 순위 점수가 그달 알 수 있던 값과 같음(공시 전 값 안 씀)
const r = await runBacktest({ kind: 'rank', currency: 'USD', initial: 10000, start: '2014-01', end: '2025-12', rebalance: 'Q', feeBp: 10, rank: { group: 'US_STOCK', metric: 'x:ep', from: 1, top: 10, weighting: 'equal' } });
let leak = 0;
for (const hh of r.rankHistory) for (const p of hh.picks) { const f = fundAt(fp, p.key, cutoffOf(hh.ym)); const ti2 = t.tickers.indexOf(p.key); const v = f?.ni4 != null ? f.ni4 / tblVal(t, t.mc, ti2, mi.get(hh.ym)) : null; if (v == null || !near(v, p.score, 1e-9)) leak++; }
ok(r.rankHistory.length >= 40 && leak === 0, `이익수익률 상위 10 분기마다(${r.rankHistory.length}번), 점수 불일치 ${leak}건`);
const r2 = await runBacktest({ kind: 'rank', currency: 'USD', initial: 10000, start: '2016-01', end: '2025-12', rebalance: 'M', feeBp: 10, rank: { group: 'US_STOCK', metric: 'x:multi4', from: 1, top: 10, weighting: 'equal' } });
ok(r2.rankHistory.length > 100 && r2.rankHistory.every((x) => x.picks.length === 10), '네 팩터 평균 상위 10 매달');
for (const k of Object.keys(FACTORS)) {
  if (FACTORS[k].fund) continue;
  const rr = await runBacktest({ kind: 'rank', currency: 'USD', initial: 10000, start: '2010-01', end: '2025-12', rebalance: 'M', feeBp: 10, rank: { group: 'US_STOCK', metric: k, from: 1, top: 10, weighting: 'equal' } });
  ok(rr.rankHistory.length > 150, `${k} 백테스트 ${rr.rankHistory.length}번 고름`);
}
// 8) 전략 찾기: 연 회전율 한도를 지킨 것만 '목표 충족', 팩터 규칙 문장에 후보·점수·담기·다시 고르기·지금 고른다면·거래 양
const f = await findStrategies({ market: 'US', targetCagr: 10, maxMdd: 25, years: 10, maxTurnover: 50 });
ok(f.qualified.length > 0 && f.qualified.every((x) => x.turnover <= 0.5), `회전율 50% 이하만 충족(${f.qualified.length}개)`);
const fc = f.all.find((x) => x.rank?.metric === 'x:vm' && x.rebalance === 'Q' && !x.timing);
ok(!!fc, '가치+모멘텀 분기 규칙이 후보에 있음');
const rule = candRule(fc);
const ks = rule.steps.map((x) => x.k);
ok(['후보', '점수', '담기', '다시 고르기', '지금 고른다면', '거래 양'].every((k) => ks.includes(k)), `규칙 단계 ${ks.join(' > ')}`);
ok(/10%씩/.test(rule.steps.find((x) => x.k === '담기').t), '같은 비중이면 몇 %씩인지 적음');
console.log('예시 규칙:', rule.title);
for (const s of rule.steps) console.log(`  [${s.k}] ${s.t}`);
console.log(`factor: 통과 ${pass} / 실패 ${fail}`);
process.exit(fail ? 1 : 0);
