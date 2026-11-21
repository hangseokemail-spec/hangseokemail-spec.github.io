// 전략 찾기 — 목표 연수익률·최대 낙폭·기간을 주면 규칙 조합 수백 개를 월 단위로 빠르게 백테스트해 추천
// 종목 이름이 아니라 '고르는 기준 × 리밸런싱 × 타이밍' 규칙을 추천한다.
// 월 단위 계산(월말 종가로 판단·매매). 추천을 누르면 백테스트 탭이 일별 엔진으로 정밀 계산한다.
import { loadMonthly, loadPx, assetInfo, assetCats, monthEndSeries, getUniverse } from './data.js';
import { ymAdd, todayYm } from './dates.js';

const GROUP_CUR = { US_STOCK: 'USD', US_ETF: 'USD', KR_STOCK: 'KRW', KR_ETF: 'KRW' };
const SECTORS = ['XLK', 'XLF', 'XLE', 'XLV', 'XLY', 'XLP', 'XLI', 'XLU', 'XLB', 'XLRE', 'XLC'];
const MKT = {
  US: { sig: 'SPY', sigName: 'S&P 500(SPY)', cash: 'BIL', cashName: '미국 초단기채(BIL)', bond: 'IEF', bondName: '미국 7~10년 국채(IEF)', etf: 'US_ETF', stock: 'US_STOCK' },
  KR: { sig: '069500', sigName: '코스피200(KODEX 200)', cash: '153130', cashName: 'KODEX 단기채권', bond: '148070', bondName: '국고채10년 ETF', etf: 'KR_ETF', stock: 'KR_STOCK' },
};

