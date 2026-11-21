// 목표·노후 맨 위 카드 계산: ① 돈의 가치 저울 ② 실행 목표(네 가지 질문)
// 규칙은 core/plan.js와 같다: 연 수익률 r → 월 i = (1+r)^(1/12) − 1(실효 복리), 적립은 월말, 기간은 개월 단위.
// 저울: 그해 통장 숫자 = 오늘 돈 × (1 + 물가)^기간(년).

export const MAX_MONTHS = 1200; // 100년

export const growth = (infl, years) => Math.pow(1 + infl, years);
/** 오늘 돈 → 그해 통장 숫자 */
export function toThen(today, years, infl) { return today * growth(infl, years); }
/** 그해 통장 숫자 → 오늘 돈 */
export function toToday(then, years, infl) { return then / growth(infl, years); }

export const monthly = (r) => Math.pow(1 + r, 1 / 12) - 1;
/** n개월 뒤 금액: 지금 목돈 P0, 매달 C(월말), 연수익률 r */
export function fv(P0, C, r, n) {
  const i = monthly(r);
  if (Math.abs(i) < 1e-12) return P0 + C * n;
  const g = Math.pow(1 + i, n);
  return P0 * g + C * (g - 1) / i;
}
/** 넣은 돈 합계 */
export const paidIn = (P0, C, n) => P0 + C * n;

/** ① 기간: 목표에 닿는 가장 작은 개월 수(없으면 null) */
export function solveMonths({ target, initial, monthlyAmt, rate }) {
  if (initial >= target) return { status: 'already', months: 0 };
  const i = monthly(rate);
  let B = initial;
  for (let n = 1; n <= MAX_MONTHS; n++) {
    B = B * (1 + i) + monthlyAmt;
    if (B >= target - 1e-6) return { status: 'ok', months: n, fv: B };
    if (B <= 0 && monthlyAmt <= 0) break;
  }
  return { status: 'never', months: null };
}
/** ② 매달 넣을 돈 */
export function solveMonthly({ target, initial, rate, months }) {
  if (months <= 0) return { status: 'bad', value: null };
  const i = monthly(rate);
  const g = Math.abs(i) < 1e-12 ? 1 : Math.pow(1 + i, months);
  const left = target - initial * g;
  if (left <= 0) return { status: 'enough', value: 0, fvInitial: initial * g };
  const v = Math.abs(i) < 1e-12 ? left / months : left * i / (g - 1);
  return { status: 'ok', value: v };
}
/** ③ 처음 넣을 목돈(예금처럼, 매달 적립을 함께 넣을 수도 있음) */
export function solveInitial({ target, monthlyAmt, rate, months }) {
  if (months <= 0) return { status: target > 0 ? 'ok' : 'enough', value: Math.max(0, target) };
  const i = monthly(rate);
  const g = Math.abs(i) < 1e-12 ? 1 : Math.pow(1 + i, months);
  const fromMonthly = Math.abs(i) < 1e-12 ? monthlyAmt * months : monthlyAmt * (g - 1) / i;
  const left = target - fromMonthly;
  if (left <= 0) return { status: 'enough', value: 0, fromMonthly };
  return { status: 'ok', value: left / g, fromMonthly };
}
/** ④ 필요한 연수익률(이분법, −50%~100%) */
export function solveRate({ target, initial, monthlyAmt, months }) {
  if (months <= 0) return { status: 'bad', value: null };
  const paid = paidIn(initial, monthlyAmt, months);
  if (paid <= 0) return { status: 'never', value: null };
  const f = (r) => fv(initial, monthlyAmt, r, months) - target;
  let lo = -0.5, hi = 1.0;
  if (f(lo) >= 0) return { status: 'zero', value: lo }; // 손해를 봐도 닿음
  if (f(hi) < 0) return { status: 'never', value: null };
  for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (f(mid) >= 0) hi = mid; else lo = mid; }
  const v = hi;
  return { status: v > 0.30 ? 'hard' : v > 0.15 ? 'stretch' : 'ok', value: v };
}

