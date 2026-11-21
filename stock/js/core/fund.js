// 실적(펀더멘털) 지표: data/fund/<그룹>.json의 분기 매출·영업이익·순이익·EPS와 공시일로
// '그 달 말에 알 수 있던' 최신 분기 기준 성장률·이익률을 계산한다(공시 전 값은 쓰지 않음).
import { loadFund } from './data.js';

export const FUND_METRICS = {
  rev_yoy: { label: '매출 성장률(전년 같은 분기 대비)', short: '매출 성장률 YoY' },
  rev_qoq: { label: '매출 성장률(직전 분기 대비)', short: '매출 성장률 QoQ' },
  oi_yoy: { label: '영업이익 성장률(전년 같은 분기 대비)', short: '영업이익 성장률 YoY' },
  oi_qoq: { label: '영업이익 성장률(직전 분기 대비)', short: '영업이익 성장률 QoQ' },
  ni_yoy: { label: '순이익 성장률(전년 같은 분기 대비)', short: '순이익 성장률 YoY' },
  ni_qoq: { label: '순이익 성장률(직전 분기 대비)', short: '순이익 성장률 QoQ' },
  eps_yoy: { label: 'EPS 성장률(전년 같은 분기 대비)', short: 'EPS 성장률 YoY' },
  eps_qoq: { label: 'EPS 성장률(직전 분기 대비)', short: 'EPS 성장률 QoQ' },
  opm: { label: '영업이익률(최근 4분기)', short: '영업이익률' },
  npm: { label: '순이익률(최근 4분기)', short: '순이익률' },
  roe: { label: 'ROE(최근 4분기 순이익 ÷ 평균 자본)', short: 'ROE' },
};
export const isFundMetric = (m) => typeof m === 'string' && m.startsWith('f:') && FUND_METRICS[m.slice(2)] != null;

const toDate = (n) => new Date(Date.UTC(Math.floor(n / 10000), Math.floor(n / 100) % 100 - 1, n % 100));
const gap = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
// 성장률: 기준 값이 0 이하이면(적자에서 흑자 등) 비율이 뜻이 없어 비움
const growth = (cur, prev) => (cur != null && prev != null && prev > 0 ? cur / prev - 1 : null);