/** 후보 규칙 만들기 */
export function buildCandidates({ market = 'US', allowLev = false }) {
  const out = [];
  const mkts = market === 'ALL' ? ['US', 'KR'] : [market];
  for (const mk of mkts) {
    const M = MKT[mk];
    const fixed = mk === 'US' ? [
      { id: 'spy', fam: '지수', name: 'S&P 500 하나만', assets: [['SPY', 100]] },
      { id: 'qqq', fam: '지수', name: '나스닥100 하나만', assets: [['QQQ', 100]], sig: 'QQQ', sigName: '나스닥100(QQQ)' },
      { id: '6040', fam: '자산배분', name: '주식 60 · 국채 40', assets: [['SPY', 60], ['IEF', 40]] },
      { id: 'q5050', fam: '자산배분', name: '나스닥100 50 · 국채 50', assets: [['QQQ', 50], ['IEF', 50]] },
      { id: 'aw', fam: '자산배분', name: '올웨더(근사)', assets: [['VTI', 30], ['TLT', 40], ['IEF', 15], ['GLD', 7.5], ['DBC', 7.5]] },
      { id: 'pp', fam: '자산배분', name: '영구 포트폴리오', assets: [['VTI', 25], ['TLT', 25], ['BIL', 25], ['GLD', 25]] },
      { id: 'gh', fam: '자산배분', name: '성장+헤지(나스닥 60 · 장기채 20 · 금 20)', assets: [['QQQ', 60], ['TLT', 20], ['GLD', 20]] },
      { id: 'div', fam: '지수', name: '미국 배당(SCHD) 하나만', assets: [['SCHD', 100]] },
      ...(allowLev ? [{ id: 'tqqq', fam: '레버리지', name: '나스닥100 3배(TQQQ)', assets: [['TQQQ', 100]], sig: 'QQQ', sigName: '나스닥100(QQQ)' }, { id: 'upro', fam: '레버리지', name: 'S&P500 3배(UPRO)', assets: [['UPRO', 100]] }, { id: 'qtq', fam: '레버리지', name: '나스닥100 70 · 3배 30', assets: [['QQQ', 70], ['TQQQ', 30]], sig: 'QQQ', sigName: '나스닥100(QQQ)' }] : []),
    ] : [
      { id: 'k200', fam: '지수', name: '코스피200 하나만', assets: [['069500', 100]] },
      { id: 'k6040', fam: '자산배분', name: '코스피200 60 · 국고채 40', assets: [['069500', 60], ['148070', 40]] },
      { id: 'knas', fam: '지수', name: '국내상장 미국나스닥100', assets: [['133690', 100]], sig: '133690', sigName: '그 ETF' },
      { id: 'kmix', fam: '자산배분', name: '코스피200 50 · 국내상장 나스닥100 50', assets: [['069500', 50], ['133690', 50]] },
      { id: 'kmix3', fam: '자산배분', name: '나스닥100 50 · 코스피200 25 · 국고채 25', assets: [['133690', 50], ['069500', 25], ['148070', 25]] },
      ...(allowLev ? [{ id: 'klev', fam: '레버리지', name: 'KODEX 레버리지', assets: [['122630', 100]] }] : []),
    ];
    const timings = (multi, sig = M.sig, sigName = M.sigName) => [
      { id: 't0', label: null },
      { id: 'ma', label: `${josa(sigName, '이/가')} 10개월 평균선 아래면 ${josa(M.cashName, '으로/로')} 피신`, tm: { kind: 'switch', signal: sig, sell: { type: 'ma', n: 10, unit: 'm', op: 'below' }, buy: null, to: M.cash, check: 'M' } },
      { id: 'abs', label: `${sigName}의 12개월 수익률이 단기채보다 낮으면 ${josa(M.bondName, '으로/로')}`, tm: { kind: 'switch', signal: sig, sell: { type: 'ret', n: 12, unit: 'm', op: 'below', th: 'cash' }, buy: null, to: M.bond, check: 'M' } },
      { id: 'dd', label: `${josa(sigName, '이/가')} 고점 대비 −15%면 피신, 10개월선 위로 오면 복귀`, tm: { kind: 'switch', signal: sig, sell: { type: 'dd', th: -15, op: 'below' }, buy: { type: 'ma', n: 10, unit: 'm', op: 'above' }, to: M.cash, check: 'M' } },
      ...(multi ? [{ id: 'each', label: `종목마다 10개월선 아래면 그 몫만 ${josa(M.cashName, '으로/로')}`, tm: { kind: 'switch', signal: 'each', sell: { type: 'ma', n: 10, unit: 'm', op: 'below' }, buy: null, to: M.cash, check: 'M' } }] : []),
    ];
    for (const f of fixed) for (const reb of ['Q', 'A']) for (const t of timings(f.assets.length > 1, f.sig, f.sigName)) {
      if (f.assets.length === 1 && reb === 'A') continue; // 한 종목은 리밸런싱 무의미
      if (t.id === 'each' && reb === 'A') continue; // 종목별 신호는 매달 확인하므로 주기 차이 없음
      out.push({ id: `${mk}-${f.id}-${reb}-${t.id}`, mk, fam: f.fam, kind: 'static', name: f.name, assets: f.assets, rebalance: f.assets.length === 1 ? 'none' : reb, timing: t.tm || null, tLabel: t.label });
    }
    const rk = (rank, fam, name) => {
      for (const reb of ['M', 'Q']) for (const t of timings(false)) out.push({ id: `${mk}-${fam}-${JSON.stringify(rank)}-${reb}-${t.id}`, mk, fam, kind: 'rank', name, rank, rebalance: reb, timing: t.tm || null, tLabel: t.label });
    };
    const stockName = mk === 'US' ? '미국 대형주' : '국내 대형주';
    for (const n of [3, 5, 10]) rk({ group: M.stock, metric: 'mcap', from: 1, top: n, weighting: 'equal' }, '대형주', `${stockName} 시가총액 상위 ${n}개`);
    for (const lb of [3, 6, 12]) for (const n of [3, 5, 10]) rk({ group: M.stock, metric: 'mom', from: 1, top: n, lookback: lb, skip: lb === 12 ? 1 : 0, weighting: 'equal' }, '모멘텀', `${stockName} 중 최근 ${lb}개월${lb === 12 ? '(최근 1개월 제외)' : ''} 수익률 상위 ${n}개`);
    rk({ group: M.stock, metric: 'lowvol', from: 1, top: 10, lookback: 12, weighting: 'equal' }, '저변동', `${stockName} 중 12개월 변동성이 가장 낮은 10개`);
    const etfName = mk === 'US' ? '미국 ETF' : '국내 ETF';
    for (const lb of [3, 6, 12]) for (const n of [1, 2, 3]) {
      rk({ group: M.etf, metric: 'mom', from: 1, top: n, lookback: lb, skip: 0, weighting: 'equal', excludeCats: ['lev', 'inv', 'single'] }, 'ETF 모멘텀', `${etfName}(레버리지·인버스 제외) 중 최근 ${lb}개월 수익률 상위 ${n}개`);
      if (allowLev) rk({ group: M.etf, metric: 'mom', from: 1, top: n, lookback: lb, skip: 0, weighting: 'equal', excludeCats: ['inv'] }, '레버리지', `${etfName}(레버리지 포함, 인버스 제외) 중 최근 ${lb}개월 수익률 상위 ${n}개`);
    }
    if (mk === 'US') {
      for (const lb of [3, 6, 12]) for (const t of timings(false)) out.push({ id: `US-sector-${lb}-${t.id}`, mk, fam: '섹터 순환', kind: 'rank', name: `미국 11개 섹터 ETF 중 최근 ${lb}개월 수익률 상위 3개`, rank: { group: 'US_ETF', metric: 'mom', from: 1, top: 3, lookback: lb, skip: 0, weighting: 'equal', universe: SECTORS }, rebalance: 'M', timing: t.tm || null, tLabel: t.label });
      out.push({ id: 'US-gem', mk, fam: '듀얼 모멘텀', kind: 'rank', name: '미국(SPY)과 선진국(EFA) 중 12개월 수익률이 높은 하나', rank: { group: 'US_ETF', metric: 'mom', from: 1, top: 1, lookback: 12, skip: 0, weighting: 'equal', universe: ['SPY', 'EFA'] }, rebalance: 'M', timing: timings(false)[2].tm, tLabel: '단, S&P 500의 12개월 수익률이 단기채보다 낮으면 미국 국채(IEF)로' });
    }
  }
  return out;
}