/** 보이는 값은 올림(보이는 대로 넣어도 목표에 모자라지 않게): 10만원 이상은 1만원, 그 아래는 1천원 단위 */
export const ceilMoney = (v) => (v >= 1e5 ? Math.ceil(v / 1e4 - 1e-9) * 1e4 : Math.ceil(v / 1e3 - 1e-9) * 1e3);
/** 수익률(비율) 0.1%p 단위 올림 */
export const ceilRate = (r) => Math.ceil(r * 1000 - 1e-7) / 1000;
/** 매달 늘리는 폭: 100만원 미만 +10만, 500만원 미만 +50만, 그 이상 +100만 */
export function monthlyStep(C) { const c = C > 0 ? C : 1e5; return c < 1e6 ? 1e5 : c < 5e6 ? 5e5 : 1e6; }
export const REAL_RATE = 0.07; // 대안에 쓰는 '현실적인 수익률' 기준
/** 구간별 수익률(연, %)로 n개월 굴린 값: segs [{from, to, rate}] (년차 기준) */
export function segFV(P0, C, segs, n) {
  let B = P0;
  for (let m = 1; m <= n; m++) {
    const y = Math.floor((m - 1) / 12) + 1;
    const g = segs.find((x) => x.from <= y && (x.to == null || y <= x.to)) || segs[segs.length - 1];
    B = B * (1 + monthly((+g.rate || 0) / 100)) + C;
  }
  return B;
}
/** 구간별 수익률과 같은 결과를 내는 한 가지 수익률(%, 0.1 단위) */
export function singleRatePct(P0, C, segs, n) {
  if (!segs?.length) return 5;
  if (segs.length === 1) return +segs[0].rate;
  if (!(n > 0) || (P0 <= 0 && C <= 0)) return +(segs.reduce((t, g) => t + +g.rate, 0) / segs.length).toFixed(1);
  const r = solveRate({ target: segFV(P0, C, segs, n), initial: P0, monthlyAmt: C, months: n });
  return r.value != null ? Math.round(r.value * 1000) / 10 : +segs[0].rate;
}
/** 저울에서 가져온 목표(오늘 돈 기준)를 물가만큼 키워도 닿는 가장 짧은 기간 */
export function solveMonthsReal({ today, infl, initial, monthlyAmt, rate }) {
  const i = monthly(rate);
  let B = initial;
  if (B >= today) return { months: 0, target: today };
  for (let n = 1; n <= MAX_MONTHS; n++) {
    B = B * (1 + i) + monthlyAmt;
    const T = today * Math.pow(1 + infl, n / 12);
    if (B >= T) return { months: n, target: T };
  }
  return null;
}

/**
 * 묻는 것에 따라 풀고, 보이는 값(올림)과 그 값으로 다시 계산한 만기 금액·대안을 만든다.
 * inp: {target, initial, monthlyAmt, rate(비율), months, refMonths?(못 닿을 때 기준 기간)}
 * 대안: {kind, text용 값, set:{바꿀 칸}, ask?(바꾼 뒤 물을 것)}
 */
