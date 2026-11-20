// 목표·노후 계산 엔진 — 월 단위 결정론 계산(퀀트 제안서 03_quant.md / quant_reference.py와 같은 규칙)
// - 연 수익률 r → 월 (1+r)^(1/12) − 1 (실효 복리, 기본)
// - 적립: 월말, 은퇴 후 인출: 월초, 물가는 12개월마다 계단식으로 반영

export function monthlyRate(r, comp = 'effective') {
  return comp === 'nominal' ? r / 12 : Math.pow(1 + r, 1 / 12) - 1;
}
export function realRate(n, i) { return (1 + n) / (1 + i) - 1; }

/** segments: [{fromYear, toYear, rate}] (rate: 비율). 마지막 구간은 끝없이 이어짐 */
export function rateForYear(segs, y, delta = 0) {
  const s = [...segs].sort((a, b) => a.fromYear - b.fromYear);
  for (const g of s) if (g.fromYear <= y && (g.toYear == null || y <= g.toYear)) return g.rate + delta;
  const last = s[s.length - 1];
  if (y > (last.toYear ?? Infinity) || y > last.fromYear) return last.rate + delta;
  return s[0].rate + delta;
}
export function validateSegments(segs) {
  const s = [...segs].sort((a, b) => a.fromYear - b.fromYear);
  if (!s.length) return '수익률 구간이 비어 있어요.';
  if (s[0].fromYear !== 1) return '1년차부터 시작해야 해요.';
  for (let i = 1; i < s.length; i++) {
    if (s[i - 1].toYear == null) return `${s[i - 1].fromYear}년차 구간이 끝까지 이어져서 뒤 구간이 쓰이지 않아요.`;
    if (s[i].fromYear !== s[i - 1].toYear + 1) return `${s[i - 1].toYear + 1}년차 수익률이 비어 있거나 겹쳐요.`;
  }
  if (s.some((g) => g.rate <= -1)) return '수익률은 −100%보다 커야 해요.';
  return null;
}

/**
 * 적립기 미래가치
 * inp = {initial, monthly, monthlyGrowth(연, 12개월 계단), months|years, segments, compounding, timing('end'|'begin'), lumps:[{month, amount}], inflation, saveMonths?}
 */
export function fvPlan(inp, { delta = 0, months = null, monthly = null, initial = null, lumps = true } = {}) {
  const M = months ?? inp.months ?? Math.round((inp.years || 0) * 12);
  let B = initial ?? inp.initial ?? 0;
  const C0 = monthly ?? inp.monthly ?? 0;
  const g = inp.monthlyGrowth || 0;
  const comp = inp.compounding || 'effective';
  const saveM = inp.saveMonths ?? Infinity;
  const L = new Map();
  if (lumps) for (const x of inp.lumps || []) L.set(x.month, (L.get(x.month) || 0) + x.amount);
  let total = B;
  const path = [B];
  for (let m = 1; m <= M; m++) {
    const y = Math.floor((m - 1) / 12) + 1;
    const rm = monthlyRate(rateForYear(inp.segments, y, delta), comp);
    const C = m <= saveM ? C0 * Math.pow(1 + g, y - 1) : 0;
    if (inp.timing === 'begin') B = (B + C) * (1 + rm); else B = B * (1 + rm) + C;
    total += C;
    if (L.has(m)) { B += L.get(m); total += L.get(m); }
    path.push(B);
  }
  const infl = inp.inflation || 0;
  return { fv: B, fvReal: B / Math.pow(1 + infl, M / 12), totalContrib: total, gain: B - total, path };
}

export function requiredMonthly(inp, target, opt = {}) {
  const fv0 = fvPlan(inp, { ...opt, monthly: 0 }).fv;
  const fvu = fvPlan(inp, { ...opt, monthly: 1, initial: 0, lumps: false }).fv;
  if (fvu <= 0) return { status: 'invalid', monthly: null };
  const c = (target - fv0) / fvu;
  if (c <= 0) return { status: 'already', monthly: 0, surplus: fv0 - target, fvWithoutContrib: fv0 };
  return { status: 'ok', monthly: c, fv0, fvUnit: fvu };
}

