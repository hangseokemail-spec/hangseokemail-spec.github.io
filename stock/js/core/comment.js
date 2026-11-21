// 결과 해석: 숫자를 문장으로, 문제에는 반드시 '다시 계산한' 구체 대안을 붙입니다.
import { runBacktest } from './engine.js';
import { computeMetrics, assetStats } from './metrics.js';
import { assetInfo } from './data.js';

const nm = (k) => assetInfo(k)?.n || k;

/** 진단 규칙 → 카드 후보(대안 전략은 아직 계산 전) */
export function diagnose(run, bench, ctx) {
  const { m, strat } = run;
  const cards = [];
  const style = ctx.altStyle || 'equity';
  const isKR = strat.currency === 'KRW';
  const defensive = style === 'bond' ? [{ key: 'BND', label: '미국 종합채권(BND)' }, { key: 'IEF', label: '미국채 7-10년(IEF)' }]
    : [{ key: 'USMV', label: '미국 최소변동성(USMV)' }, { key: 'SCHD', label: '미국 배당(SCHD)' }];
  const refBond = style === 'equity' ? [{ key: 'BND', label: '종합채권(BND)', ref: true }] : [];
  void isKR;

  // B10 고갈
  if (run.res.depletedDay != null && strat.kind === 'static' && strat.flow?.amount < 0) {
    cards.push({ id: 'B10', level: 'warning', title: `${new Date(run.res.depletedDay * 864e5).getFullYear()}년에 돈이 바닥났어요`, why: '인출액이 수익보다 커서 원금이 계속 줄었어요.', alts: [{ kind: 'solveWithdraw', label: '끝까지 버티는 최대 인출액 찾기' }] });
  }
  // B1 큰 낙폭
  if (m.mdd <= -0.35) {
    const alts = [];
    if (strat.kind === 'static') {
      for (const d of [...defensive.slice(0, 1), ...refBond]) alts.push({ kind: 'mix', key: d.key, pct: 30, label: `${d.label} 30% 섞기${d.ref ? ' (참고: 채권)' : ''}` });
      if (maxW(strat) > 0.2 && strat.assets.length >= 5) alts.push({ kind: 'cap', cap: 20, label: '한 종목 최대 20%로 묶기' });
    } else {
      alts.push({ kind: 'widen', top: Math.max(strat.rank.top * 2, 5), label: `종목 수 ${Math.max(strat.rank.top * 2, 5)}개로 늘리기` });
      alts.push({ kind: 'rankMix', key: defensive[0].key, pct: 30, label: `${defensive[0].label} 30% 함께 들고 가기` });
    }
    cards.push({ id: 'B1', level: m.mdd <= -0.5 ? 'warning' : 'caution', title: `가장 크게는 ${pctAbs(m.mdd)} 떨어졌어요`, why: `${moneyText(ctx, m.initial)}이 한때 ${moneyText(ctx, m.initial * (1 + m.mdd))}까지 줄었다는 뜻이에요(시간가중 기준).`, alts, target: 'mdd' });
  }
  // B2 벤치마크보다 덜 벌고 더 흔들림
  if (bench && m.cagr < m.benchCagr && m.vol > bench.m.vol) {
    cards.push({ id: 'B2', level: 'caution', title: `${nm(bench.key)}보다 덜 벌고 더 흔들렸어요`, why: `연 ${pctAbs(m.cagr)} vs ${pctAbs(m.benchCagr)}, 변동성 ${pctAbs(m.vol)} vs ${pctAbs(bench.m.vol)}.`, alts: [{ kind: 'bench', label: `${nm(bench.key)} 100%` }, { kind: 'halfBench', label: `지금 전략 50 + ${nm(bench.key)} 50` }], target: 'sharpe' });
  }
  // B6 집중: 개별 종목(ETF·펀드 제외)이 25%를 넘을 때
  const tot = strat.kind === 'static' ? strat.assets.reduce((t, a) => t + +a.w, 0) || 1 : 1;
  const bigStock = strat.kind === 'static' ? strat.assets.filter((a) => assetInfo(a.key)?.t === 'stock' && +a.w / tot > 0.25).sort((a, b) => b.w - a.w)[0] : null;
  if (bigStock && !cards.some((c) => c.id === 'B1')) {
    const alts = strat.assets.length >= 5 ? [{ kind: 'cap', cap: 20, label: '한 종목 최대 20%로 묶기' }] : [{ kind: 'mix', key: isKR ? '069500' : 'SPY', pct: 30, label: `${isKR ? 'KODEX 200' : 'S&P 500(SPY)'} 30% 섞기` }];
    cards.push({ id: 'B6', level: 'caution', title: `개별 종목 ${nm(bigStock.key)}이 ${(+bigStock.w / tot * 100).toFixed(0)}%예요`, why: '한 회사의 실적이나 사건 하나에 전체가 크게 흔들릴 수 있어요.', alts, target: 'mdd' });
  }
  if (strat.kind === 'rank' && strat.rank.top - (strat.rank.from || 1) + 1 <= 3 && !cards.some((c) => c.id === 'B1')) {
    cards.push({ id: 'B6', level: 'caution', title: `${strat.rank.top - (strat.rank.from || 1) + 1}종목에 다 걸었어요`, why: '순위가 바뀔 때마다 결과가 크게 달라질 수 있어요.', alts: [{ kind: 'widen', top: 5, label: '상위 5개로 늘리기' }, { kind: 'widen', top: 10, label: '상위 10개로 늘리기' }], target: 'mdd' });
  }
  // B3 짧은 기간
  if (m.months < 60) {
    cards.push({ id: 'B3', level: 'info', title: `${Math.round(m.months / 12 * 10) / 10}년만 본 결과예요`, why: '짧은 기간의 높은 수익률은 그 시기의 운일 수 있어요. 같은 전략을 더 긴 기간으로 확인해 보세요.', alts: [{ kind: 'extend', years: 10, label: '같은 전략, 최근 10년' }, { kind: 'extend', years: 20, label: '같은 전략, 최대 기간' }], target: 'cagr' });
  }
  // B5 회전율
  if (strat.kind === 'rank' && run.res.turnover / Math.max(1, m.months / 12) > 2 && strat.rebalance === 'M') {
    cards.push({ id: 'B5', level: 'info', title: `1년에 포트폴리오를 ${(run.res.turnover / (m.months / 12) * 100).toFixed(0)}% 갈아치웠어요`, why: '실제로는 수수료·세금·호가 차이가 수익을 깎아요.', alts: [{ kind: 'freq', freq: 'Q', label: '분기마다 바꾸기' }, { kind: 'fee', bp: 30, label: '거래비용 0.3%를 넣으면?' }], target: 'cagr' });
  }
  return cards.slice(0, 3);
}

