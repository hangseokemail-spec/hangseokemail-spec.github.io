// 팩터(논문에서 시장을 이긴 기준)와 순위 고르기 — 백테스트 엔진(runRank)과 전략 찾기(rankPick)가 같은 코드를 쓴다.
// 근거 자료: 드라이브 'Seoks Stock(Backtest)'의 '시장을 이긴 주식 팩터 정리'와 '02_factor_catalog.csv'(2026-11-21).
// 값은 모두 '높을수록 위'로 맞춘다(낮은 베타·단기 반전은 부호를 뒤집음). 그달 말에 알 수 있던 값만 쓴다.
import { FUND_METRICS, isFundMetric, fundAt, cutoffOf } from './fund.js';
import { assetInfo, assetCats } from './data.js';

export const FACTORS = {
  'x:mom121': {
    label: '모멘텀 12-1(최근 1개월 뺀 1년 수익률)', short: '모멘텀 12-1', fam: '모멘텀', need: 13,
    how: '12개월 전 월말부터 지난달 말까지 오른 비율이 높은 순이에요. 바로 지난 한 달은 빼요(단기 되돌림을 피하려고).',
    paper: 'Jegadeesh·Titman(1993), Carhart(1997)', warn: '급락장에서 크게 빠질 수 있고 교체가 잦아요.',
  },
  'x:rmom': {
    label: '위험 조정 모멘텀(12-1 수익률 ÷ 변동성)', short: '위험 조정 모멘텀', fam: '모멘텀', need: 13,
    how: '모멘텀 12-1을 같은 기간 월 수익률의 변동성으로 나눈 값이 높은 순이에요. 덜 흔들리며 꾸준히 오른 종목이 위예요(S&P 500 모멘텀 지수 방식).',
    paper: 'S&P 모멘텀 지수 방법서, Barroso·Santa-Clara(2015)', warn: '최근 5년 S&P 500 Momentum 지수 연 17.5%(S&P 500 연 12.1%)는 지난 성과예요.',
  },
  'x:hi52': {
    label: '52주 최고가 근접(지금 ÷ 1년 최고)', short: '52주 고점 근접', fam: '모멘텀', need: 12,
    how: '지금 월말 값 ÷ 최근 12번 월말 값 중 가장 높은 값이 큰 순이에요. 1년 최고가 가까이 있는 종목이 위예요(월말 값으로 잰 근사).',
    paper: 'George·Hwang(2004)', warn: '',
  },
  'x:rev1': {
    label: '단기 반전(지난달 덜 오른 순)', short: '단기 반전', fam: '반전', need: 2,
    how: '지난 한 달 수익률이 낮은 순이에요. 한 달 만에 되돌아오는 경향을 노려요.',
    paper: 'Jegadeesh(1990), Fama·French 단기 반전 팩터', warn: '매달 대부분이 바뀌어 거래비용에 아주 약해요. 한국에서는 효과가 약하다는 연구가 있어요.',
  },
  'x:lowbeta': {
    label: '낮은 베타(시장보다 덜 흔들리는 순)', short: '낮은 베타', fam: '저위험', need: 25,
    how: '최근 36개월(적어도 24개월) 월 수익률로 잰 시장 베타가 낮은 순이에요. 시장은 같은 목록의 시가총액 가중 평균이에요.',
    paper: 'Frazzini·Pedersen(2014) BAB, Ang 외(2006)', warn: '오르는 장에서는 시장보다 덜 올라요.',
  },
  'x:highbeta': {
    label: '높은 베타(시장보다 크게 움직이는 순)', short: '높은 베타', fam: '저위험', need: 25,
    how: '같은 방법으로 잰 베타가 높은 순이에요(S&P 500 High Beta 지수와 같은 쪽).',
    paper: 'S&P 500 High Beta 지수', warn: '하락장에서 시장보다 훨씬 크게 빠져요.',
  },
  'x:ep': {
    label: '이익수익률 E/P(순이익 ÷ 시가총액)', short: '이익수익률(E/P)', fam: '가치', fund: true, need: 1,
    how: '최근 4분기 순이익 합 ÷ 그달 말 시가총액이 높은 순이에요. 번 돈에 비해 싼 회사가 위예요(PER이 낮은 순과 같아요).',
    paper: 'Basu(1977), Fama·French(1992)', warn: '2007~2020년처럼 가치주가 오래 부진한 때가 있었어요.',
  },
  'x:sp': {
    label: '매출수익률 S/P(매출 ÷ 시가총액)', short: '매출수익률(S/P)', fam: '가치', fund: true, need: 1,
    how: '최근 4분기 매출 합 ÷ 그달 말 시가총액이 높은 순이에요(PSR이 낮은 순).',
    paper: 'Barbee 외(1996), 가치 팩터 계열', warn: '이익을 못 내는 회사도 위로 올 수 있어요.',
  },
  'x:bm': {
    label: '장부가/시가총액 B/M(자본 ÷ 시가총액)', short: '장부가/시총(B/M)', fam: '가치', fund: true, need: 1,
    how: '그 분기말 지배주주 자본(장부가) ÷ 그달 말 시가총액이 높은 순이에요. PBR이 낮은 순과 같아요. 가치 팩터의 고전 정의예요.',
    paper: 'Fama·French(1992, 1993)', warn: '장부가는 무형자산(브랜드·연구개발)을 담지 못해 2007~2020년에 오래 부진했어요.',
  },
  'x:fcfy': {
    label: 'FCF 수익률(잉여현금흐름 ÷ 시가총액)', short: 'FCF 수익률', fam: '가치', fund: true, need: 1,
    how: '최근 4분기 (영업현금흐름 − 설비투자) ÷ 그달 말 시가총액이 높은 순이에요. 실제로 남는 현금에 비해 싼 회사가 위예요.',
    paper: 'JKP 팩터(free cash flow to price), S&P 500 Quality FCF Aristocrats 계열', warn: '설비투자를 공시하지 않은 분기는 빠져요.',
  },
  'x:shy': {
    label: '주주환원 수익률((배당 + 자사주 매입) ÷ 시가총액)', short: '주주환원 수익률', fam: '주주환원', fund: true, need: 1,
    how: '최근 4분기 배당 지급과 자사주 매입을 더해 그달 말 시가총액으로 나눈 값이 높은 순이에요. 배당수익률보다 회사가 돌려주는 돈을 넓게 봐요.',
    paper: 'Boudoukh 외(2007)', warn: '신주 발행은 빼지 않은 총주주환원이에요.',
  },
  'x:gpa': {
    label: '매출총이익/총자산 GP/A(수익성)', short: '매출총이익/총자산(GP/A)', fam: '수익성', fund: true, need: 1,
    how: '최근 4분기 매출총이익 ÷ 그 분기말 총자산이 높은 순이에요. 가진 자산으로 돈을 잘 버는 회사가 위예요.',
    paper: 'Novy-Marx(2013)', warn: '은행·보험처럼 매출총이익이 없는 회사는 빠져요.',
  },
  'x:roe': {
    label: 'ROE(순이익 ÷ 평균 자본)', short: 'ROE', fam: '수익성', fund: true, need: 1,
    how: '최근 4분기 순이익 ÷ 지금과 1년 전 지배주주 자본의 평균이 높은 순이에요(퀄리티의 대표 지표).',
    paper: 'Hou·Xue·Zhang(2015) q-팩터, Asness·Frazzini·Pedersen(2019) QMJ', warn: '자본이 아주 작거나 마이너스인 회사(자사주를 많이 산 회사)는 빠져요.',
  },
  'x:ag': {
    label: '자산성장 낮은 순(투자 팩터)', short: '자산성장 낮은 순', fam: '투자', fund: true, need: 1,
    how: '총자산이 1년 전보다 덜 늘어난 회사가 위예요. 자산을 공격적으로 늘린 회사는 그 뒤 수익률이 낮았다는 연구예요.',
    paper: 'Cooper·Gulen·Schill(2008), Fama·French(2015) CMA', warn: '상장폐지 종목이 빠진 자료에서는 효과가 부풀 수 있어요.',
  },
  'x:acc': {
    label: '발생액 낮은 순((순이익 − 영업현금흐름) ÷ 총자산)', short: '발생액 낮은 순', fam: '회계', fund: true, need: 1,
    how: '최근 4분기 순이익과 영업현금흐름의 차이를 평균 총자산으로 나눈 값이 낮은 순이에요. 이익이 현금으로 뒷받침되는 회사가 위예요.',
    paper: 'Sloan(1996)', warn: '현금 기반 수익성과 겹치는 신호라 같이 쓰면 중복될 수 있어요.',
  },
  'x:bmgpa': {
    label: '가치+수익성(B/M 순위와 GP/A 순위 평균)', short: '가치+수익성(B/M·GP/A)', fam: '복합', fund: true, need: 1, parts: ['x:bm', 'x:gpa'],
    how: '장부가/시총 순위와 매출총이익/총자산 순위를 0~100점으로 바꿔 평균한 점수가 높은 순이에요. 싸면서 돈을 잘 버는 회사(원 논문 그대로의 조합).',
    paper: 'Novy-Marx(2013)', warn: '은행·보험은 매출총이익이 없어 빠져요.',
  },
  'x:multi5': {
    label: '다섯 팩터 평균(가치·모멘텀·수익성·투자·낮은 변동성)', short: '다섯 팩터 평균', fam: '복합', fund: true, need: 13, parts: ['x:bm', 'x:mom121', 'x:gpa', 'x:ag', 'lowvol'],
    how: '장부가/시총·모멘텀 12-1·매출총이익/총자산·자산성장 낮은 순·12개월 낮은 변동성 순위를 각각 0~100점으로 바꿔 평균한 점수가 높은 순이에요. 정리 자료가 권한 ‘다섯 계열 순위 평균’이에요.',
    paper: '시장을 이긴 팩터 정리(가치·모멘텀·수익성·투자·저위험 다섯 계열), Jensen·Kelly·Pedersen(2023)', warn: '은행·보험은 매출총이익이 없어 빠져요.',
  },
  'x:vm': {
    label: '가치+모멘텀(E/P 순위와 12-1 순위 평균)', short: '가치+모멘텀', fam: '복합', fund: true, need: 13, parts: ['x:ep', 'x:mom121'],
    how: '후보 안에서 이익수익률 순위와 모멘텀 12-1 순위를 각각 0~100점으로 바꿔 평균한 점수가 높은 순이에요. 둘은 반대로 움직일 때가 많아 같이 쓰면 덜 흔들려요.',
    paper: 'Asness·Moskowitz·Pedersen(2013)', warn: '',
  },
  'x:vq': {
    label: '가치+수익성(E/P 순위와 영업이익률 순위 평균)', short: '가치+수익성', fam: '복합', fund: true, need: 1, parts: ['x:ep', 'f:opm'],
    how: '이익수익률 순위와 최근 4분기 영업이익률 순위를 0~100점으로 바꿔 평균한 점수가 높은 순이에요. 싸면서 돈을 잘 버는 회사가 위예요.',
    paper: 'Novy-Marx(2013)', warn: '',
  },
  'x:multi4': {
    label: '네 팩터 평균(가치·모멘텀·수익성·낮은 변동성)', short: '네 팩터 평균', fam: '복합', fund: true, need: 13, parts: ['x:ep', 'x:mom121', 'f:opm', 'lowvol'],
    how: '이익수익률·모멘텀 12-1·영업이익률·12개월 낮은 변동성 순위를 각각 0~100점으로 바꿔 평균한 점수가 높은 순이에요.',
    paper: 'Jensen·Kelly·Pedersen(2023) 등 여러 팩터 묶음 연구', warn: '',
  },
};
export const isFactor = (m) => typeof m === 'string' && FACTORS[m] != null;
/** 실적 DB가 필요한 순위 설정인지(순위 기준·조건·매출 비례 비중) */
export function needsFund(r) {
  return !!(r && (isFundMetric(r.metric) || FACTORS[r.metric]?.fund || r.ff?.key || r.weighting === 'rev'));
}
/** 순위를 매기기 전에 필요한 지난 달 수 */
export function metricNeed(r) {
  if (r.metric === 'mom') return r.lookback + (r.skip || 0);
  if (r.metric === 'lowvol') return r.lookback || 12;
  return FACTORS[r.metric]?.need ?? 0;
}

