// 몬테카를로(앞으로): 과거 월수익률을 block개월 묶음으로 섞어 다시 뽑아 미래 경로 n개를 만든다. 씨앗이 같으면 결과도 같다.
export function mulberry(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function monteCarlo(rets, { years, initial, flow = null, n = 2000, block = 12, seed = 7 }) {
  const N = rets.length, H = years * 12, rnd = mulberry(seed);
  const qs = Array.from({ length: years + 1 }, () => new Float64Array(n));
  const fin = new Float64Array(n), cagr = new Float64Array(n), mdd = new Float64Array(n), paid = [];
  const fq = flow?.freq === 'Q' ? 3 : flow?.freq === 'A' ? 12 : 1;
  for (let p = 0; p < n; p++) {
    let V = initial, idx = 0, left = 0, twr = 1, peak = 1, dd = 0, put = initial;
    qs[0][p] = V;
    for (let m = 1; m <= H; m++) {
      if (left === 0) { idx = Math.floor(rnd() * N); left = block; }
      const r = rets[idx % N]; idx++; left--;
      V *= 1 + r; twr *= 1 + r;
      if (twr > peak) peak = twr; else dd = Math.min(dd, twr / peak - 1);
      if (flow?.amount && m % fq === 0) { const amt = flow.amount * Math.pow(1 + (flow.growth || 0) / 100, Math.floor((m - 1) / 12)); V += amt; if (amt > 0) put += amt; if (V < 0) V = 0; }
      if (m % 12 === 0) qs[m / 12][p] = V;
    }
    fin[p] = V; cagr[p] = Math.pow(twr, 1 / years) - 1; mdd[p] = dd; paid.push(put);
  }
  const pct = (arr, q) => { const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.max(0, Math.round(q * (a.length - 1))))]; };
  const Q = [0.1, 0.25, 0.5, 0.75, 0.9];
  return {
    band: qs.map((a) => Q.map((q) => pct(a, q))),
    final: Q.map((q) => pct(fin, q)), cagr: Q.map((q) => pct(cagr, q)), mdd: Q.map((q) => pct(mdd, q)), // 낙폭은 아래 10%가 가장 깊음
    paid: paid[0], pLoss: fin.filter((v, i) => v < paid[i]).length / n, pDeep: mdd.filter((x) => x < -0.3).length / n, pTwrLoss: cagr.filter((x) => x < 0).length / n, n, N,
  };
}