function maxW(s) { const t = s.assets.reduce((a, x) => a + +x.w, 0) || 1; return Math.max(...s.assets.map((x) => +x.w / t)); }
function pctAbs(x) { return `${(Math.abs(x) * 100).toFixed(1)}%`; }
function moneyText(ctx, v) { return ctx.fmtMoney(v); }

/** 대안 전략 만들기 */
export function altStrategy(strat, alt, benchKey) {
  const s = structuredClone(strat);
  const norm = (assets) => { const t = assets.reduce((a, x) => a + +x.w, 0); return assets.map((x) => ({ ...x, w: +x.w * 100 / t })); };
  switch (alt.kind) {
    case 'mix': {
      const rest = norm(s.assets).map((a) => ({ ...a, w: a.w * (100 - alt.pct) / 100 }));
      const f = rest.find((a) => a.key === alt.key);
      if (f) f.w += alt.pct; else rest.push({ key: alt.key, w: alt.pct });
      s.assets = rest; return s;
    }
    case 'cap': {
      let a = norm(s.assets);
      for (let it = 0; it < 50; it++) {
        let ex = 0; const free = a.filter((x) => x.w < alt.cap).reduce((t, x) => t + x.w, 0);
        a = a.map((x) => { if (x.w > alt.cap) { ex += x.w - alt.cap; return { ...x, w: alt.cap }; } return x; });
        if (ex < 1e-9 || free <= 0) break;
        a = a.map((x) => (x.w < alt.cap ? { ...x, w: x.w + ex * x.w / free } : x));
      }
      s.assets = a; return s;
    }
    case 'widen': s.rank = { ...s.rank, top: alt.top }; return s;
    case 'freq': s.rebalance = alt.freq; return s;
    case 'fee': s.feeBp = alt.bp; return s;
    case 'bench': return { ...s, kind: 'static', assets: [{ key: benchKey, w: 100 }], rebalance: 'none' };
    case 'extend': {
      const end = s.end;
      const endYm = end ? +end.replace('-', '') : null;
      if (alt.years >= 20) s.start = '2000-02';
      else if (endYm) { const y = Math.floor(endYm / 100) - alt.years, mo = endYm % 100 + 1; s.start = mo > 12 ? `${y + 1}-01` : `${y}-${String(mo).padStart(2, '0')}`; }
      else s.start = null;
      return s;
    }
    default: return s;
  }
}

