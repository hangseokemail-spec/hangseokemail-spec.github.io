import './node-loader.mjs';
import { runBacktest } from '../js/core/engine.js';
import { computeMetrics } from '../js/core/metrics.js';
const r = await runBacktest({ kind: 'rank', currency: 'USD', initial: 10000, start: '2023-11', end: '2026-10', rebalance: 'M', feeBp: 10, rank: { group: 'US_STOCK', metric: 'mcap', from: 1, top: 3, weighting: 'equal', lookback: 12, skip: 0 } });
const b = await runBacktest({ currency: 'USD', initial: 10000, start: '2023-11', end: '2026-10', rebalance: 'none', feeBp: 10, assets: [{ key: 'SPY', w: 100 }] });
const m = computeMetrics(r, b, 0);
console.log('CAGR', (m.cagr * 100).toFixed(1), 'final', m.final.toFixed(0), 'MDD', (m.mdd * 100).toFixed(1), 'vol', (m.vol * 100).toFixed(1), 'sharpe', m.sharpe.toFixed(2), 'excess', (m.excessCagr * 100).toFixed(1), 'beta', m.beta.toFixed(2));
console.log(r.rankHistory.slice(-3).map((h) => h.ym + ':' + h.picks.map((p) => p.key).join('/')).join('  '));