export function tblVal(t, arr, ti, q) { const j = q - t.o[ti]; return arr && j >= 0 && j < arr[ti].length ? arr[ti][j] : null; }

/** 시장 월 수익률: 같은 표 종목의 전달 시가총액 가중 평균(베타 계산용) */
const mktCache = new WeakMap();
function marketRet(t) {
  if (mktCache.has(t)) return mktCache.get(t);
  const n = t.months.length, out = new Array(n).fill(null);
  for (let m = 1; m < n; m++) {
    let s = 0, w = 0;
    for (let ti = 0; ti < t.tickers.length; ti++) {
      const a = tblVal(t, t.tr, ti, m), b = tblVal(t, t.tr, ti, m - 1), c = tblVal(t, t.mc, ti, m - 1);
      if (a != null && b > 0 && c > 0) { s += c * (a / b - 1); w += c; }
    }
    if (w > 0) out[m] = s / w;
  }
  mktCache.set(t, out);
  return out;
}
function monthlyRets(t, ti, from, to) {
  const rs = [];
  for (let q = from; q <= to; q++) { const a = tblVal(t, t.tr, ti, q), b = tblVal(t, t.tr, ti, q - 1); if (a == null || !(b > 0)) return null; rs.push(a / b - 1); }
  return rs;
}
const sd = (rs) => { const mu = rs.reduce((x, y) => x + y, 0) / rs.length; return Math.sqrt(rs.reduce((x, y) => x + (y - mu) ** 2, 0) / (rs.length - 1)); };
function beta(t, ti, m) {
  const mk = marketRet(t), xs = [], ys = [];
  for (let q = m - 35; q <= m; q++) {
    const a = tblVal(t, t.tr, ti, q), b = tblVal(t, t.tr, ti, q - 1);
    if (a == null || !(b > 0) || mk[q] == null) continue;
    ys.push(a / b - 1); xs.push(mk[q]);
  }
  if (xs.length < 24) return null;
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length, my = ys.reduce((s, x) => s + x, 0) / ys.length;
  let cov = 0, vx = 0;
  for (let i = 0; i < xs.length; i++) { cov += (xs[i] - mx) * (ys[i] - my); vx += (xs[i] - mx) ** 2; }
  return vx > 0 ? cov / vx : null;
}