/** 받침에 맞는 조사: josa('채권', '으로/로') → '채권으로' */
export function josa(word, pair) {
  const [a, b] = pair.split('/');
  const base = String(word).replace(/\([^)]*\)\s*$/, '').trim();
  const ch = base.charCodeAt(base.length - 1);
  let jong = null;
  if (ch >= 0xac00 && ch <= 0xd7a3) jong = (ch - 0xac00) % 28;
  else if (/[0-9]$/.test(base)) jong = { 0: 1, 1: 8, 2: 0, 3: 1, 4: 0, 5: 0, 6: 1, 7: 8, 8: 8, 9: 0 }[base.slice(-1)];
  else if (/[A-Za-z]$/.test(base)) jong = /[lmnr]$/i.test(base) ? (/[l]$/i.test(base) ? 8 : 4) : 0;
  const has = jong != null && jong !== 0;
  if (pair === '으로/로') return word + (has && jong !== 8 ? a : b);
  return word + (has ? a : b);
}

/** 규칙 → 한 문장 */
export function candSentence(c) {
  let what;
  if (c.kind === 'static' && c.assets.length === 1) what = `${c.name.replace(/ 하나만$/, '')}만 들고 있기`;
  else if (c.kind === 'static') what = `${c.name}${/\(/.test(c.name) ? '' : `(${c.assets.map(([k, w]) => `${assetInfo(k)?.m === 'KR' ? (assetInfo(k)?.n || k) : k} ${w}%`).join(' · ')})`}로 담고 ${c.rebalance === 'A' ? '매년 말' : '분기마다'} 비중 되돌리기`;
  else what = `${josa(c.name, '을/를')} 같은 비중으로 담고 ${c.rebalance === 'Q' ? '분기마다' : '매월 말'} 다시 고르기`;
  return `${what}${c.tLabel ? ` · ${c.tLabel}` : ''}`;
}