export function requiredRate(inp, target, { hi = 1, tol = 1e-10, months = null } = {}) {
  let lo = -0.99 - Math.min(...inp.segments.map((s) => s.rate));
  const f = (d) => fvPlan(inp, { delta: d, months }).fv - target;
  const fhi = f(hi), flo = f(lo);
  if (fhi < 0) return { status: 'unreachable', delta: null, fvAtHi: fhi + target };
  if (flo > 0) return { status: 'always', delta: null };
  for (let k = 0; k < 300 && hi - lo >= tol; k++) {
    const mid = (lo + hi) / 2;
    if (f(mid) >= 0) hi = mid; else lo = mid;
  }
  const d = (lo + hi) / 2;
  return { status: 'ok', delta: d, rates: inp.segments.map((s) => ({ ...s, rate: s.rate + d })) };
}

/** 단일 수익률로 환산(같은 미래가치를 내는 한 가지 연수익률) */
export function equivalentSingleRate(inp, target, months = null) {
  const one = { ...inp, segments: [{ fromYear: 1, toYear: null, rate: 0 }] };
  const r = requiredRate(one, target, { months });
  return r.status === 'ok' ? r.delta : null;
}

export function requiredMonths(inp, target, { maxMonths = 1200, targetIsReal = false } = {}) {
  const infl = inp.inflation || 0;
  // 한 번 돌리면서 경로를 확인(빠름)
  const full = fvPlan({ ...inp, saveMonths: inp.saveMonths }, { months: maxMonths });
  for (let M = 0; M <= maxMonths; M++) {
    const T = targetIsReal ? target * Math.pow(1 + infl, M / 12) : target;
    if (full.path[M] >= T) return { status: 'ok', months: M, years: Math.floor(M / 12), remMonths: M % 12, fv: full.path[M] };
  }
  return { status: 'unreachable', months: null };
}

/**
 * 은퇴기 월별 생활비·연금·순인출(명목)
 * inp = {currentAge, retireAge, endAge, monthlyExpenseToday, inflation, pensions:[{monthly, basis, startAge, endAge, indexed}], events:[{age, amount, dir, inflate}], allowSurplus}
 */
export function retirementSchedule(inp) {
  const i = inp.inflation;
  const Mr = Math.round((inp.retireAge - inp.currentAge) * 12);
  const N = Math.round((inp.endAge - inp.retireAge) * 12);
  const F = (k) => Math.pow(1 + i, Mr / 12 + Math.floor(k / 12));
  const pens = inp.pensions || [];
  const kstart = pens.map((p) => {
    for (let k = 0; k < N; k++) if (inp.retireAge + k / 12 >= p.startAge - 1e-9) return k;
    return null;
  });
  const rows = [];
  for (let k = 0; k < N; k++) {
    const age = inp.retireAge + k / 12;
    const exp = (inp.expenseAt ? inp.expenseAt(age) : inp.monthlyExpenseToday) * F(k);
    let pen = 0;
    pens.forEach((p, j) => {
      const ks = kstart[j];
      if (ks == null || k < ks) return;
      if (p.endAge != null && age >= p.endAge - 1e-9) return;
      const basis = p.basis || 'today';
      if (p.indexed !== false) pen += basis === 'today' ? p.monthly * F(k) : (p.monthly * F(k)) / F(ks);
      else pen += basis === 'today' ? p.monthly * F(ks) : p.monthly;
    });
    let ev = 0;
    for (const e of inp.events || []) {
      const reps = e.years || 1;
      for (let r = 0; r < reps; r++) {
        if (Math.round((e.age + r - inp.retireAge) * 12) === k) {
          const amt = e.inflate !== false ? e.amount * Math.pow(1 + i, (e.age + r - inp.currentAge)) : e.amount;
          ev += e.dir === 'in' ? -amt : amt;
        }
      }
    }
    let net = exp - pen + ev;
    if (!inp.allowSurplus) net = Math.max(0, net);
    rows.push({ k, age, expense: exp, pension: pen, event: ev, net });
  }
  return { rows, Mr, N };
}

