// 매수·매도 타이밍과 조건부 리밸런싱 — 지표 계산과 규칙 판단(순수 계산)
//
// 규칙(rule): {type, ...}
//   ma     가격이 이동평균 아래/위         {n:200, unit:'d'|'m', op:'below'|'above'}
//   cross  단기·장기 이동평균 교차 상태    {fast:50, slow:200, op:'dead'|'golden'}
//   ret    기간 수익률                     {n:12, unit:'m'|'d', op:'below'|'above', th:0 | 'cash'}
//   dd     고점 대비 낙폭                  {th:-15, op:'below'|'above'}
//   rsi    RSI(와일더)                     {n:14, op:'below'|'above', th:30}
//   bb     볼린저 밴드                     {n:20, k:2, op:'belowLower'|'aboveUpper'}
//   macd   MACD(12,26,9)                   {op:'bear'|'bull'}
//   vix    VIX 수준(신호 대상과 무관)      {op:'above'|'below', th:30}
//   trail  트레일링 스톱(매도 전용)        {th:-10}  — 들어간 뒤 최고가 대비
//
// 타이밍(timing): {kind:'switch'|'trigger'|'scale', signal:'SPY'|'self'|'each'|키, sell, buy, rule, to, check:'D'|'M', startIn, cooldown, targetVol, volWindow}
//   switch  매도 조건이면 방어 자산(to)으로, 매수 조건이면 원래 비중으로(판단 다음 거래일 종가에 실행)
//   trigger 조건이 참이 되는 순간 목표 비중으로 리밸런싱(다시 거짓이 됐다가 참이 되면 또)
//   scale   변동성 맞추기: 위험 자산 비중 = min(1, 목표 변동성 ÷ 최근 실제 변동성), 나머지는 방어 자산
import { dayToYm } from './dates.js';

export const RULE_LABEL = {
  ma: (r) => `${r.n}${r.unit === 'm' ? '개월' : '일'} 이동평균선 ${r.op === 'above' ? '위' : '아래'}`,
  cross: (r) => `${r.fast}·${r.slow}일선 ${r.op === 'golden' ? '골든크로스(단기선이 위)' : '데드크로스(단기선이 아래)'}`,
  ret: (r) => `${r.n}${r.unit === 'd' ? '거래일' : '개월'} 수익률이 ${r.th === 'cash' ? '단기채보다' : `${r.th}%`} ${r.op === 'above' ? (r.th === 'cash' ? '높음' : '이상') : (r.th === 'cash' ? '낮음' : '이하')}`,
  dd: (r) => `고점 대비 ${r.th}% ${r.op === 'above' ? '위로 회복' : '이상 하락'}`,
  rsi: (r) => `RSI(${r.n || 14}) ${r.th} ${r.op === 'above' ? '이상' : '이하'}`,
  bb: (r) => `볼린저 밴드 ${r.op === 'aboveUpper' ? '위쪽 선 돌파' : '아래쪽 선 이탈'}`,
  macd: (r) => `MACD ${r.op === 'bull' ? '시그널선 위(상승 전환)' : '시그널선 아래(하락 전환)'}`,
  vix: (r) => `VIX ${r.th} ${r.op === 'above' ? '이상' : '이하'}`,
  trail: (r) => `산 뒤 최고가 대비 ${r.th}% 하락`,
};
export function ruleText(r) { return r ? (RULE_LABEL[r.type]?.(r) || r.type) : ''; }
/** '…면'으로 끝나는 조건절: 'S&P 500이 10개월선 아래로 내려가면' */
export function condText(r) {
  if (!r) return '';
  const unit = r.unit === 'm' ? '개월' : '일';
  switch (r.type) {
    case 'ma': return `${r.n}${unit}선 ${r.op === 'above' ? '위로 올라오면' : '아래로 내려가면'}`;
    case 'cross': return r.op === 'golden' ? `${r.fast}일선이 ${r.slow}일선 위로 올라가면(골든크로스)` : `${r.fast}일선이 ${r.slow}일선 아래로 내려가면(데드크로스)`;
    case 'ret': return `${r.n}${r.unit === 'd' ? '거래일' : '개월'} 수익률이 ${r.th === 'cash' ? '단기채보다' : `${r.th}%보다`} ${r.op === 'above' ? '높으면' : '낮으면'}`;
    case 'dd': return r.op === 'above' ? `고점 대비 ${r.th}% 안으로 회복하면` : `고점 대비 ${Math.abs(r.th)}% 넘게 빠지면`;
    case 'rsi': return `RSI가 ${r.th} ${r.op === 'above' ? '이상이면' : '이하면'}`;
    case 'vix': return `VIX가 ${r.th} ${r.op === 'above' ? '이상이면' : '이하면'}`;
    case 'bb': return r.op === 'aboveUpper' ? '볼린저 밴드 위쪽 선을 넘으면' : '볼린저 밴드 아래쪽 선 밑으로 가면';
    case 'macd': return r.op === 'bull' ? 'MACD가 시그널선 위로 올라가면' : 'MACD가 시그널선 아래로 내려가면';
    case 'trail': return `산 뒤 최고가에서 ${Math.abs(r.th)}% 빠지면`;
    default: return ruleText(r);
  }
}
export const DEF_LABEL = { CASH: '현금(0%)', BIL: '미국 초단기채(BIL)', SHY: '미국 단기채(SHY)', IEF: '미국 7~10년 국채(IEF)', TLT: '미국 장기채(TLT)', AGG: '미국 종합채권(AGG)', 153130: 'KODEX 단기채권', 148070: 'KOSEF 국고채10년' };