/** 대안을 실제로 다시 계산해서 지표를 채움 */
export async function evaluateAlt(run, alt, bench) {
  if (alt.kind === 'solveWithdraw') return solveWithdraw(run);
  if (alt.kind === 'halfBench' || alt.kind === 'rankMix') {
    // 두 결과를 50:50(또는 70:30)으로 매년 섞는 대신, 지금 전략 결과와 대상 자산을 월간 수익률로 섞어 근사
    const other = await runBacktest({ ...run.strat, kind: 'static', assets: [{ key: alt.kind === 'halfBench' ? bench.key : alt.key, w: 100 }], rebalance: 'none', start: ymIso(run.res.startYm), end: ymIso(run.res.endYm) });
    const p = alt.kind === 'halfBench' ? 0.5 : alt.pct / 100;
    const mixed = blendMonthly(run.res, other, 1 - p);
    return { m: computeMetrics(mixed, bench?.res || null, 0), approx: true };
  }
  const s = altStrategy(run.strat, alt, bench?.key);
  if (alt.kind !== 'extend') { s.start = ymIso(run.res.startYm); s.end = ymIso(run.res.endYm); }
  const res = await runBacktest(s);
  let b = bench?.res || null;
  if (alt.kind === 'extend' && bench) b = await runBacktest({ ...bench.strat, start: ymIso(res.startYm), end: ymIso(res.endYm) });
  return { m: computeMetrics(res, b, 0), strat: s, res };
}

// ------------------------------------------------------------------ 목표별 대안 4가지
/** 대안의 목표: 무엇을 좋게 하려는지와, 그때 다른 지표를 얼마나 양보해도 되는지 */
export const ALT_GOALS = [
  { id: 'sharpe', label: '샤프 지수 높이기', short: '샤프', better: (a, b) => a.sharpe - b.sharpe, min: 0.02 },
  { id: 'vol', label: '변동성 낮추기', short: '변동성', better: (a, b) => b.vol - a.vol, min: 0.003 },
  { id: 'mdd', label: '최대 낙폭 줄이기', short: '낙폭', better: (a, b) => a.mdd - b.mdd, min: 0.005 },
  { id: 'cagr', label: '수익률 높이기', short: '수익률', better: (a, b) => a.cagr - b.cagr, min: 0.002 },
];
const ETF_SETS = {
  US: { def: [['BND', '미국 종합채권'], ['IEF', '미국채 7-10년'], ['GLD', '금'], ['USMV', '미국 최소변동성'], ['SCHD', '미국 배당']], grow: [['QQQ', '나스닥100'], ['SPY', 'S&P 500']] },
  KR: { def: [['114260', '국고채 3년'], ['148070', '국고채 10년'], ['132030', '금'], ['153130', '단기채권']], grow: [['069500', '코스피200'], ['133690', '미국 나스닥100']] },
};
const REB_NAME = { none: '안 함', M: '매월', Q: '분기마다', S: '반기마다', A: '매년', band: '밴드' };

