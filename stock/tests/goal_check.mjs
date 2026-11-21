// 목표·노후 맨 위 카드 계산 확인: 닫힌 식 vs 한 달씩 굴린 값, 손계산 예시
import { toThen, toToday, fv, solveMonths, solveMonthly, solveInitial, solveRate, solve, ceilMoney, ceilRate, singleRatePct, solveMonthsReal, segFV } from '../js/core/goalcalc.js';

let pass = 0, fail = 0;
const near = (a, b, tol) => Math.abs(a - b) <= tol;
function ok(name, cond, info = '') { if (cond) pass++; else { fail++; console.log('실패:', name, info); } }
const sim = (P0, C, r, n) => { const i = Math.pow(1 + r, 1 / 12) - 1; let B = P0; for (let k = 0; k < n; k++) B = B * (1 + i) + C; return B; };

// 저울
ok('저울 1억 20년 2.5%', Math.round(toThen(1e8, 20, 0.025)) === 163861644, toThen(1e8, 20, 0.025));
ok('저울 되돌리기', near(toToday(toThen(5e7, 13, 0.03), 13, 0.03), 5e7, 1e-6));
ok('저울 물가 0%', toThen(1e8, 30, 0) === 1e8);

// 미래 금액: 닫힌 식 = 한 달씩
for (const [P0, C, r, n] of [[3e7, 5e5, 0.06, 144], [0, 1e6, 0.1, 240], [1e8, 0, 0.04, 60], [5e6, 3e5, 0, 36], [2e7, 2e5, -0.02, 120]]) {
  ok(`fv ${P0},${C},${r},${n}`, near(fv(P0, C, r, n), sim(P0, C, r, n), 1e-3 * Math.max(1, sim(P0, C, r, n)) * 1e-6 + 1));
}

// ① 기간: 1억 6,386만원, 3,000만원, 월 50만원, 6% → 144개월
const T = toThen(1e8, 20, 0.025);
const y = solveMonths({ target: T, initial: 3e7, monthlyAmt: 5e5, rate: 0.06 });
ok('기간 예시 144개월', y.status === 'ok' && y.months === 144, JSON.stringify(y));
ok('기간 143개월로는 모자람', sim(3e7, 5e5, 0.06, 143) < T && sim(3e7, 5e5, 0.06, 144) >= T);
ok('이미 충분', solveMonths({ target: 1e7, initial: 2e7, monthlyAmt: 0, rate: 0.05 }).status === 'already');
ok('닿지 못함(적립 0, 수익 0)', solveMonths({ target: 1e8, initial: 1e7, monthlyAmt: 0, rate: 0 }).status === 'never');

// ② 매달: 결과를 넣으면 정확히 목표
const m = solveMonthly({ target: T, initial: 3e7, rate: 0.06, months: 120 });
ok('매달 → 목표 정확', m.status === 'ok' && near(fv(3e7, m.value, 0.06, 120), T, 1), JSON.stringify(m));
ok('매달 수익 0%', near(solveMonthly({ target: 1.2e7, initial: 0, rate: 0, months: 12 }).value, 1e6, 1e-6));
ok('매달 필요 없음', solveMonthly({ target: 1e7, initial: 1e7, rate: 0.03, months: 24 }).status === 'enough');

// ③ 처음 목돈(예금): 10년 5%, 1억 → 1억 / 1.05^10
const iv = solveInitial({ target: 1e8, monthlyAmt: 0, rate: 0.05, months: 120 });
ok('목돈 예금 10년 5%', near(iv.value, 1e8 / Math.pow(1.05, 10), 1), JSON.stringify(iv));
const iv2 = solveInitial({ target: T, monthlyAmt: 5e5, rate: 0.06, months: 144 });
ok('목돈 + 적립 → 목표 정확', near(fv(iv2.value, 5e5, 0.06, 144), T, 1));