export function retirementNeed(inp) {
  const { rows, Mr, N } = retirementSchedule(inp);
  const comp = inp.compounding || 'effective';
  const timing = inp.withdrawTiming || 'begin';
  const D = [1];
  for (let j = 1; j <= N; j++) {
    const y = Math.floor((j - 1) / 12) + 1;
    const rho = monthlyRate(rateForYear(inp.retireSegments, y, inp.retireDelta || 0), comp);
    D.push(D[j - 1] / (1 + rho));
  }
  let need = 0;
  for (const r of rows) need += r.net * (timing === 'begin' ? D[r.k] : D[r.k + 1]);
  need += (inp.legacy || 0) * D[N];
  return {
    needAtRetire: need, needToday: need / Math.pow(1 + inp.inflation, Mr / 12), months: N,
    firstNet: rows[0]?.net || 0, firstExpense: rows[0]?.expense || 0, rows,
  };
}

/** 적립기 → 은퇴기 전체(고갈 나이) */
export function lifePlan(acc, ret) {
  const Mr = Math.round((ret.retireAge - ret.currentAge) * 12);
  const a = fvPlan(acc, { months: Mr });
  let B = a.fv;
  const { rows } = retirementSchedule(ret);
  const comp = ret.compounding || 'effective';
  const timing = ret.withdrawTiming || 'begin';
  let dk = null;
  const path = [...a.path];
  for (const r of rows) {
    const y = Math.floor(r.k / 12) + 1;
    const rho = monthlyRate(rateForYear(ret.retireSegments, y), comp);
    if (timing === 'begin') {
      if (B < r.net) { dk = r.k; B = 0; path.push(0); break; }
      B = (B - r.net) * (1 + rho);
    } else {
      B *= 1 + rho;
      if (B < r.net) { dk = r.k; B = 0; path.push(0); break; }
      B -= r.net;
    }
    path.push(B);
  }
  const need = retirementNeed(ret);
  const out = { fvAtRetire: a.fv, needAtRetire: need.needAtRetire, needToday: need.needToday, gapAtRetire: a.fv - need.needAtRetire, endBalance: B, path, rows, accPath: a.path, totalContrib: a.totalContrib };
  if (dk == null) out.depletionAge = null;
  else {
    const am = Math.round(ret.retireAge * 12) + dk;
    Object.assign(out, { depletionAge: am / 12, depletionAgeYears: Math.floor(am / 12), depletionAgeMonths: am % 12, depletionMonthIndex: dk });
  }
  return out;
}

// ------------------------------------------------------------------ 화면용 묶음 계산
const pct = (x) => (+x || 0) / 100;
export function segsFromUi(list) {
  return list.map((s) => ({ fromYear: +s.from, toYear: s.to == null || s.to === '' ? null : +s.to, rate: pct(s.rate) }));
}