// ------------------------------------------------------------------ 월 단위 시계열 준비
async function monthlyFrame(groups, extraKeys, base, fxNeeded) {
  const tables = {};
  for (const g of groups) tables[g] = await loadMonthly(g);
  const fx = fxNeeded ? monthEndSeries(await loadPx('FX_USDKRW'), false) : null;
  const fxMap = fx ? new Map(fx.yms.map((y, i) => [y, fx.v[i]])) : null;
  const series = new Map(); // key → Map(ym → TR(기준통화))
  const conv = (cur, ym, v) => (cur === base || !fxMap ? v : cur === 'USD' ? v * (fxMap.get(ym) ?? NaN) : v / (fxMap.get(ym) ?? NaN));
  const fromTable = (key) => {
    for (const g of groups) {
      const t = tables[g]; const ti = t.tickers.indexOf(key);
      if (ti < 0) continue;
      const m = new Map(); const arr = t.tr[ti];
      for (let j = 0; j < arr.length; j++) { const ym = t.months[t.o[ti] + j]; if (arr[j] != null) m.set(ym, conv(GROUP_CUR[g], ym, arr[j])); }
      return m;
    }
    return null;
  };
  for (const k of extraKeys) {
    let m = fromTable(k);
    if (!m && assetInfo(k)) { try { const s = monthEndSeries(await loadPx(k), true); const cur = assetInfo(k).cur || 'USD'; m = new Map(s.yms.map((y, i) => [y, conv(cur, y, s.v[i])])); } catch { m = null; } }
    if (m) series.set(k, m);
  }
  return { tables, series, conv };
}

// ------------------------------------------------------------------ 월 단위 시뮬레이션
function ret(m, a, b) { const x = m?.get(a), y = m?.get(b); return x > 0 && y > 0 ? y / x - 1 : null; }

function rankPick(t, r, mi, conv, base, ym) {
  const m = mi.get(ym);
  if (m === undefined) return null;
  const val = (arr, ti, q) => { const j = q - t.o[ti]; return j >= 0 && j < arr[ti].length ? arr[ti][j] : null; };
  const only = r.universe ? new Set(r.universe) : null, exC = new Set(r.excludeCats || []);
  const cand = [];
  for (let ti = 0; ti < t.tickers.length; ti++) {
    const k = t.tickers[ti];
    if (only && !only.has(k)) continue;
    if (val(t.tr, ti, m) == null) continue;
    if (exC.size && [...assetCats(assetInfo(k))].some((x) => exC.has(x))) continue;
    let score = null;
    if (r.metric === 'mcap') score = val(t.mc, ti, m);
    else if (r.metric === 'mom') { const a = val(t.tr, ti, m - (r.skip || 0)), b = val(t.tr, ti, m - (r.skip || 0) - r.lookback); if (a != null && b != null) score = a / b - 1; }
    else if (r.metric === 'lowvol') {
      const L = r.lookback || 12, rs = [];
      for (let q = m - L + 1; q <= m; q++) { const a = val(t.tr, ti, q), b = val(t.tr, ti, q - 1); if (a == null || b == null) { rs.length = 0; break; } rs.push(a / b - 1); }
      if (rs.length === L) { const mu = rs.reduce((x, y) => x + y, 0) / L; score = -Math.sqrt(rs.reduce((x, y) => x + (y - mu) ** 2, 0) / (L - 1)); }
    }
    if (score == null || !isFinite(score)) continue;
    cand.push({ k, score });
  }
  cand.sort((a, b) => b.score - a.score || (a.k < b.k ? -1 : 1));
  const sel = cand.slice((r.from || 1) - 1, r.top);
  return sel.length ? sel.map((x) => [x.k, 1 / sel.length]) : null;
}