// ④ 수익률: 정답을 넣고 거꾸로
const r = solveRate({ target: fv(3e7, 5e5, 0.073, 150), initial: 3e7, monthlyAmt: 5e5, months: 150 });
ok('수익률 거꾸로 7.3%', near(r.value, 0.073, 1e-6), JSON.stringify(r));
ok('수익률 무리(30% 초과)', solveRate({ target: 5e7, initial: 1e7, monthlyAmt: 0, months: 60 }).status === 'hard');
ok('수익률 100% 넘으면 못 닿음', solveRate({ target: 1e9, initial: 1e7, monthlyAmt: 0, months: 60 }).status === 'never');
ok('수익률 0이어도 닿음', solveRate({ target: 1e7, initial: 5e6, monthlyAmt: 5e5, months: 24 }).value < 0);

// 대안: 못 닿으면 다른 길
const s = solve('years', { target: 1e9, initial: 1e7, monthlyAmt: 0, rate: 0, months: 120 });
ok('대안이 나옴', s.ans.status === 'never' && s.alts.length >= 1, JSON.stringify(s.alts));
const s2 = solve('rate', { target: 1e9, initial: 1e7, monthlyAmt: 1e5, months: 120 });
ok('수익률 무리 → 대안', ['hard', 'never'].includes(s2.ans.status) && s2.alts.length >= 1, JSON.stringify(s2));