/** 반대 규칙(매수 조건을 비워 두면 매도 조건의 반대로 돌아옴) */
export function negate(r) {
  if (!r) return null;
  const flip = { below: 'above', above: 'below', dead: 'golden', golden: 'dead', bear: 'bull', bull: 'bear', belowLower: 'aboveUpper', aboveUpper: 'belowLower' };
  return { ...r, op: flip[r.op] || r.op };
}
export const STATEFUL = new Set(['ma', 'cross', 'ret', 'macd', 'vix', 'dd']); // 상태형(반대가 자연스러운) 규칙
/** 매수 조건을 비워 둘 때 쓰는 기본 복귀 조건 */
export function defaultBuy(sell) {
  if (!sell) return null;
  if (STATEFUL.has(sell.type)) return negate(sell);
  if (sell.type === 'rsi') return { type: 'rsi', n: sell.n || 14, op: sell.op === 'above' ? 'below' : 'above', th: sell.op === 'above' ? 30 : 70 };
  if (sell.type === 'bb') return { type: 'bb', n: sell.n || 20, k: sell.k || 2, op: sell.op === 'aboveUpper' ? 'belowLower' : 'aboveUpper' };
  if (sell.type === 'trail') return { type: 'ma', n: 10, unit: 'm', op: 'above' };
  return negate(sell);
}