function signalState(tm, sigSer, cashSer, yms, t, state) {
  // t: 판단 달(월말). 반환: true=투자
  if (!tm) return true;
  const ym = yms[t];
  const px = sigSer;
  const v = px?.get(ym);
  if (!(v > 0)) return state;
  const back = (k) => px.get(ymAdd(ym, -k));
  const ma10 = () => { let s = 0; for (let k = 0; k < 10; k++) { const x = back(k); if (!(x > 0)) return null; s += x; } return s / 10; };
  const sell = tm.sell;
  if (sell.type === 'ma') { const m = ma10(); return m == null ? state : v >= m; }
  if (sell.type === 'ret') { const a = back(12); const ca = cashSer?.get(ymAdd(ym, -12)), cb = cashSer?.get(ym); if (!(a > 0)) return state; const rc = ca > 0 && cb > 0 ? cb / ca - 1 : 0; return v / a - 1 >= rc; }
  if (sell.type === 'dd') {
    if (state) { let peak = 0; for (let k = 0; k < 600; k++) { const x = back(k); if (!(x > 0)) break; peak = Math.max(peak, x); } return !(peak > 0 && v / peak - 1 <= sell.th / 100); }
    const m = ma10(); return m == null ? state : v > m;
  }
  return true;
}

/** 후보 하나를 월 단위로 계산 → 월말 가치 배열 */
export function simulateMonthly(c, F, yms, base, feeRate = 0.001) {
  const T = yms.length - 1;
  const M = MKT[c.mk];
  const sk = c.timing && !['each', 'self'].includes(c.timing.signal) ? c.timing.signal : M.sig;
  const sigSer = F.series.get(sk) || serOfLater(sk), cashSer = F.series.get(M.cash);
  const defKey = c.timing?.to;
  const defSer = defKey ? F.series.get(defKey) : null;
  let table = null, mi = null;
  if (c.kind === 'rank') { table = F.tables[c.rank.group]; mi = new Map(table.months.map((m, i) => [m, i])); }
  const serOf = (k) => {
    if (F.series.has(k)) return F.series.get(k);
    if (table) { const ti = table.tickers.indexOf(k); if (ti >= 0) { const m = new Map(); const arr = table.tr[ti]; for (let j = 0; j < arr.length; j++) if (arr[j] != null) m.set(table.months[table.o[ti] + j], F.conv(GROUP_CUR[c.rank.group], table.months[table.o[ti] + j], arr[j])); F.series.set(k, m); return m; } }
    return null;
  };
  // 시작 가능 여부(고정 자산은 전 기간 데이터가 있어야)
  if (c.kind === 'static') for (const [k] of c.assets) { const s = serOf(k); if (!s || !(s.get(yms[0]) > 0)) return null; }
  if (c.timing && c.timing.signal !== 'each' && !(sigSer?.get(yms[0]) > 0)) return null;
  function serOfLater() { return null; }
  let base_w = null; // [[key, w]]
  let inMkt = true, eachIn = null;
  const values = [1];
  let h = new Map(); // key → 금액
  let turnover = 0;
  const effective = () => {
    const w = new Map(); let used = 0;
    for (const [k, x] of base_w) {
      let e = inMkt ? 1 : 0;
      if (c.timing?.signal === 'each') { const s = serOf(k); const v = s?.get(yms[tNow]); let sum = 0, ok = true; for (let q = 0; q < 10; q++) { const y = s?.get(ymAdd(yms[tNow], -q)); if (!(y > 0)) { ok = false; break; } sum += y; } e = !ok || v >= sum / 10 ? 1 : 0; }
      if (e) { w.set(k, (w.get(k) || 0) + x); used += x; }
    }
    if (used < 1 - 1e-9) { const dk = defKey && defSer ? defKey : 'CASH'; w.set(dk, (w.get(dk) || 0) + (1 - used)); }
    return w;
  };
  let tNow = 0;
  const reset = (V, w) => {
    let to = 0; const nh = new Map();
    for (const [k, x] of w) nh.set(k, V * x);
    const keys = new Set([...h.keys(), ...nh.keys()]);
    for (const k of keys) to += Math.abs((nh.get(k) || 0) - (h.get(k) || 0));
    const fee = values.length > 1 ? to * feeRate : 0;
    if (fee) for (const [k, x] of nh) nh.set(k, x * (V - fee) / V);
    turnover += V > 0 ? to / V / 2 : 0;
    h = nh;
  };
  const isReb = (t) => { const mo = yms[t] % 100; return c.rebalance === 'M' || (c.rebalance === 'Q' && mo % 3 === 0) || (c.rebalance === 'A' && mo === 12); };
  // t=0: 시작 직전 달 말
  if (c.kind === 'static') base_w = c.assets.map(([k, w]) => [k, w / 100]);
  else { base_w = rankPick(table, c.rank, mi, F.conv, base, yms[0]); if (!base_w) return null; }
  inMkt = c.timing ? signalState(c.timing, sigSer, cashSer, yms, 0, true) : true;
  reset(1, effective());
  turnover = 0;
  for (let t = 1; t <= T; t++) {
    tNow = t;
    let V = 0;
    for (const [k, x] of h) {
      const s = k === 'CASH' ? null : serOf(k);
      const r = k === 'CASH' ? 0 : ret(s, yms[t - 1], yms[t]);
      const nx = x * (1 + (r ?? 0));
      h.set(k, nx); V += nx;
    }
    values.push(V);
    if (t === T) break;
    let change = false;
    if (c.timing) { const ns = signalState(c.timing, sigSer, cashSer, yms, t, inMkt); if (ns !== inMkt) { inMkt = ns; change = true; } if (c.timing.signal === 'each') change = true; }
    if (c.rebalance !== 'none' && isReb(t)) {
      if (c.kind === 'rank') { const p = rankPick(table, c.rank, mi, F.conv, base, yms[t]); if (p) base_w = p; }
      change = true;
    }
    if (change) reset(V, effective());
  }
  void eachIn;
  return { values, turnover: turnover / Math.max(1, T / 12) };
}

