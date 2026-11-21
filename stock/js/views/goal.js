// 탭 '목표' — ① 목표 금액 정하기(돈의 가치 저울) ② 어떻게 모을까(실행 목표) ③ 돈이 모이는 모습 → 노후 탭으로 이어 가기
import { $, store, toast } from '../ui/dom.js';
import { fmtKRW, fmtKRWShort, esc } from '../ui/format.js';
import { lineChart, css, isMobile } from '../ui/charts.js';
import { loadGoal, renderGoalCards } from './goalcards.js';
import { monthly as mRate } from '../core/goalcalc.js';
import { loadHoldings, valuate } from '../core/holdings.js';

let root = null, G = null, api = null, lastInfo = null;
const span = (m) => (m < 12 ? `${m}개월` : `${Math.floor(m / 12)}년${m % 12 ? ` ${m % 12}개월` : ''}`);

/** 내 자산 총액(내 자산 탭을 아직 안 열었어도 동작) */
export function requestAssetsTotal(cb) {
  let done = false;
  window.dispatchEvent(new CustomEvent('assets:request-total', { detail: { cb: (t, l) => { done = true; cb(t, l); } } }));
  if (!done) { try { const v = valuate(loadHoldings(), {}); cb(v.total, '가족 전체 자산'); } catch { cb(0, ''); } }
}

let shownAt = 0;
export function initGoal(container) {
  root = container;
  render(); shownAt = Date.now();
  // 노후 탭에서 목표를 바꾸고 돌아오면 다시 그림
  window.addEventListener('tabshown', (e) => { if (e.detail === 'goal' && root.isConnected && (store('ss.goal')?.at || 0) > shownAt) { render(); shownAt = Date.now(); } });
  window.addEventListener('goal:reload', () => { if (root.isConnected) { render(); shownAt = Date.now(); } });
}
function save() { G.at = Date.now(); store('ss.goal', G); }

function render() {
  G = loadGoal();
  root.innerHTML = `
    <div class="view-intro"><h1>목표</h1><p>얼마를 언제까지 모을지 정하는 곳이에요. <b>1</b> 목표 금액을 정하고 <b>2</b> 모으는 방법을 고른 뒤 <b>3</b> 모이는 모습을 확인하세요. 정한 값은 <b>노후</b> 탭의 기본값이 돼요.</p></div>
    <div id="goalCards"></div>
    <section class="gcard gpath" aria-labelledby="gpTitle">
      <div class="gtitle-row"><span class="gstep">3</span><h2 class="gtitle" id="gpTitle">돈이 모이는 모습 <small>2번대로 넣었을 때 해마다 통장 숫자</small></h2></div>
      <div class="gpath-grid">
        <div><div class="chart-tools"><div class="legend" id="goalLegend"></div></div><div class="readout" id="goalReadout"></div><div class="chart-box"><div class="chart" id="goalChart" role="img" aria-label="돈이 모이는 모습"></div></div></div>
        <ul class="gpath-facts" id="goalFacts"></ul>
      </div>
    </section>
    <section class="gnext" id="goalNext"></section>`;
  api = renderGoalCards($('#goalCards', root), G, {
    save, toast,
    toFinder: goFinder,
    fromAssets: (cb) => requestAssetsTotal((total, label) => { if (!total) { toast('내 자산 탭에 등록된 자산이 없어요.'); return; } cb(total); toast(`${label} ${fmtKRW(total)}을 넣었어요.`); }),
    onSolved: (info) => { lastInfo = info; drawPath(); drawNext(); },
  });
}

function goFinder(ratePct, years) {
  const pre = { targetCagr: +(+ratePct).toFixed(1), years: [5, 10, 15, 20].reduce((a, y) => (Math.abs(y - years) < Math.abs(a - years) ? y : a), 15) };
  sessionStorage.setItem('ss.finderPrefill', JSON.stringify(pre));
  location.hash = '#finder';
  window.dispatchEvent(new CustomEvent('finder:prefill', { detail: pre }));
}