/** 지금 전략에서 한 가지씩 바꾼 후보들(비중·리밸런싱·ETF 섞기·타이밍·순위 조건) */
export function altCandidates(run) {
  const st = run.strat, out = [];
  const startYmd = run.res.startYm * 100 + 1;
  const okFrom = (k) => (assetInfo(k)?.s || 99999999) <= startYmd;
  const add = (id, label, kind, extra) => out.push({ id, label, kind, ...extra });
  if (st.kind === 'static') {
    const tot = st.assets.reduce((t, a) => t + +a.w, 0) || 1;
    const mkt = st.assets.filter((a) => assetInfo(a.key)?.m === 'KR').length > st.assets.length / 2 ? 'KR' : 'US';
    // 리밸런싱 주기
    for (const r of ['M', 'Q', 'A', 'none']) if (r !== st.rebalance && st.assets.length > 1) add(`reb-${r}`, `리밸런싱 ${REB_NAME[st.rebalance] || st.rebalance} → ${REB_NAME[r]}`, 'strat', { strat: { ...st, rebalance: r } });
    if (st.rebalance !== 'band' && st.assets.length > 1) add('reb-band', `리밸런싱을 밴드(비중이 5%p 벗어날 때)로`, 'strat', { strat: { ...st, rebalance: 'band', band: { abs: 5, rel: 0 } } });
    // 비중
    if (st.assets.length > 1) {
      const eq = 100 / st.assets.length;
      if (st.assets.some((a) => Math.abs(+a.w / tot * 100 - eq) > 1)) add('w-eq', '비중을 똑같이 나누기', 'strat', { strat: { ...st, assets: st.assets.map((a) => ({ ...a, w: eq })) } });
      try {
        const vols = new Map(assetStats(run.res).stats.map((x) => [x.key, x.vol]));
        if (st.assets.every((a) => vols.get(a.key) > 0)) {
          const inv = st.assets.map((a) => 1 / vols.get(a.key)), t = inv.reduce((x, y) => x + y, 0);
          const w = st.assets.map((a, i) => ({ ...a, w: Math.round(inv[i] / t * 1000) / 10 }));
          if (w.some((a, i) => Math.abs(a.w - +st.assets[i].w / tot * 100) > 2)) add('w-iv', '덜 흔들리는 종목에 더 싣기(변동성 반비례 비중)', 'strat', { strat: { ...st, assets: w } });
        }
      } catch { /* 자산별 통계가 없으면 건너뜀 */ }
      if (st.assets.length >= 4 && st.assets.some((a) => +a.w / tot > 0.3)) add('w-cap', '한 종목 최대 25%로 묶기', 'alt', { alt: { kind: 'cap', cap: 25 } });
    }
    // ETF 섞기
    for (const [k, n] of [...ETF_SETS[mkt].def, ...ETF_SETS[mkt].grow]) {
      if (!okFrom(k)) continue;
      const have = st.assets.find((a) => a.key === k);
      if (have && +have.w / tot >= 0.5) continue;
      for (const pct of [20, 40]) add(`mix-${k}-${pct}`, `${n}(${k}) ${pct}% ${have ? '더 넣기' : '섞기'}`, 'alt', { alt: { kind: 'mix', key: k, pct } });
    }
    // 하락장 쉬기
    if (!st.timing?.kind) add('tm-ma10', `${mkt === 'KR' ? '코스피200' : 'S&P 500'}이 10개월 평균 아래면 단기채로 쉬기`, 'strat', { strat: { ...st, timing: { kind: 'switch', signal: mkt === 'KR' ? '069500' : 'SPY', sell: { type: 'ma', n: 10, unit: 'm', op: 'below' }, buy: null, to: mkt === 'KR' ? '153130' : 'BIL', check: 'M' } } });
  } else {
    const r = st.rank, mkt = r.group.startsWith('KR') ? 'KR' : 'US';
    const n = r.top - (r.from || 1) + 1;
    if (r.top * 2 <= 30) add('rk-wide', `종목 수 ${n}개 → ${r.top * 2 - (r.from || 1) + 1}개`, 'strat', { strat: { ...st, rank: { ...r, top: r.top * 2 } } });
    if (n >= 4) add('rk-narrow', `종목 수 ${n}개 → ${Math.ceil(n / 2)}개`, 'strat', { strat: { ...st, rank: { ...r, top: (r.from || 1) + Math.ceil(n / 2) - 1 } } });
    for (const w of ['equal', 'invvol', 'mcap']) if (w !== r.weighting) add(`rk-w-${w}`, `비중을 ${{ equal: '똑같이', invvol: '변동성 반비례로', mcap: '시가총액 비례로' }[w]}`, 'strat', { strat: { ...st, rank: { ...r, weighting: w } } });
    for (const f of ['M', 'Q', 'A']) if (f !== st.rebalance) add(`rk-reb-${f}`, `종목 바꾸기 ${REB_NAME[st.rebalance] || st.rebalance} → ${REB_NAME[f]}`, 'strat', { strat: { ...st, rebalance: f } });
    for (const [m, l] of [['mcap', '시가총액'], ['mom', '12개월 모멘텀'], ['lowvol', '낮은 변동성']]) if (m !== r.metric) add(`rk-m-${m}`, `순위 기준을 ${l}로`, 'strat', { strat: { ...st, rank: { ...r, metric: m, lookback: 12, skip: 0 } } });
    if (!st.timing?.kind) add('tm-ma10', `${mkt === 'KR' ? '코스피200' : 'S&P 500'}이 10개월 평균 아래면 단기채로 쉬기`, 'strat', { strat: { ...st, timing: { kind: 'switch', signal: mkt === 'KR' ? '069500' : 'SPY', sell: { type: 'ma', n: 10, unit: 'm', op: 'below' }, buy: null, to: mkt === 'KR' ? '153130' : 'BIL', check: 'M' } } });
    for (const [k, nm2] of [...ETF_SETS[mkt].def.slice(0, 3), ...ETF_SETS[mkt].grow.slice(0, 1)]) if (okFrom(k)) for (const pct of [20, 40]) add(`bl-${k}-${pct}`, `${nm2}(${k}) ${pct}% 함께 들고 가기`, 'blend', { key: k, pct });
  }
  return out;
}