/** 한 종목·한 달의 기준 값(높을수록 위). fd = 그달 쓸 수 있는 실적 지표(fundAt), r = {lookback, skip} */
export function factorValue(metric, t, ti, m, fd, r = {}) {
  const v = (arr, q) => tblVal(t, arr, ti, q);
  switch (metric) {
    case 'mcap': return v(t.mc, m);
    case 'mom': { const a = v(t.tr, m - (r.skip || 0)), b = v(t.tr, m - (r.skip || 0) - r.lookback); return a != null && b != null ? a / b - 1 : null; }
    case 'lowvol': { const L = r.lookback || 12; if (L < 2) return null; const rs = monthlyRets(t, ti, m - L + 1, m); return rs ? -sd(rs) * Math.sqrt(12) : null; }
    case 'x:mom121': { const a = v(t.tr, m - 1), b = v(t.tr, m - 12); return a != null && b > 0 ? a / b - 1 : null; }
    case 'x:rmom': {
      const a = v(t.tr, m - 1), b = v(t.tr, m - 12); if (a == null || !(b > 0)) return null;
      const rs = monthlyRets(t, ti, m - 11, m - 1); if (!rs) return null;
      const s = sd(rs) * Math.sqrt(12); return s > 0 ? (a / b - 1) / s : null;
    }
    case 'x:hi52': { const cur = v(t.tr, m); if (cur == null) return null; let hi = 0; for (let q = m - 11; q <= m; q++) { const x = v(t.tr, q); if (x == null) return null; hi = Math.max(hi, x); } return hi > 0 ? cur / hi : null; }
    case 'x:rev1': { const a = v(t.tr, m), b = v(t.tr, m - 1); return a != null && b > 0 ? -(a / b - 1) : null; }
    case 'x:lowbeta': { const b = beta(t, ti, m); return b == null ? null : -b; }
    case 'x:highbeta': return beta(t, ti, m);
    case 'x:ep': { const mc = v(t.mc, m); return fd?.ni4 != null && mc > 0 ? fd.ni4 / mc : null; }
    case 'x:sp': { const mc = v(t.mc, m); return fd?.rev4 > 0 && mc > 0 ? fd.rev4 / mc : null; }
    case 'x:bm': { const mc = v(t.mc, m); return fd?.eq > 0 && mc > 0 ? fd.eq / mc : null; }
    case 'x:fcfy': { const mc = v(t.mc, m); return fd?.fcf4 != null && mc > 0 ? fd.fcf4 / mc : null; }
    case 'x:shy': { const mc = v(t.mc, m); return fd?.pay4 != null && mc > 0 ? fd.pay4 / mc : null; }
    case 'x:gpa': return fd?.gpa ?? null;
    case 'x:roe': return fd?.roe ?? null;
    case 'x:ag': return fd?.ag != null ? -fd.ag : null;
    case 'x:acc': return fd?.acc != null ? -fd.acc : null;
    default: return isFundMetric(metric) ? (fd?.[metric.slice(2)] ?? null) : null;
  }
}