// ------------------------------------------------------------------ 지표(원시 일별 배열)
export function sma(v, n) {
  const out = new Float64Array(v.length).fill(NaN); let s = 0;
  for (let i = 0; i < v.length; i++) { s += v[i]; if (i >= n) s -= v[i - n]; if (i >= n - 1) out[i] = s / n; }
  return out;
}
export function ema(v, n) {
  const out = new Float64Array(v.length).fill(NaN); const k = 2 / (n + 1); let e = NaN;
  for (let i = 0; i < v.length; i++) { e = i === 0 ? v[0] : v[i] * k + e * (1 - k); if (i >= n - 1) out[i] = e; }
  return out;
}
/** RSI(와일더 평활) */
export function rsi(v, n = 14) {
  const out = new Float64Array(v.length).fill(NaN);
  let g = 0, l = 0;
  for (let i = 1; i < v.length; i++) {
    const d = v[i] - v[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n) { g += up; l += dn; if (i === n) { g /= n; l /= n; out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } continue; }
    g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n;
    out[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l);
  }
  return out;
}
export function rollingStd(v, n) {
  const out = new Float64Array(v.length).fill(NaN);
  for (let i = n - 1; i < v.length; i++) { let s = 0, s2 = 0; for (let j = i - n + 1; j <= i; j++) { s += v[j]; s2 += v[j] * v[j]; } const m = s / n; out[i] = Math.sqrt(Math.max(0, (s2 - n * m * m) / (n - 1))); }
  return out;
}
/** 월말 기준 n개월 이동평균(현재 값은 그날 종가, 이전은 지난 달들의 월말 종가) */
export function monthlySma(day, v, n) {
  const out = new Float64Array(v.length).fill(NaN);
  const ends = []; // 완결된 달의 월말 값
  let curYm = null, lastV = null;
  for (let i = 0; i < v.length; i++) {
    const ym = dayToYm(day[i]);
    if (curYm !== null && ym !== curYm) ends.push(lastV);
    curYm = ym; lastV = v[i];
    if (ends.length >= n - 1) { let s = v[i]; for (let k = ends.length - (n - 1); k < ends.length; k++) s += ends[k]; out[i] = s / n; }
  }
  return out;
}
/** n개월 전(같은 날 근처의 지난 달 말) 대비 수익률 */
export function monthlyRet(day, v, n) {
  const out = new Float64Array(v.length).fill(NaN);
  const ends = []; let curYm = null, lastV = null;
  for (let i = 0; i < v.length; i++) {
    const ym = dayToYm(day[i]);
    if (curYm !== null && ym !== curYm) ends.push(lastV);
    curYm = ym; lastV = v[i];
    if (ends.length >= n) out[i] = v[i] / ends[ends.length - n] - 1;
  }
  return out;
}

/** 규칙 하나를 원시 일별 시계열에 적용 → Uint8Array(참/거짓), NaN 구간은 0 */
export function ruleSeries(rule, px, extra = {}) {
  const v = px.v, day = px.day, n = v.length;
  const out = new Uint8Array(n);
  const t = rule.type;
  const set = (arr, f) => { for (let i = 0; i < n; i++) out[i] = isFinite(arr[i]) && f(i, arr[i]) ? 1 : 0; };
  if (t === 'ma') {
    const m = rule.unit === 'm' ? monthlySma(day, v, rule.n || 10) : sma(v, rule.n || 200);
    set(m, (i, x) => (rule.op === 'above' ? v[i] > x : v[i] < x));
  } else if (t === 'cross') {
    const f = sma(v, rule.fast || 50), s = sma(v, rule.slow || 200);
    for (let i = 0; i < n; i++) out[i] = isFinite(s[i]) && (rule.op === 'golden' ? f[i] > s[i] : f[i] < s[i]) ? 1 : 0;
  } else if (t === 'ret') {
    const r = rule.unit === 'd' ? (() => { const a = new Float64Array(n).fill(NaN); const k = rule.n || 20; for (let i = k; i < n; i++) a[i] = v[i] / v[i - k] - 1; return a; })() : monthlyRet(day, v, rule.n || 12);
    const cash = rule.th === 'cash' ? extra.cashRet : null; // 같은 달력의 단기채 수익률
    set(r, (i, x) => { const th = cash ? cash[i] : (+rule.th || 0) / 100; if (!isFinite(th)) return false; return rule.op === 'above' ? x > th : x < th; });
  } else if (t === 'dd') {
    const a = new Float64Array(n); let pk = -Infinity;
    for (let i = 0; i < n; i++) { pk = Math.max(pk, v[i]); a[i] = v[i] / pk - 1; }
    const th = (+rule.th || -15) / 100;
    set(a, (i, x) => (rule.op === 'above' ? x > th : x <= th));
  } else if (t === 'rsi') {
    const r = rsi(v, rule.n || 14);
    set(r, (i, x) => (rule.op === 'above' ? x >= +rule.th : x <= +rule.th));
  } else if (t === 'bb') {
    const m = sma(v, rule.n || 20), sd = rollingStd(v, rule.n || 20), k = +rule.k || 2;
    set(m, (i, x) => (rule.op === 'aboveUpper' ? v[i] > x + k * sd[i] : v[i] < x - k * sd[i]));
  } else if (t === 'macd') {
    const e12 = ema(v, 12), e26 = ema(v, 26);
    const macd = new Float64Array(n); for (let i = 0; i < n; i++) macd[i] = e12[i] - e26[i];
    const first = macd.findIndex((x) => isFinite(x));
    const sig = new Float64Array(n).fill(NaN);
    if (first >= 0) { const e = ema(macd.slice(first), 9); sig.set(e, first); }
    set(sig, (i, x) => (rule.op === 'bull' ? macd[i] > x : macd[i] < x));
  } else if (t === 'vix') {
    const vx = extra.vix; // 같은 원시 달력에 맞춘 VIX
    if (vx) set(vx, (i, x) => (rule.op === 'above' ? x >= +rule.th : x <= +rule.th));
  }
  return out;
}