/** 화면 상태(st) → 계산 결과 묶음 */
export function computePlan(st) {
  const infl = pct(st.inflation);
  const accSegs = segsFromUi(st.accSegs);
  const decSegs = segsFromUi(st.decSegs);
  const errAcc = validateSegments(accSegs), errDec = validateSegments(decSegs);
  if (st.mode === 'goal') return computeGoal(st, accSegs, infl, errAcc);
  const Mr = Math.round((st.retireAge - st.age) * 12);
  const saveMonths = Math.round(((st.saveUntilAge ?? st.retireAge) - st.age) * 12);
  const lumpsAcc = eventsToLumps(st.events, st.age, st.retireAge, infl, true);
  const acc = { initial: +st.initial || 0, monthly: +st.monthly || 0, monthlyGrowth: pct(st.monthlyGrowth), segments: accSegs, compounding: 'effective', timing: 'end', lumps: lumpsAcc, inflation: infl, saveMonths };
  const ret = {
    currentAge: +st.age, retireAge: +st.retireAge, endAge: +st.endAge, monthlyExpenseToday: +st.expenseToday || 0, inflation: infl,
    pensions: (st.pensions || []).map((p) => ({ monthly: +p.monthly || 0, basis: 'today', startAge: +p.startAge, endAge: p.years ? +p.startAge + +p.years : null, indexed: p.indexed !== false })),
    events: (st.events || []).filter((e) => e.age >= st.retireAge).map((e) => ({ age: +e.age, amount: +e.amount || 0, dir: e.dir, inflate: e.inflate !== false, years: +e.years || 1 })),
    retireSegments: decSegs, compounding: 'effective', withdrawTiming: 'begin', legacy: +st.legacy || 0,
  };
  const lp = lifePlan(acc, ret);
  const gap = lp.fvAtRetire - lp.needAtRetire;
  const toToday = (v, m) => v / Math.pow(1 + infl, m / 12);
  // 역산(대안)
  const alts = [];
  if (gap < 0) {
    const rm = requiredMonthly(acc, lp.needAtRetire, { months: Mr });
    if (rm.status === 'ok') alts.push({ id: 'monthly', label: '월 적립액 늘리기', value: rm.monthly, from: +st.monthly || 0, apply: { monthly: Math.ceil(rm.monthly / 10000) * 10000 } });
    const rr = requiredRate(acc, lp.needAtRetire, { months: Mr });
    if (rr.status === 'ok') alts.push({ id: 'rate', label: '적립기 수익률 올리기', value: rr.delta, single: equivalentSingleRate(acc, lp.needAtRetire, Mr), apply: { accSegs: st.accSegs.map((s) => ({ ...s, rate: +(+s.rate + rr.delta * 100).toFixed(2) })) } });
    const ra = solveRetireAge(st);
    if (ra) alts.push({ id: 'retire', label: '은퇴 늦추기', value: ra, from: st.retireAge, apply: { retireAge: ra } });
  }
  const se = solveSustainableExpense(st);
  if (se != null) alts.push({ id: 'expense', label: gap < 0 ? '생활비 줄이기' : '써도 되는 생활비', value: se, from: +st.expenseToday, apply: { expenseToday: Math.floor(se / 10000) * 10000 } });
  // 연도별 표
  const years = [];
  const totalM = lp.path.length - 1;
  for (let m = 0; m <= totalM; m += 12) {
    const age = st.age + m / 12;
    years.push({ age, year: new Date().getFullYear() + m / 12, balance: lp.path[m], real: toToday(lp.path[m], m) });
  }
  return {
    mode: 'retire', errAcc, errDec, Mr, infl, lp, gap, alts, years,
    needToday: lp.needToday, needAtRetire: lp.needAtRetire, fvAtRetire: lp.fvAtRetire, fvToday: toToday(lp.fvAtRetire, Mr),
    incomeTable: incomeTable(lp.fvAtRetire, infl, Mr),
    firstExpense: lp.rows[0]?.expense || 0, firstPension: lp.rows[0]?.pension || 0,
  };
}

function eventsToLumps(events, age, retireAge, infl, accOnly) {
  const out = [];
  for (const e of events || []) {
    const reps = +e.years || 1;
    for (let r = 0; r < reps; r++) {
      const a = +e.age + r;
      if (accOnly && a >= retireAge) continue;
      const m = Math.round((a - age) * 12);
      if (m < 1) continue;
      const amt = e.inflate !== false ? (+e.amount || 0) * Math.pow(1 + infl, a - age) : +e.amount || 0;
      out.push({ month: m, amount: e.dir === 'in' ? amt : -amt });
    }
  }
  return out;
}

function solveRetireAge(st) {
  for (let a = +st.retireAge + 1; a <= Math.min(+st.endAge - 1, +st.retireAge + 15); a++) {
    const r = computePlan({ ...st, retireAge: a, saveUntilAge: Math.max(st.saveUntilAge ?? st.retireAge, a), _noAlt: true });
    if (r.gap >= 0) return a;
  }
  return null;
}
function solveSustainableExpense(st) {
  if (st._noAlt) return null;
  let lo = 0, hi = Math.max(1e6, (+st.expenseToday || 0) * 4);
  const ok = (x) => {
    const r = computePlan({ ...st, expenseToday: x, _noAlt: true });
    return r.lp.depletionAge == null;
  };
  if (!ok(lo)) return null;
  for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
  return lo;
}