/** 분기 표 → 분기마다 지표 */
export function quarterMetrics(q) {
  const out = [];
  for (let i = 0; i < q.length; i++) {
    const [end, filed, rev, oi, ni, eps] = q[i];
    const p = i > 0 && gap(q[i - 1][0], end) >= 75 && gap(q[i - 1][0], end) <= 105 ? q[i - 1] : null;
    let y = null;
    for (let j = i - 1; j >= Math.max(0, i - 6); j--) { const g = gap(q[j][0], end); if (g >= 350 && g <= 380) { y = q[j]; break; } }
    let opm = null, npm = null, rev4 = null, ni4 = null, gp4 = null, cfo4 = null, fcf4 = null, pay4 = null;
    if (i >= 3) {
      let ok = true;
      for (let j = i - 2; j <= i; j++) { const g = gap(q[j - 1][0], q[j][0]); if (g < 75 || g > 105) ok = false; }
      const four = q.slice(i - 3, i + 1);
      const sr = four.reduce((t, r) => (r[2] == null ? NaN : t + r[2]), 0);
      // 최근 4분기 합(이익수익률·매출수익률·매출 비례 비중에 씀)
      const sn4 = four.reduce((t, r) => (r[4] == null ? NaN : t + r[4]), 0);
      if (ok && isFinite(sr) && sr > 0) rev4 = sr;
      if (ok && isFinite(sn4)) ni4 = sn4;
      // 2026-11-21 재무상태표·현금흐름 열(6~12): 매출총이익, 영업현금흐름, 설비투자, 총자산, 자본, 자사주 매입, 배당 지급
      if (ok) {
        const sum = (i, f = (x) => x) => four.reduce((t, r) => (r[i] == null ? NaN : t + f(r[i])), 0);
        const g4 = sum(6), c4 = sum(7), k4 = sum(8, (x) => Math.max(0, x));
        if (isFinite(g4) && (rev4 == null || g4 <= rev4 * 1.01)) gp4 = g4;
        if (isFinite(c4)) {
          cfo4 = c4;
          if (isFinite(k4)) fcf4 = c4 - k4;
          // 현금흐름표가 있는 분기에 자사주·배당이 비어 있으면 안 한 것(0)으로
          pay4 = four.reduce((t, r) => t + Math.max(0, r[11] || 0) + Math.max(0, r[12] || 0), 0);
        }
      }
      if (ok && sr > 0) {
        const so = four.reduce((t, r) => (r[3] == null ? NaN : t + r[3]), 0);
        const sn = four.reduce((t, r) => (r[4] == null ? NaN : t + r[4]), 0);
        // 이익이 매출보다 큰 이익률(지주회사의 지분법 이익 등)은 사업 규모를 뜻하지 않아 버림
        opm = isFinite(so) && so <= sr ? so / sr : null;
        npm = isFinite(sn) && sn <= sr ? sn / sr : null;
      }
    }
    // 재무상태표: 그 분기말 잔액과 1년 전 잔액
    const ta = q[i][9] > 0 ? q[i][9] : null, eq = q[i][10] != null ? q[i][10] : null;
    const taY = y?.[9] > 0 ? y[9] : null, eqY = y?.[10] != null ? y[10] : null;
    const eqAvg = eq != null && eq > 0 ? (eqY != null && eqY > 0 ? (eq + eqY) / 2 : eq) : null;
    const taAvg = ta != null ? (taY != null ? (ta + taY) / 2 : ta) : null;
    out.push({
      end, filed,
      gp4, cfo4, fcf4, pay4, ta, eq: eq != null && ta != null && eq > ta ? null : eq,
      gpa: gp4 != null && ta ? gp4 / ta : null,
      roe: ni4 != null && eqAvg ? ni4 / eqAvg : null,
      ag: ta && taY ? ta / taY - 1 : null,
      acc: ni4 != null && cfo4 != null && taAvg ? (ni4 - cfo4) / taAvg : null,
      rev_yoy: growth(rev, y?.[2]), rev_qoq: growth(rev, p?.[2]),
      oi_yoy: growth(oi, y?.[3]), oi_qoq: growth(oi, p?.[3]),
      ni_yoy: growth(ni, y?.[4]), ni_qoq: growth(ni, p?.[4]),
      eps_yoy: growth(eps, y?.[5]), eps_qoq: growth(eps, p?.[5]),
      opm, npm, rev4, ni4,
    });
  }
  return out;
}

/** 실적 DB를 종목별 지표로 준비 */
export function prepFund(db) {
  const by = new Map();
  for (const [k, v] of Object.entries(db?.t || {})) if (v.q?.length) by.set(k, quarterMetrics(v.q));
  return { by, updated: db?.updated, src: db?.src };
}

const prepCache = new Map();
export async function loadFundPrep(group) {
  if (!prepCache.has(group)) prepCache.set(group, loadFund(group).then((db) => (db ? prepFund(db) : null)).catch(() => null));
  return prepCache.get(group);
}

/** ym(YYYYMM) 달 말에 리밸런싱할 때 쓸 수 있는 공시 마감일: 그 달 마지막 날 이틀 전까지 공시된 분기만 */
export function cutoffOf(ym) {
  const y = Math.floor(ym / 100), m = ym % 100;
  const last = new Date(Date.UTC(y, m, 0)); last.setUTCDate(last.getUTCDate() - 2);
  return last.getUTCFullYear() * 10000 + (last.getUTCMonth() + 1) * 100 + last.getUTCDate();
}

/** 공시일 ≤ cutoff인 분기 중 가장 최근 것의 지표. 그 분기가 너무 오래됐으면(분기말 200일 넘게 지남) null */
export function fundAt(prep, key, cutoff) {
  const arr = prep?.by.get(key);
  if (!arr) return null;
  let best = null;
  for (const x of arr) if (x.filed <= cutoff && (!best || x.end > best.end)) best = x;
  if (!best || gap(best.end, cutoff) > 200) return null;
  return best;
}
