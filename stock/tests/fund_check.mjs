// 실적(펀더멘털) 지표와 순위 전략 점검: node tests/fund_check.mjs
import './node-loader.mjs';
import { quarterMetrics, fundAt, cutoffOf, prepFund, loadFundPrep } from '../js/core/fund.js';
import { loadFund } from '../js/core/data.js';
import { runBacktest } from '../js/core/engine.js';

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('실패:', msg); } };
const near = (a, b, e = 1e-9) => a != null && Math.abs(a - b) < e;

// 1) 손으로 만든 분기 표
const q = [
  [20230331, 20230505, 100, 10, 8, 1.0],
  [20230630, 20230805, 110, 12, 9, 1.1],
  [20230930, 20231105, 120, 15, 10, 1.2],
  [20231231, 20240215, 130, 13, -2, -0.2],
  [20240331, 20240505, 150, 20, 12, 1.5],
];
const mq = quarterMetrics(q);
ok(near(mq[4].rev_yoy, 0.5), '매출 YoY = 150/100−1');
ok(near(mq[4].rev_qoq, 150 / 130 - 1), '매출 QoQ');
ok(mq[4].ni_qoq === null, '직전 분기 적자면 순이익 QoQ 비움');
ok(near(mq[4].ni_yoy, 12 / 8 - 1), '순이익 YoY');
ok(near(mq[4].opm, (12 + 15 + 13 + 20) / (110 + 120 + 130 + 150)), '영업이익률 = 최근 4분기 합');
ok(mq[2].opm === null, '4분기가 안 모이면 이익률 비움');
ok(mq[0].rev_yoy === null && mq[0].rev_qoq === null, '첫 분기는 성장률 없음');

// 2) 공시일 전에는 쓰지 않음
const prep = prepFund({ t: { X: { q } } });
ok(cutoffOf(202405) === 20240529, '5월 말 리밸런싱 마감 = 5/29');
ok(fundAt(prep, 'X', cutoffOf(202404))?.end === 20231231, '4월 말엔 1분기(5/5 공시)를 모름');
ok(fundAt(prep, 'X', cutoffOf(202405))?.end === 20240331, '5월 말엔 1분기 반영');
ok(fundAt(prep, 'X', 20250101) === null, '최신 분기가 200일 넘게 지나면 비움');

// 3) 실제 DB: 모든 분기 공시일 ≥ 분기말, 애플 값 확인
const db = await loadFund('US_STOCK');
let bad = 0;
for (const v of Object.values(db.t)) for (const r of v.q) if (r[1] < r[0]) bad++;
ok(bad === 0, `공시일이 분기말보다 빠른 줄 ${bad}개`);
const aapl = db.t.AAPL.q.find((r) => r[0] === 20250927);
ok(aapl && aapl[2] === 102466000000 && aapl[1] === 20251031, '애플 FY25 4분기 매출 1,024.66억 달러(10-K 공시 10/31, 연간−1~3분기)');
ok(Object.keys(db.t).length >= 150, '미국 주식 150개 이상');

// 4) 순위 전략: 매출 성장률 상위, 영업이익률 조건
const fp = await loadFundPrep('US_STOCK');
const r = await runBacktest({ kind: 'rank', currency: 'USD', initial: 10000, start: '2016-01', end: '2025-12', rebalance: 'M', feeBp: 10, rank: { group: 'US_STOCK', metric: 'f:rev_yoy', from: 1, top: 10, weighting: 'equal', lookback: 12, skip: 0 } });
ok(r.rankHistory.length > 100, '매달 10종목 고름');
let leak = 0;
for (const h of r.rankHistory) for (const p of h.picks) { const f = fundAt(fp, p.key, cutoffOf(h.ym)); if (!f || !near(f.rev_yoy, p.score)) leak++; }
ok(leak === 0, `점수가 그달 알 수 있던 값과 다름 ${leak}건`);
const r2 = await runBacktest({ kind: 'rank', currency: 'USD', initial: 10000, start: '2016-01', end: '2025-12', rebalance: 'M', feeBp: 10, rank: { group: 'US_STOCK', metric: 'mom', from: 1, top: 10, weighting: 'equal', lookback: 12, skip: 0, ff: { key: 'opm', min: 25 } } });
let under = 0;
for (const h of r2.rankHistory) for (const p of h.picks) { const f = fundAt(fp, p.key, cutoffOf(h.ym)); if (!f || f.opm < 0.25) under++; }
ok(under === 0 && r2.rankHistory.length > 100, '영업이익률 25% 이상인 종목만');
const r3 = await runBacktest({ kind: 'rank', currency: 'USD', initial: 10000, start: '2000-01', rebalance: 'M', feeBp: 10, rank: { group: 'US_STOCK', metric: 'f:opm', from: 1, top: 5, weighting: 'equal', lookback: 12, skip: 0 } });
ok(r3.notes.some((n) => /부터 계산/.test(n)) && r3.rankHistory[0].ym >= 200906, `실적이 있는 때부터 시작(${r3.rankHistory[0].ym})`);
let threw = '';
try { await runBacktest({ kind: 'rank', currency: 'KRW', initial: 1e7, rebalance: 'M', rank: { group: 'KR_STOCK', metric: 'f:rev_yoy', top: 5 } }); } catch (e) { threw = e.message; }
ok(/준비 중/.test(threw), '국내는 아직 없다고 알림');

const cagr = (x) => (x.metrics?.cagr ?? null);
console.log('매출 YoY 상위 10(2016~2025) 마지막 고른 종목:', r.rankHistory.at(-1).ym, r.rankHistory.at(-1).picks.map((p) => `${p.key} ${(p.score * 100).toFixed(0)}%`).join(', '));
console.log(`fund: 통과 ${pass} / 실패 ${fail}`);
void cagr;
process.exit(fail ? 1 : 0);