export function monthlyMetrics(values) {
  const T = values.length - 1;
  if (T < 2) return null;
  const rs = []; for (let t = 1; t <= T; t++) rs.push(values[t] / values[t - 1] - 1);
  const cagr = Math.pow(values[T] / values[0], 12 / T) - 1;
  let pk = values[0], mdd = 0; for (const v of values) { pk = Math.max(pk, v); mdd = Math.min(mdd, v / pk - 1); }
  const mu = rs.reduce((a, b) => a + b, 0) / rs.length;
  const sd = Math.sqrt(rs.reduce((a, b) => a + (b - mu) ** 2, 0) / (rs.length - 1));
  return { cagr, mdd, vol: sd * Math.sqrt(12), sharpe: sd > 0 ? (mu / sd) * Math.sqrt(12) : 0, total: values[T] / values[0] - 1 };
}

/**
 * 찾기 실행
 * opts: {market:'US'|'KR'|'ALL', targetCagr(%), maxMdd(%, 양수), years, allowLev, onProgress}
 */
export async function findStrategies(opts) {
  const { market = 'US', years = 15, allowLev = false, onProgress } = opts;
  const target = (+opts.targetCagr || 10) / 100, limit = -Math.abs(+opts.maxMdd || 25) / 100;
  const base = market === 'US' ? 'USD' : 'KRW';
  const U = getUniverse();
  const lastE = U?.byKey.get('SPY')?.e;
  let end = lastE ? Math.floor(lastE / 100) : todayYm();
  if (end >= todayYm()) end = ymAdd(todayYm(), -1);
  const start = ymAdd(end, -years * 12);
  const yms = []; for (let ym = start; ym <= end; ym = ymAdd(ym, 1)) yms.push(ym);
  const cands = buildCandidates({ market, allowLev });
  const groups = [...new Set(cands.filter((c) => c.kind === 'rank').map((c) => c.rank.group))];
  const extra = new Set();
  for (const c of cands) { if (c.kind === 'static') c.assets.forEach(([k]) => extra.add(k)); if (c.timing?.to) extra.add(c.timing.to); if (c.timing?.signal && !['each', 'self'].includes(c.timing.signal)) extra.add(c.timing.signal); }
  Object.values(MKT).forEach((m) => { if (market === 'ALL' || MKT[market] === m) [m.sig, m.cash, m.bond].forEach((k) => extra.add(k)); });
  onProgress?.(0, cands.length, '데이터 준비');
  const F = await monthlyFrame(groups, [...extra], base, market !== 'US');
  const out = [];
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    const r = simulateMonthly(c, F, yms, base);
    if (r) {
      const m = monthlyMetrics(r.values);
      const half = Math.floor((yms.length - 1) / 2);
      const h1 = monthlyMetrics(r.values.slice(0, half + 1)), h2 = monthlyMetrics(r.values.slice(half));
      if (m) out.push({ ...c, m, h1, h2, turnover: r.turnover, values: r.values, ok: m.cagr >= target && m.mdd >= limit });
    }
    if (i % 20 === 0) { onProgress?.(i + 1, cands.length, '계산'); await new Promise((res) => setTimeout(res, 0)); }
  }
  onProgress?.(cands.length, cands.length, '정리');
  // 점수: 목표 충족 후보는 (연수익률 ÷ |낙폭|) + 앞뒤 절반 일관성, 아니면 목표까지 거리
  const dist = (x) => Math.max(0, target - x.m.cagr) / Math.max(0.01, target) + Math.max(0, limit - x.m.mdd) / Math.max(0.01, -limit);
  for (const x of out) {
    const cons = Math.min(x.h1?.cagr ?? 0, x.h2?.cagr ?? 0);
    x.consistent = (x.h1?.cagr ?? 0) >= target * 0.6 && (x.h2?.cagr ?? 0) >= target * 0.6 && (x.h1?.mdd ?? 0) >= limit * 1.25 && (x.h2?.mdd ?? 0) >= limit * 1.25;
    x.score = x.ok ? 10 + x.m.cagr / Math.max(0.03, -x.m.mdd) + cons * 2 + (x.consistent ? 1 : 0) - x.turnover * 0.05 : -dist(x);
  }
  out.sort((a, b) => b.score - a.score);
  // 결과가 같은(규칙만 다르고 수치가 같은) 후보는 하나로
  const seen = new Set();
  for (let i = out.length - 1; i >= 0; i--) { const k = `${out[i].m.cagr.toFixed(5)}|${out[i].m.mdd.toFixed(5)}`; if (seen.has(k)) out.splice(i, 1); else seen.add(k); }
  out.sort((a, b) => b.score - a.score);
  // 다양하게: 같은 계열은 최대 2개
  const pick = (list, n) => { const fam = {}; const res = []; for (const x of list) { const k = `${x.fam}-${x.mk}`; if ((fam[k] || 0) >= 2) continue; fam[k] = (fam[k] || 0) + 1; res.push(x); if (res.length >= n) break; } return res; };
  const qualified = out.filter((x) => x.ok);
  const recs = pick(qualified.length ? qualified : out, 6);
  return { yms, base, target, limit, all: out, qualified, recs, count: cands.length };
}

/** 추천 → 백테스트 탭 상태 */
export function candToBacktest(c, years) {
  const pf = { name: c.name.slice(0, 28), kind: c.kind, assets: c.kind === 'static' ? c.assets.map(([key, w]) => ({ key, w })) : [], rank: c.kind === 'rank' ? { from: 1, lookback: 12, skip: 0, weighting: 'equal', maxW: null, exclude: [], ...c.rank } : { group: 'US_STOCK', metric: 'mcap', from: 1, top: 3, lookback: 12, skip: 0, weighting: 'equal', maxW: null, exclude: [] }, rebalance: c.rebalance, band: { abs: 5, rel: 0 }, timing: c.timing ? structuredClone(c.timing) : null };
  return { period: { preset: `${years}y`, start: null, end: null }, currency: c.mk === 'US' ? 'USD' : 'KRW', initial: c.mk === 'US' ? 10000 : 10000000, flow: { type: 'none', amount: 0, pct: 4, freq: 'M', growth: 0 }, reinvest: true, feeBp: 10, benchmarks: [c.mk === 'US' ? 'SPY' : '069500'], portfolios: [pf] };
}