/** 후보를 모두 같은 기간으로 계산하고, 목표마다 가장 나은 것을 고름(겹치지 않게) */
export async function findAlternatives(run, bench, { onProgress } = {}) {
  const cands = altCandidates(run);
  const base = run.m, period = { start: ymIso(run.res.startYm), end: ymIso(run.res.endYm) };
  const done = [];
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    onProgress?.(i, cands.length);
    try {
      if (c.kind === 'blend') {
        const other = await runBacktest({ ...run.strat, kind: 'static', assets: [{ key: c.key, w: 100 }], rebalance: 'none', timing: null, ...period });
        const res = blendMonthly(run.res, other, 1 - c.pct / 100);
        done.push({ ...c, res, m: computeMetrics(res, bench?.res || null, 0), approx: true, strat: null });
      } else {
        const s = c.kind === 'alt' ? altStrategy(run.strat, c.alt, bench?.key) : structuredClone(c.strat);
        Object.assign(s, period);
        const res = await runBacktest(s);
        if (res.startYm !== run.res.startYm) continue; // 기간이 달라지면 비교하지 않음
        done.push({ ...c, res, m: computeMetrics(res, bench?.res || null, 0), strat: s });
      }
    } catch (e) { console.warn('대안 계산 실패', c.id, e); }
    await new Promise((r) => setTimeout(r, 0));
  }
  onProgress?.(cands.length, cands.length);
  // 목표별 조건: 낮추기 목표는 수익률을 크게 깎지 않게, 수익률 목표는 낙폭·변동성을 크게 키우지 않게
  const cagrFloor = base.cagr > 0 ? base.cagr * 0.75 : base.cagr - 0.02;
  const fits = {
    sharpe: () => true,
    vol: (m) => m.cagr >= cagrFloor,
    mdd: (m) => m.cagr >= cagrFloor,
    cagr: (m) => m.mdd >= base.mdd - 0.05 && m.vol <= base.vol * 1.25,
  };
  const used = new Set(), picks = {};
  for (const g of ALT_GOALS) {
    const better = done.filter((c) => g.better(c.m, base) >= g.min);
    const ranked = (arr) => arr.slice().sort((a, b) => g.better(b.m, a.m));
    const strict = ranked(better.filter((c) => fits[g.id](c.m)));
    const loose = ranked(better);
    const pick = strict.find((c) => !used.has(c.id)) || strict[0] || loose.find((c) => !used.has(c.id)) || loose[0] || null;
    if (pick) used.add(pick.id);
    picks[g.id] = pick ? { ...pick, relaxed: !strict.includes(pick) } : null;
  }
  return { base, tried: done.length, picks };
}