/** 해마다 통장 숫자·넣은 돈 */
function pathOf(f) {
  const i = mRate(f.rate), n = f.months;
  const bal = [f.initial], paid = [f.initial];
  let B = f.initial;
  for (let m = 1; m <= n; m++) { B = B * (1 + i) + f.monthlyAmt; bal.push(B); paid.push(f.initial + f.monthlyAmt * m); }
  return { bal, paid };
}
function drawPath() {
  const chartEl = $('#goalChart', root), facts = $('#goalFacts', root);
  if (!chartEl) return;
  const info = lastInfo;
  if (!info?.ok || !info.s?.full || !(info.s.full.months > 0)) {
    window.echarts?.getInstanceByDom(chartEl)?.dispose();
    chartEl.innerHTML = '<p class="empty" style="padding:40px 0;text-align:center">2번에서 목표에 닿는 방법이 나오면 여기에 그려져요.</p>';
    facts.innerHTML = ''; $('#goalLegend', root).innerHTML = '';
    return;
  }
  if (chartEl.querySelector(':scope > .empty')) chartEl.innerHTML = ''; // 차트가 이미 있으면 그대로 두고 옵션만 바꿈(지우면 빈 화면이 됨)
  const f = info.s.full, { bal, paid } = pathOf(f), T = info.target, n = f.months;
  const cmps = (info.compares || []).map((c, i) => ({ ...c, color: css(`--compare-${(i % 6) + 1}`), ...pathOf(c.full) }));
  const nMax = Math.max(n, ...cmps.map((c) => c.full.months));
  const x = (m) => m / 12;
  const stepOf = (len) => (len > 240 ? 12 : len > 60 ? 3 : 1);
  const pts = (arr) => { const len = arr.length - 1, st = stepOf(len); return arr.map((v, m) => [x(m), v]).filter((_, m) => m % st === 0 || m === len); };
  const series = [
    { name: cmps.length ? '지금 조건' : '통장 숫자', color: css('--series-1'), area: !cmps.length, data: pts(bal), width: 2.5 },
    { name: cmps.length ? '넣은 돈(지금 조건)' : '넣은 돈', color: css('--text-3'), data: pts(paid), width: 1.5 },
    ...cmps.map((c) => ({ name: c.label, color: c.color, data: pts(c.bal), width: 2.2 })),
    { name: '목표', color: css('--accent'), dashed: true, width: 1.5, data: [[0, T], [x(nMax), T]] },
  ];
  $('#goalLegend', root).innerHTML = series.map((s) => `<button type="button" aria-pressed="true"><i style="background:${s.dashed ? `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)` : s.color}"></i>${esc(s.name)}</button>`).join('');
  lineChart(chartEl, { series, xType: 'value', isTime: false, xMin: 0, xMax: x(nMax), xFmt: (v) => (v ? `${+(+v).toFixed(1)}년 뒤` : '지금'), yFmt: (v, ax) => (ax ? fmtKRWShort(v) : fmtKRW(v)), yMin: 0, readout: isMobile() ? $('#goalReadout', root) : null, grid: { left: 60, right: 20, containLabel: false, bottom: 28 } });
  // 짚어 볼 때
  const firstAt = (pred) => { for (let m = 0; m <= n; m++) if (pred(m)) return m; return null; };
  const half = firstAt((m) => bal[m] >= T / 2);
  const cross = firstAt((m) => m > 0 && bal[m] - paid[m] >= paid[m]);
  const lastYear = n >= 12 ? bal[n] - bal[n - 12] - f.monthlyAmt * 12 : null;
  const firstYear = n >= 12 ? bal[12] - bal[0] - f.monthlyAmt * 12 : null;
  const cmpFacts = cmps.length ? [['지금 조건', `${span(n)} 뒤 ${fmtKRWShort(bal[n])}`, `넣은 돈 ${fmtKRWShort(paid[n])} · 매달 ${fmtKRWShort(f.monthlyAmt)} · 연 ${(f.rate * 100).toFixed(1)}%`, css('--series-1')],
    ...cmps.map((c) => { const m = c.full.months; return [c.label, `${span(m)} 뒤 ${fmtKRWShort(c.bal[m])}`, `넣은 돈 ${fmtKRWShort(c.paid[m])}${c.paid[m] < paid[n] ? `(${fmtKRWShort(paid[n] - c.paid[m])} 덜)` : c.paid[m] > paid[n] ? `(${fmtKRWShort(c.paid[m] - paid[n])} 더)` : ''} · 매달 ${fmtKRWShort(c.full.monthlyAmt)} · 연 ${(c.full.rate * 100).toFixed(1)}%`, c.color]; })] : null;
  if (cmpFacts) { facts.innerHTML = cmpFacts.map(([lb, v, c, col]) => `<li class="cmp" style="--c:${col}"><span class="lb">${esc(lb)}</span><b>${esc(v)}</b><span class="cap">${esc(c)}</span></li>`).join(''); return; }
  facts.innerHTML = [
    ['목표에 닿는 때', `${span(n)} 뒤`, `통장 ${fmtKRW(bal[n])}`],
    half != null ? ['목표의 절반', half ? `${span(half)} 뒤` : '지금', '뒤로 갈수록 빨리 불어나요'] : null,
    ['불어난 돈 > 넣은 돈', cross != null ? `${span(cross)} 뒤` : '기간 안엔 아직', cross != null ? '이때부터 굴린 돈이 더 많아요' : '기간이 길수록 이 순간이 와요'],
    lastYear != null ? ['마지막 1년에 불어나는 돈', fmtKRW(lastYear), `첫해 ${fmtKRW(firstYear)}의 ${firstYear > 0 ? `${(lastYear / firstYear).toFixed(1)}배` : '–'}`] : null,
  ].filter(Boolean).map(([lb, v, c]) => `<li><span class="lb">${esc(lb)}</span><b>${esc(v)}</b><span class="cap">${esc(c)}</span></li>`).join('');
}
function drawNext() {
  const box = $('#goalNext', root);
  if (!box) return;
  const info = lastInfo;
  const ok = info?.ok && info.s?.full;
  const f = ok ? info.s.full : null;
  const yrs = f ? Math.max(1, Math.ceil(f.months / 12)) : null;
  box.innerHTML = `<div class="gnext-in">
      <div><span class="gstep">4</span><b>이 목표로 노후 준비하기</b>
        <p class="cap">${ok ? `노후 탭에 처음 목돈 ${esc(fmtKRW(f.initial))} · 매달 ${esc(fmtKRW(f.monthlyAmt))} · 연 ${(f.rate * 100).toFixed(1)}% · ${yrs}년 뒤 은퇴가 기본값으로 들어가요. 거기서 은퇴 뒤 생활비와 연금을 넣으면 이 돈으로 몇 살까지 쓸 수 있는지 보여 줘요.` : '2번에서 목표에 닿는 방법이 나오면 노후 탭으로 넘길 수 있어요.'}</p></div>
      <div class="gnext-btns"><button class="btn primary big" type="button" id="toRetire" ${ok ? '' : 'disabled'}>노후 탭에서 이어 가기 →</button>${ok && f.rate > 0 && f.rate <= 0.3 ? `<button class="btn" type="button" id="toFinderNext">연 ${(f.rate * 100).toFixed(1)}% 내는 투자 규칙 찾기 →</button>` : ''}</div>
    </div>`;
  $('#toRetire', box)?.addEventListener('click', () => { sessionStorage.setItem('ss.useGoal', '1'); location.hash = '#plan'; });
  $('#toFinderNext', box)?.addEventListener('click', () => goFinder(+(f.rate * 100).toFixed(1), f.months / 12));
}
void api;