/**
 * 그달(m = 표의 달 번호) 순위표: 후보 거르기(제외·종류·후보 목록·실적 조건) → 그달 시가총액 상위 poolTop 안 → 점수 높은 순.
 * 복합 팩터는 후보 안에서 부분 점수마다 0~1 순위로 바꿔 평균한다.
 * 반환: [{k, score, mc, vol, fv, rev4}] (점수 높은 순)
 */
export function rankPool(t, r, m, fprep = null) {
  const parts = FACTORS[r.metric]?.parts || null;
  const ff = r.ff?.key && FUND_METRICS[r.ff.key] && r.ff.min != null && r.ff.min !== '' ? { key: r.ff.key, min: +r.ff.min / 100 } : null;
  const cut = fprep ? cutoffOf(t.months[m]) : 0;
  const cand = [];
  for (let ti = 0; ti < t.tickers.length; ti++) {
    if (tblVal(t, t.tr, ti, m) == null) continue;
    const k = t.tickers[ti];
    const fd = fprep ? fundAt(fprep, k, cut) : null;
    let fv = null;
    if (ff) { fv = fd?.[ff.key] ?? null; if (fv == null || fv < ff.min) continue; }
    let score = null, pv = null;
    if (parts) { pv = parts.map((p) => factorValue(p, t, ti, m, fd, { lookback: 12, skip: 0 })); if (pv.some((x) => x == null || !isFinite(x))) continue; score = 0; }
    else { score = factorValue(r.metric, t, ti, m, fd, r); if (score == null || !isFinite(score)) continue; }
    cand.push({ k, score, pv, mc: tblVal(t, t.mc, ti, m), vol: tblVal(t, t.vol, ti, m), fv, rev4: fd?.rev4 ?? null });
  }
  const ex = new Set(r.exclude || []), exCats = new Set(r.excludeCats || []);
  const only = r.universe?.length ? new Set(r.universe) : null;
  // 그 시점의 대형주만 후보로(지금 큰 종목을 과거에 미리 고르는 편향 줄이기): 시총 순위가 아니면 그달 시가총액 상위 poolTop개 안에서
  const poolTop = r.poolTop ?? (r.group.endsWith('STOCK') && r.metric !== 'mcap' ? 50 : null);
  let inPool = null;
  if (poolTop) inPool = new Set(cand.filter((c) => c.mc > 0).sort((a, b) => b.mc - a.mc).slice(0, poolTop).map((c) => c.k));
  const pool = cand.filter((c) => !ex.has(c.k) && (!only || only.has(c.k)) && (!inPool || inPool.has(c.k)) && (!exCats.size || ![...assetCats(assetInfo(c.k))].some((x) => exCats.has(x))));
  if (parts && pool.length) {
    const n = pool.length;
    parts.forEach((_, j) => {
      const ord = pool.map((c, i) => [c.pv[j], i]).sort((a, b) => a[0] - b[0]);
      ord.forEach(([, i], rank) => { pool[i].score += (n > 1 ? rank / (n - 1) : 1) / parts.length; });
    });
  }
  pool.sort((a, b) => b.score - a.score || (a.k < b.k ? -1 : 1));
  return pool;
}