export function solve(ask, inp) {
  const { target, initial = 0, monthlyAmt = 0, rate = 0, months = 0 } = inp;
  let ans;
  if (ask === 'years') ans = solveMonths({ target, initial, monthlyAmt, rate });
  else if (ask === 'monthly') ans = solveMonthly({ target, initial, rate, months });
  else if (ask === 'initial') ans = solveInitial({ target, monthlyAmt, rate, months });
  else ans = solveRate({ target, initial, monthlyAmt, months });
  const full = { target, initial, monthlyAmt, rate, months };
  let shown = null;
  if (ask === 'years' && ans.months != null) full.months = ans.months;
  if (ask === 'monthly' && ans.status === 'ok') { shown = ceilMoney(ans.value); full.monthlyAmt = shown; }
  if (ask === 'monthly' && ans.status === 'enough') { shown = 0; full.monthlyAmt = 0; }
  if (ask === 'initial' && ans.status === 'ok') { shown = ceilMoney(ans.value); full.initial = shown; }
  if (ask === 'initial' && ans.status === 'enough') { shown = 0; full.initial = 0; }
  if (ask === 'rate' && ans.status === 'zero') { shown = null; full.rate = Math.max(0, rate); } // 수익률과 상관없이 닿음: 수익률은 바꾸지 않음
  else if (ask === 'rate' && ans.value != null) { shown = ceilRate(ans.value); full.rate = shown; }
  const reach = ['ok', 'already', 'enough', 'zero', 'stretch', 'hard'].includes(ans.status);
  const end = reach ? fv(full.initial, full.monthlyAmt, full.rate, full.months) : null;
  const paid = reach ? paidIn(full.initial, full.monthlyAmt, full.months) : null;
  const alts = [];
  const H = inp.refMonths > 0 ? inp.refMonths : months > 0 ? months : 240;
  const step = monthlyStep(monthlyAmt);
  if (ask === 'years') {
    if (ans.status === 'ok') {
      const a = solveMonths({ target, initial, monthlyAmt: monthlyAmt + step, rate }); if (a.status === 'ok') alts.push({ kind: 'monthly', monthly: monthlyAmt + step, months: a.months, set: { monthly: monthlyAmt + step } });
      if (rate + 0.02 <= 0.15 + 1e-9) { const b = solveMonths({ target, initial, monthlyAmt, rate: rate + 0.02 }); if (b.status === 'ok') alts.push({ kind: 'rate', rate: rate + 0.02, months: b.months, set: { rate: rate + 0.02 } }); }
    } else if (ans.status === 'never') {
      const m = solveMonthly({ target, initial, rate, months: H }); if (m.status === 'ok') alts.push({ kind: 'needMonthly', months: H, monthly: ceilMoney(m.value), set: { monthly: ceilMoney(m.value) } });
      const r = solveRate({ target, initial, monthlyAmt, months: H });
      if (r.value != null && r.value <= 0.15) alts.push({ kind: 'needRate', months: H, rate: ceilRate(r.value), set: { rate: ceilRate(r.value) } });
      else { const iv = solveInitial({ target, monthlyAmt, rate, months: H }); if (iv.status === 'ok') alts.push({ kind: 'needInitial', months: H, initial: ceilMoney(iv.value), set: { initial: ceilMoney(iv.value) } }); }
    }
  } else if (ask === 'monthly' && ans.status === 'ok') {
    const a = solveMonthly({ target, initial, rate, months: months + 60 }); alts.push({ kind: 'longer', months: months + 60, monthly: a.status === 'ok' ? ceilMoney(a.value) : 0, set: { years: (months + 60) / 12 } });
    if (rate + 0.02 <= 0.15 + 1e-9) { const b = solveMonthly({ target, initial, rate: rate + 0.02, months }); alts.push({ kind: 'higherRate', rate: rate + 0.02, monthly: b.status === 'ok' ? ceilMoney(b.value) : 0, set: { rate: rate + 0.02 } }); }
    else { const b = solveMonthly({ target, initial: initial + 1e7, rate, months }); alts.push({ kind: 'moreInitial', plus: 1e7, monthly: b.status === 'ok' ? ceilMoney(b.value) : 0, set: { initial: initial + 1e7 } }); }
  } else if (ask === 'monthly' && ans.status === 'enough' && monthlyAmt > 0) {
    alts.push({ kind: 'zeroMonthly', set: { monthly: 0 } });
  } else if (ask === 'initial' && ans.status === 'ok') {
    const a = solveInitial({ target, monthlyAmt: monthlyAmt + step, rate, months }); alts.push({ kind: 'moreMonthly', monthly: monthlyAmt + step, initial: a.status === 'ok' ? ceilMoney(a.value) : 0, set: { monthly: monthlyAmt + step } });
    const b = solveInitial({ target, monthlyAmt, rate, months: months + 60 }); alts.push({ kind: 'longer', months: months + 60, initial: b.status === 'ok' ? ceilMoney(b.value) : 0, set: { years: (months + 60) / 12 } });
  } else if (ask === 'rate' && ['stretch', 'hard', 'never'].includes(ans.status)) {
    // 질문은 그대로(필요한 수익률) 두고 기간이나 매달을 바꿔서, 다시 계산하면 7% 안팎이 나오게
    const y = solveMonths({ target, initial, monthlyAmt, rate: REAL_RATE }); if (y.status === 'ok') alts.push({ kind: 'yearsAtReal', rate: REAL_RATE, months: y.months, set: { years: Math.ceil(y.months / 12) } });
    const m = solveMonthly({ target, initial, rate: REAL_RATE, months }); if (m.status === 'ok') alts.push({ kind: 'monthlyAtReal', rate: REAL_RATE, months, monthly: ceilMoney(m.value), set: { monthly: ceilMoney(m.value) } });
  }
  return { ask, ans, shown, full, end, paid, gain: end != null && paid != null ? end - paid : null, alts };
}