/** 은퇴 자산에서 매년 x%를 꺼내 쓸 때 월 수입(그때 가치·오늘 가치) */
export function incomeTable(asset, infl, monthsAhead, rates = [2, 3, 4, 5, 6]) {
  return rates.map((r) => ({ rate: r, monthly: (asset * r) / 100 / 12, monthlyToday: (asset * r) / 100 / 12 / Math.pow(1 + infl, monthsAhead / 12) }));
}

function computeGoal(st, accSegs, infl, errAcc) {
  const M = Math.round((+st.goalYears || 0) * 12);
  const lumps = eventsToLumps(st.events, 0, Infinity, infl, false).map((l) => l); // 목표 모드: 나이 대신 '몇 년 뒤'
  const inp = { initial: +st.initial || 0, monthly: +st.monthly || 0, monthlyGrowth: pct(st.monthlyGrowth), segments: accSegs, compounding: 'effective', timing: 'end', lumps, inflation: infl, months: M };
  const fv = fvPlan(inp);
  const targetNominal = st.goalBasis === 'today' ? (+st.goalAmount || 0) * Math.pow(1 + infl, M / 12) : +st.goalAmount || 0;
  const targetToday = targetNominal / Math.pow(1 + infl, M / 12);
  const gap = fv.fv - targetNominal;
  // 지금 한 번에 넣는다면 필요한 돈(현재가치): 목표를 구간 수익률로 할인
  let disc = 1;
  for (let m = 1; m <= M; m++) disc /= 1 + monthlyRate(rateForYear(accSegs, Math.floor((m - 1) / 12) + 1), 'effective');
  const pvNeeded = targetNominal * disc;
  const reqM = requiredMonthly(inp, targetNominal);
  const reqMNominalTarget = requiredMonthly(inp, +st.goalAmount || 0);
  const reqMRealTarget = requiredMonthly(inp, (+st.goalAmount || 0) * Math.pow(1 + infl, M / 12));
  const reqR = requiredRate(inp, targetNominal);
  const reqY = requiredMonths(inp, targetNominal, { maxMonths: 1200 });
  const alts = [];
  if (gap < 0) {
    if (reqM.status === 'ok') alts.push({ id: 'monthly', label: '월 납입액 늘리기', value: reqM.monthly, from: +st.monthly || 0, apply: { monthly: Math.ceil(reqM.monthly / 10000) * 10000 } });
    if (reqR.status === 'ok') alts.push({ id: 'rate', label: '수익률 올리기', value: reqR.delta, single: equivalentSingleRate(inp, targetNominal), apply: { accSegs: st.accSegs.map((s) => ({ ...s, rate: +(+s.rate + reqR.delta * 100).toFixed(2) })) } });
    if (reqY.status === 'ok') alts.push({ id: 'years', label: '기간 늘리기', value: reqY.months, from: M, apply: { goalYears: Math.ceil(reqY.months / 12) } });
  }
  const years = [];
  for (let m = 0; m <= M; m += 12) years.push({ y: m / 12, year: new Date().getFullYear() + m / 12, balance: fv.path[m], real: fv.path[m] / Math.pow(1 + infl, m / 12) });
  if (M % 12) years.push({ y: M / 12, year: new Date().getFullYear() + M / 12, balance: fv.path[M], real: fv.path[M] / Math.pow(1 + infl, M / 12) });
  return {
    mode: 'goal', errAcc, M, infl, fv, gap, alts, years, targetNominal, targetToday, pvNeeded,
    reqM, reqMNominalTarget, reqMRealTarget, reqR, reqY,
    incomeTable: incomeTable(targetNominal, infl, M),
  };
}