// Opus 검토 테스트 벡터(01_opus_review.md 4절)
ok('S2 저울 반대', Math.round(toToday(1e9, 20, 0.025)) === 610270943, toToday(1e9, 20, 0.025));
ok('S3', Math.round(toThen(1e8, 30, 0.03)) === 242726247);
ok('S6 물가 −1%', Math.round(toThen(1e8, 10, -0.01)) === 90438208);
const y1 = solve('years', { target: 163861644, initial: 3e7, monthlyAmt: 5e5, rate: 0.06 });
ok('Y1 144개월·FV', y1.ans.months === 144 && Math.round(y1.end) === 164339798 && y1.paid === 1.02e8, JSON.stringify([y1.ans, y1.end, y1.paid]));
ok('Y1-alt 매달 60만 130개월', y1.alts.find((a) => a.kind === 'monthly')?.months === 130, JSON.stringify(y1.alts));
ok('Y1-alt 8% 126개월', y1.alts.find((a) => a.kind === 'rate')?.months === 126);
const yr = solveMonthsReal({ today: 1e8, infl: 0.025, initial: 3e7, monthlyAmt: 5e5, rate: 0.06 });
ok('Y1-real 113개월', yr?.months === 113, JSON.stringify(yr));
ok('Y2 r=0 200개월', solveMonths({ target: 1e8, initial: 0, monthlyAmt: 5e5, rate: 0 }).months === 200);
const y3 = solve('years', { target: 1e9, initial: 0, monthlyAmt: 1e5, rate: 0, refMonths: 240 });
ok('Y3 못 닿음 대안', y3.ans.status === 'never' && y3.alts[0]?.monthly === 4170000 && y3.alts[1]?.kind === 'needInitial' && y3.alts[1].initial === 976000000, JSON.stringify(y3.alts));
ok('Y4 음수 319개월', solveMonths({ target: 1e8, initial: 5e7, monthlyAmt: 5e5, rate: -0.05 }).months === 319);
ok('Y5 음수 못 닿음', solveMonths({ target: 1e8, initial: 2e7, monthlyAmt: 3e5, rate: -0.05 }).status === 'never');
const m1 = solve('monthly', { target: 1e9, initial: 1e8, rate: 0.06, months: 240 });
ok('M1 150만원', m1.shown === 1500000 && Math.round(m1.end) === 1000871496, JSON.stringify([m1.shown, m1.end]));
ok('M1-alt 25년 85만 / 8% 94만', m1.alts[0].monthly === 850000 && m1.alts[1].monthly === 940000, JSON.stringify(m1.alts));
ok('M2 필요 없음', solve('monthly', { target: 1e8, initial: 8e7, rate: 0.06, months: 60 }).ans.status === 'enough');
ok('M3 r=0 80만', solve('monthly', { target: 1e8, initial: 2e7, rate: 0, months: 100 }).shown === 800000);
const i1 = solve('initial', { target: 1e9, monthlyAmt: 1.5e6, rate: 0.06, months: 240 });
ok('I1 9,973만원', i1.shown === 99730000 && i1.end >= 1e9, JSON.stringify([i1.shown, i1.end]));
ok('I1-alt 매달 +50만(규칙) → 2,904만', i1.alts[0].monthly === 2e6 && i1.alts[0].initial === 29040000 && i1.alts[1].initial === 0, JSON.stringify(i1.alts));
ok('I2 필요 없음', solve('initial', { target: 1e8, monthlyAmt: 2e6, rate: 0.06, months: 60 }).ans.status === 'enough');
ok('I3 r=0 4,000만', solve('initial', { target: 1e8, monthlyAmt: 5e5, rate: 0, months: 120 }).shown === 4e7);
ok('R1 연 6.0%', solve('rate', { target: 1e9, initial: 1e8, monthlyAmt: 1.5e6, months: 240 }).shown === 0.06);
const r2 = solve('rate', { target: 1e9, initial: 1e8, monthlyAmt: 1e6, months: 120 });
ok('R2 20.6% 높음 + 대안', r2.shown === 0.206 && r2.ans.status === 'stretch' && r2.alts[0]?.months === 257 && r2.alts[1]?.monthly === 4700000, JSON.stringify([r2.shown, r2.ans.status, r2.alts]));
ok('R3 13.7%', solve('rate', { target: 3e8, initial: 5e7, monthlyAmt: 5e5, months: 120 }).shown === 0.137);
ok('R4 음수 −2.4%', solve('rate', { target: 5e7, initial: 3e7, monthlyAmt: 5e5, months: 48 }).shown === -0.024);
ok('R6 못 닿음', solve('rate', { target: 1e10, initial: 0, monthlyAmt: 1e5, months: 60 }).ans.status === 'never');
ok('G3 구간 3/5/7 → 5.7%', singleRatePct(1e8, 1.5e6, [{ from: 1, to: 5, rate: 3 }, { from: 6, to: 8, rate: 5 }, { from: 9, to: null, rate: 7 }], 180) === 5.7);
ok('segFV 한 구간 = fv', Math.abs(segFV(1e7, 1e5, [{ from: 1, to: null, rate: 6 }], 120) - fv(1e7, 1e5, 0.06, 120)) < 1e-3);
ok('올림', ceilMoney(1498078) === 1500000 && ceilMoney(95321) === 96000 && ceilRate(0.059936) === 0.06 && ceilRate(-0.02474) === -0.024);

const z = solve('rate', { target: 1e7, initial: 2e7, monthlyAmt: 5e5, months: 24, rate: 0.05 });
ok('상관없이 닿음: 수익률 −50% 안 넣음', z.ans.status === 'zero' && z.full.rate === 0.05 && z.shown == null, JSON.stringify([z.ans, z.full]));
const r2b = solve('rate', { target: 1e9, initial: 1e8, monthlyAmt: 1e6, months: 120 });
ok('수익률 대안은 질문을 바꾸지 않음', r2b.alts.every((a) => !a.ask) && r2b.alts[0].set.years === 22, JSON.stringify(r2b.alts));
console.log(`goal: 통과 ${pass} / 실패 ${fail}`);
console.log('예시: 기간', y.months, '개월 · 매달', Math.round(m.value).toLocaleString(), '원 · 예금 목돈', Math.round(iv.value).toLocaleString(), '원 · 수익률', (r.value * 100).toFixed(2), '%');
if (fail) process.exit(1);
