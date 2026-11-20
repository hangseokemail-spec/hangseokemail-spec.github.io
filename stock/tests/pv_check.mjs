import './node-loader.mjs';
import { runBacktest } from '../js/core/engine.js';
import { computeMetrics } from '../js/core/metrics.js';
const base = { currency: 'USD', initial: 10000, start: '2017-01', end: '2026-10' };
for (const reb of ['A', 'Q', 'M', 'none']) {
  const p = await runBacktest({ ...base, assets: [{ key: 'QQQ', w: 40 }, { key: 'VGTSX', w: 20 }, { key: 'VGSIX', w: 10 }, { key: 'VBMFX', w: 30 }], rebalance: reb });
  const b = await runBacktest({ ...base, assets: [{ key: 'VFINX', w: 100 }], rebalance: 'none' });
  const m = computeMetrics(p, b, 0);
  const bm = computeMetrics(b, null, 0);
  console.log(reb, 'final', m.final.toFixed(0), 'CAGR', (m.cagr*100).toFixed(2), 'vol', (m.vol*100).toFixed(2), 'MDD', (m.mdd*100).toFixed(2), 'MDDd', (m.mddDaily*100).toFixed(2), 'best', m.best?.year, (m.best?.r*100).toFixed(2), 'worst', m.worst?.year, (m.worst?.r*100).toFixed(2), 'pos', m.posMonths, '/', m.monthlyR.length, '| bench', bm.final.toFixed(0), (bm.cagr*100).toFixed(2));
}