/** 원시 시계열의 값을 백테스트 달력(days)에 맞춤(직전값) */
export function alignTo(srcDay, arr, days) {
  const out = new (arr instanceof Uint8Array ? Uint8Array : Float64Array)(days.length);
  let j = -1;
  for (let i = 0; i < days.length; i++) {
    while (j + 1 < srcDay.length && srcDay[j + 1] <= days[i]) j++;
    out[i] = j >= 0 ? arr[j] : (arr instanceof Uint8Array ? 0 : NaN);
  }
  return out;
}

/**
 * 타이밍 계획 만들기 — 신호는 미리 계산할 수 있어서(포트폴리오 실제 잔고와 무관) 결과는 '날짜별 노출 비율'
 * sig: {day, v} 신호 대상의 원시 일별 시계열(each면 배열), days: 백테스트 달력, isCheck: 판단일 표시(Uint8Array)
 * 반환: {expo: Float64Array(0~1, 날짜별 위험 자산 비율), expoEach?: Float64Array[] , events:[{i, kind:'sell'|'buy'|'reb', why}], fires:[i]}
 */
export function planTiming(tm, sigs, days, isCheck, extra = {}) {
  const n = days.length;
  const expo = new Float64Array(n).fill(1);
  const events = [];
  if (!tm || !tm.kind) return { expo, events };
  const lag = 1; // 판단 다음 거래일 종가에 실행(미래 정보 차단)
  if (tm.kind === 'scale') {
    // 목표 변동성 / 최근 실제 변동성(일간 수익률 표준편차 × √252), 판단일마다 갱신
    const ix = sigs.self; // 목표 비중 지수(같은 달력)
    const w = tm.volWindow || 63, tv = (+tm.targetVol || 15) / 100;
    let cur = 1, pending = null;
    for (let i = 0; i < n; i++) {
      if (pending && pending.at === i) { cur = pending.e; events.push({ i, kind: 'scale', e: cur }); pending = null; }
      expo[i] = cur;
      if (isCheck[i] && i >= w) {
        let s = 0, s2 = 0, k = 0;
        for (let j = i - w + 1; j <= i; j++) { const r = ix[j] / ix[j - 1] - 1; if (isFinite(r)) { s += r; s2 += r * r; k++; } }
        if (k > 5) { const m = s / k; const vol = Math.sqrt(Math.max(0, (s2 - k * m * m) / (k - 1))) * Math.sqrt(252); const e = Math.max(0, Math.min(1, vol > 0 ? tv / vol : 1)); if (Math.abs(e - cur) > 0.02 && i + lag < n) pending = { at: i + lag, e: Math.round(e * 100) / 100 }; }
      }
    }
    return { expo, events };
  }
  const mk = (rule, s) => {
    if (!rule) return null;
    if (rule.type === 'trail') return null; // 상태 기계에서 처리
    const raw = ruleSeries(rule, s, { cashRet: s.cashRet, vix: s.vix });
    return alignTo(s.day, raw, days);
  };
  const runOne = (s) => {
    const e = new Float64Array(n).fill(1);
    const ev = [];
    if (tm.kind === 'trigger') {
      const c = mk(tm.rule, s);
      let prev = 0, lastFire = -1e9;
      for (let i = 0; i < n; i++) {
        const now = c ? c[i] : 0;
        if (isCheck[i] && now && !prev && i - lastFire >= (tm.cooldown || 0) && i + lag < n) { ev.push({ i: i + lag, kind: 'reb', at: i }); lastFire = i; }
        if (isCheck[i]) prev = now;
      }
      return { e, ev };
    }
    // switch
    const sell = mk(tm.sell, s);
    const buyRule = tm.buy || defaultBuy(tm.sell);
    const buy = mk(buyRule, s);
    const sv = alignTo(s.day, s.v, days);
    const trail = tm.sell?.type === 'trail' ? (+tm.sell.th || -10) / 100 : null;
    let inMkt = tm.startIn !== false, peak = -Infinity, pending = null;
    // 시작일 판단: 매도 조건이 이미 참이면 처음부터 쉬고 시작
    if (inMkt && sell && sell[0]) inMkt = false;
    if (!inMkt && tm.startIn === false && buy && buy[0]) inMkt = true;
    for (let i = 0; i < n; i++) {
      if (pending && pending.at === i) { inMkt = pending.to; ev.push({ i, kind: inMkt ? 'buy' : 'sell', at: pending.from }); if (inMkt) peak = isFinite(sv[i]) ? sv[i] : -Infinity; pending = null; }
      e[i] = inMkt ? 1 : 0;
      if (inMkt && isFinite(sv[i])) peak = Math.max(peak, sv[i]);
      if (!isCheck[i] || pending || i + lag >= n) continue;
      if (inMkt) {
        const hit = trail != null ? (isFinite(peak) && sv[i] <= peak * (1 + trail)) : !!(sell && sell[i]);
        if (hit) pending = { at: i + lag, to: false, from: i };
      } else {
        const hit = buy ? !!buy[i] : (trail != null ? true : false);
        if (hit) pending = { at: i + lag, to: true, from: i };
      }
    }
    return { e, ev };
  };
  if (tm.signal === 'each' && Array.isArray(sigs.each)) {
    const expoEach = sigs.each.map((s) => runOne(s));
    expoEach.forEach((x, j) => x.ev.forEach((q) => events.push({ ...q, asset: j })));
    events.sort((a, b) => a.i - b.i);
    return { expo, expoEach: expoEach.map((x) => x.e), events };
  }
  const one = runOne(sigs.main);
  return { expo: one.e, events: one.ev };
}