/** 고른 종목의 비중: 같게 / 시총 비례 / 변동성 반비례 / 매출 비례(최근 4분기, 매출을 모르는 종목은 가운데 값) + 한 종목 상한 */
export function pickWeights(sel, r) {
  let w;
  if (r.weighting === 'mcap' && sel.every((x) => x.mc)) { const t = sel.reduce((a, x) => a + x.mc, 0); w = sel.map((x) => x.mc / t); }
  else if (r.weighting === 'invvol' && sel.every((x) => x.vol)) { const t = sel.reduce((a, x) => a + 1 / x.vol, 0); w = sel.map((x) => 1 / x.vol / t); }
  else if (r.weighting === 'rev' && sel.some((x) => x.rev4 > 0)) {
    const known = sel.map((x) => x.rev4).filter((x) => x > 0).sort((a, b) => a - b);
    const med = known[Math.floor(known.length / 2)];
    const vals = sel.map((x) => (x.rev4 > 0 ? x.rev4 : med)); const t = vals.reduce((a, x) => a + x, 0); w = vals.map((x) => x / t);
  } else w = sel.map(() => 1 / sel.length);
  if (r.maxW) w = capWeights(w, r.maxW / 100);
  return w;
}

/** 상한 초과분을 나머지에 비례 재배분(반복) */
export function capWeights(w, cap) {
  const out = w.slice();
  if (cap * out.length < 1 - 1e-12) return out.map(() => 1 / out.length);
  for (let it = 0; it < 100; it++) {
    let excess = 0, free = 0;
    for (let i = 0; i < out.length; i++) { if (out[i] > cap) { excess += out[i] - cap; out[i] = cap; } else if (out[i] < cap) free += out[i]; }
    if (excess < 1e-12) break;
    for (let i = 0; i < out.length; i++) if (out[i] < cap) out[i] += excess * (out[i] / free);
  }
  return out;
}