function ymIso(ym) { return `${Math.floor(ym / 100)}-${String(ym % 100).padStart(2, '0')}`; }

/** 월말 시간가중 지수를 비중 w로 매월 섞은(월간 리밸런싱) 결과 */
function blendMonthly(a, b, w) {
  const n = Math.min(a.monthly.length, b.monthly.length);
  const monthly = [{ ...a.monthly[0], t: 1, v: a.monthly[0].v }];
  for (let i = 1; i < n; i++) {
    const ra = a.monthly[i].t / a.monthly[i - 1].t - 1, rb = b.monthly[i].t / b.monthly[i - 1].t - 1;
    const t = monthly[i - 1].t * (1 + w * ra + (1 - w) * rb);
    monthly.push({ ym: a.monthly[i].ym, t, v: a.monthly[0].v * t, inv: a.monthly[0].v });
  }
  return { ...a, monthly, twr: Float64Array.from(monthly.map((x) => x.t)), flows: null };
}

async function solveWithdraw(run) {
  const s0 = run.strat;
  let lo = 0, hi = Math.abs(s0.flow.amount);
  const ok = async (x) => { const r = await runBacktest({ ...s0, flow: { ...s0.flow, amount: -x }, start: ymIso(run.res.startYm), end: ymIso(run.res.endYm) }); return r.depletedDay == null; };
  for (let k = 0; k < 22; k++) { const mid = (lo + hi) / 2; if (await ok(mid)) lo = mid; else hi = mid; }
  const s = { ...s0, flow: { ...s0.flow, amount: -Math.floor(lo / 10000) * 10000 || -Math.floor(lo) }, start: ymIso(run.res.startYm), end: ymIso(run.res.endYm) };
  const res = await runBacktest(s);
  return { m: computeMetrics(res, null, 0), strat: s, res, withdraw: Math.abs(s.flow.amount) };
}

/** 서술 문장 */
export function story(run, bench, fmtMoney, label) {
  const m = run.m;
  const ymTxt = (ym) => `${Math.floor(ym / 100)}년 ${ym % 100}월`;
  const out = [];
  const flowTxt = run.strat.flow?.amount ? (run.strat.flow.amount > 0 ? `(투자 원금 합계 ${fmtMoney(m.invested)})` : '') : '';
  out.push(`${ymTxt(run.res.startYm)}에 <strong>${fmtMoney(m.initial)}</strong>을 넣었다면 ${ymTxt(m.end)}에 <strong>${fmtMoney(m.final)}</strong>이 됐어요${flowTxt}. 연 ${(m.cagr * 100).toFixed(1)}%예요.` + (bench ? ` 같은 기간 ${label(bench.key)}는 ${fmtMoney(bench.m.final)}.` : ''));
  out.push(`${m.monthlyR.length}개월 중 ${m.posMonths}개월(${(m.posRatio * 100).toFixed(0)}%)이 올랐어요.` + (m.best && m.worst && m.best.year !== m.worst.year ? ` 가장 좋았던 해는 ${m.best.year}년(${(m.best.r * 100).toFixed(1)}%), 가장 나빴던 해는 ${m.worst.year}년(${(m.worst.r * 100).toFixed(1)}%).` : ''));
  if (run.res.rankHistory?.length) {
    const h = run.res.rankHistory;
    let changes = 0; const held = {};
    for (let i = 0; i < h.length; i++) {
      h[i].picks.forEach((p) => { held[p.key] = (held[p.key] || 0) + 1; });
      if (i && h[i].picks.map((p) => p.key).sort().join() !== h[i - 1].picks.map((p) => p.key).sort().join()) changes++;
    }
    const longest = Object.entries(held).sort((a, b) => b[1] - a[1])[0];
    out.push(`${h.length}번 다시 고르는 동안 종목이 ${changes}번 바뀌었고, 가장 오래 들고 있던 종목은 ${label(longest[0])}(${longest[1]}번)이에요.`);
  }
  return out;
}