/** 월말 판단일 표시 */
export function checkMask(days, check) {
  const m = new Uint8Array(days.length);
  for (let i = 0; i < days.length; i++) {
    if (check !== 'M') { m[i] = 1; continue; }
    if (i === days.length - 1 || dayToYm(days[i + 1]) !== dayToYm(days[i])) m[i] = 1;
  }
  m[0] = 1;
  return m;
}

/** 프리셋(초보자용 카드) */
export const TIMING_PRESETS = [
  { id: 'ma10m', title: '10개월선 아래면 쉬기', desc: '월말에 신호 대상이 10개월 평균보다 낮으면 단기채로 피했다가, 다시 올라서면 돌아와요. 하락장 방어의 고전.', tm: { kind: 'switch', signal: 'SPY', sell: { type: 'ma', n: 10, unit: 'm', op: 'below' }, buy: null, to: 'BIL', check: 'M' } },
  { id: 'ma200', title: '200일선 아래면 쉬기', desc: '매일 종가가 200일 평균선 아래로 내려가면 다음 날 팔고, 위로 올라오면 다시 사요. 신호가 잦을 수 있어요.', tm: { kind: 'switch', signal: 'SPY', sell: { type: 'ma', n: 200, unit: 'd', op: 'below' }, buy: null, to: 'BIL', check: 'D' } },
  { id: 'absmom', title: '12개월 수익률이 단기채보다 낮으면 채권으로', desc: '절대 모멘텀(듀얼 모멘텀의 방어 규칙). 1년 성적이 현금만 못하면 국채로 옮겨요.', tm: { kind: 'switch', signal: 'SPY', sell: { type: 'ret', n: 12, unit: 'm', op: 'below', th: 'cash' }, buy: null, to: 'IEF', check: 'M' } },
  { id: 'cross', title: '데드크로스면 쉬기', desc: '50일선이 200일선 아래로 내려가면 팔고, 골든크로스면 다시 사요.', tm: { kind: 'switch', signal: 'SPY', sell: { type: 'cross', fast: 50, slow: 200, op: 'dead' }, buy: null, to: 'BIL', check: 'D' } },
  { id: 'stop15', title: '고점 대비 −15%면 손절, 10개월선 회복 때 복귀', desc: '큰 하락을 끊고, 추세가 돌아오면 다시 들어가요.', tm: { kind: 'switch', signal: 'self', sell: { type: 'dd', th: -15, op: 'below' }, buy: { type: 'ma', n: 10, unit: 'm', op: 'above' }, to: 'BIL', check: 'D' } },
  { id: 'trail10', title: '트레일링 스톱 −10%', desc: '산 뒤 가장 높았던 값에서 10% 빠지면 팔고, 10개월선 위로 오면 다시 사요.', tm: { kind: 'switch', signal: 'self', sell: { type: 'trail', th: -10 }, buy: { type: 'ma', n: 10, unit: 'm', op: 'above' }, to: 'BIL', check: 'D' } },
  { id: 'rsi', title: 'RSI 30 이하에서 사고 70 이상에서 팔기', desc: '많이 빠졌을 때 사고 과열 때 파는 역추세 규칙. 처음엔 현금으로 기다려요.', tm: { kind: 'switch', signal: 'SPY', sell: { type: 'rsi', n: 14, op: 'above', th: 70 }, buy: { type: 'rsi', n: 14, op: 'below', th: 30 }, to: 'BIL', check: 'D', startIn: false } },
  { id: 'vix30', title: 'VIX 30 넘으면 쉬기', desc: '공포 지수가 30 이상이면 피했다가 30 아래로 내려오면 돌아와요.', tm: { kind: 'switch', signal: 'SPY', sell: { type: 'vix', op: 'above', th: 30 }, buy: null, to: 'BIL', check: 'D' } },
  { id: 'vol15', title: '변동성 연 15%에 맞추기', desc: '최근 3개월 흔들림이 크면 그만큼 덜 담고 나머지는 단기채에. 월말마다 조정.', tm: { kind: 'scale', signal: 'self', targetVol: 15, volWindow: 63, to: 'BIL', check: 'M' } },
  { id: 'each10m', title: '종목마다 10개월선 확인', desc: '종목별로 10개월선 아래인 것만 단기채로 바꿔요(나머지는 그대로).', tm: { kind: 'switch', signal: 'each', sell: { type: 'ma', n: 10, unit: 'm', op: 'below' }, buy: null, to: 'BIL', check: 'M' } },
  { id: 'dd15reb', title: 'SPY가 고점 대비 −15%면 리밸런싱', desc: '크게 빠질 때 목표 비중으로 되돌려 싸진 자산을 더 사요(조건부 리밸런싱).', tm: { kind: 'trigger', signal: 'SPY', rule: { type: 'dd', th: -15, op: 'below' }, check: 'D', cooldown: 20 } },
];
