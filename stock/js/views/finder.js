// 탭: 전략 찾기 — 목표 수익률·최대 낙폭·기간 → 규칙 조합을 시험해 추천
import { $, $$, store, toast, sheet } from '../ui/dom.js';
import { fmtPct, esc, dirClass } from '../ui/format.js';
import { mount, css, isMobile } from '../ui/charts.js';
import { findStrategies, candSentence, candToBacktest } from '../core/finder.js';
import { loadUniverse } from '../core/data.js';

let root = null, last = null, busy = false, picked = null;
const DEF = { targetCagr: 10, maxMdd: 20, years: 15, market: 'US', allowLev: false };

export function initFinder(container) {
  root = container;
  const saved = store('ss.finder') || {};
  const opt = { ...DEF, ...saved };
  const pre = sessionStorage.getItem('ss.finderPrefill');
  if (pre) { try { Object.assign(opt, JSON.parse(pre)); } catch { /* 무시 */ } sessionStorage.removeItem('ss.finderPrefill'); }
  render(opt);
  window.addEventListener('finder:prefill', (e) => { Object.assign(opt, e.detail); render(opt); go(opt); });
  if (pre) go(opt);
}

function render(opt) {
  root.innerHTML = `
    <div class="finder-head">
      <h1 class="ask-title">목표를 정하면, 맞는 투자 <em>규칙</em>을 찾아 드려요</h1>
      <p class="cap">종목을 찍어 주는 게 아니라 “무엇을 어떤 기준으로 고르고, 언제 바꾸고, 언제 피할지” 규칙을 수백 개 시험해서 과거에 목표를 지킨 규칙을 보여 줘요.</p>
    </div>
    <form class="surface finder-form" id="fForm">
      <label class="ff"><span class="lb">목표 연수익률</span><span class="ff-big"><input class="input num" id="fTarget" inputmode="decimal" value="${opt.targetCagr}"><b>%</b></span><input type="range" min="3" max="25" step="0.5" value="${opt.targetCagr}" id="fTargetR" aria-label="목표 연수익률"></label>
      <label class="ff"><span class="lb">견딜 수 있는 최대 낙폭</span><span class="ff-big"><b>−</b><input class="input num" id="fMdd" inputmode="decimal" value="${opt.maxMdd}"><b>%</b></span><input type="range" min="5" max="60" step="1" value="${opt.maxMdd}" id="fMddR" aria-label="최대 낙폭"></label>
      <div class="ff"><span class="lb">시험 기간</span><div class="seg" id="fYears">${[5, 10, 15, 20, 30].map((y) => `<button type="button" data-v="${y}" aria-pressed="${opt.years === y}">${y}년</button>`).join('')}</div></div>
      <div class="ff"><span class="lb">시장</span><div class="seg" id="fMkt">${[['US', '미국'], ['KR', '국내'], ['ALL', '둘 다(원화)']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${opt.market === v}">${l}</button>`).join('')}</div><label class="toggle"><input type="checkbox" id="fLev" ${opt.allowLev ? 'checked' : ''}> 레버리지 ETF도 후보에</label></div>
      <div class="ff ff-go"><button class="btn primary big" type="submit" id="fGo">규칙 찾기</button><div class="progress" hidden><i></i></div><span class="cap" id="fProg"></span></div>
    </form>
    <div id="fResult">${emptyHtml()}</div>`;
  const sync = (a, b) => { $(a, root).addEventListener('input', () => { $(b, root).value = $(a, root).value; }); };
  sync('#fTarget', '#fTargetR'); sync('#fTargetR', '#fTarget'); sync('#fMdd', '#fMddR'); sync('#fMddR', '#fMdd');
  $$('.seg button', root).forEach((b) => { b.onclick = () => $$('button', b.parentElement).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
  $('#fForm', root).onsubmit = (e) => { e.preventDefault(); go(readOpt()); };
  $$('[data-ex]', root).forEach((b) => { b.onclick = () => { const [t, m] = b.dataset.ex.split(','); $('#fTarget', root).value = t; $('#fTargetR', root).value = t; $('#fMdd', root).value = m; $('#fMddR', root).value = m; go(readOpt()); }; });
}
function emptyHtml() {
  return `<div class="surface empty finder-empty"><p>목표를 넣고 <b>규칙 찾기</b>를 누르세요. 휴대폰에서도 몇 초면 끝나요.</p>
    <div class="chips" style="justify-content:center">${[['8', '15', '안정형: 연 8% · 낙폭 15% 이내'], ['12', '25', '균형형: 연 12% · 낙폭 25% 이내'], ['18', '35', '공격형: 연 18% · 낙폭 35% 이내']].map(([t, m, l]) => `<button class="chip" type="button" data-ex="${t},${m}">${l}</button>`).join('')}</div></div>`;
}
function readOpt() {
  const v = (id) => +$(id, root).value;
  const p = (id) => $(`${id} button[aria-pressed="true"]`, root)?.dataset.v;
  return { targetCagr: v('#fTarget') || 10, maxMdd: Math.abs(v('#fMdd')) || 20, years: +p('#fYears') || 15, market: p('#fMkt') || 'US', allowLev: $('#fLev', root).checked };
}

async function go(opt) {
  if (busy) return;
  busy = true; picked = null;
  store('ss.finder', opt);
  const btn = $('#fGo', root), prog = $('.progress', root), lab = $('#fProg', root);
  btn.disabled = true; prog.hidden = false;
  try {
    await loadUniverse();
    last = await findStrategies({ ...opt, onProgress: (d, t, what) => { prog.firstChild.style.width = `${(d / Math.max(1, t)) * 100}%`; lab.textContent = `${what} ${d}/${t}`; } });
    last.opt = opt;
    renderResult();
  } catch (e) { console.error(e); toast(e.message || '계산하지 못했어요.'); }
  finally { busy = false; btn.disabled = false; prog.hidden = true; lab.textContent = ''; }
}

function renderResult() {
  const R = $('#fResult', root);
  const { all, qualified, recs, opt, yms } = last;
  const yrs = Math.round((yms.length - 1) / 12);
  const halfY = Math.round(yrs / 2);
  const met = qualified.length;
  R.innerHTML = `
    <div class="finder-verdict ${met ? 'ok' : 'miss'}">
      <div class="fv-n">${all.length}<small>개 규칙 시험</small></div>
      <div><b>${met ? `목표(연 ${opt.targetCagr}% 이상 · 낙폭 −${opt.maxMdd}% 이내)를 지킨 규칙 ${met}개를 찾았어요.` : `목표를 모두 지킨 규칙은 없었어요. 가장 가까운 규칙을 보여 드려요.`}</b>
      <p class="cap">${fmtYm(yms[1])} ~ ${fmtYm(yms[yms.length - 1])}(${yrs}년), ${last.base === 'USD' ? '달러' : '원화'} 기준, 거래비용 0.1%, 월말 판단. 아래 점 하나가 규칙 하나예요.</p></div>
    </div>
    <div class="surface finder-chart-box">
      <div class="row" style="justify-content:space-between"><div class="section-title" style="margin:0">수익률과 낙폭 지도</div><div class="fc-legend"><span><i class="ok"></i>목표 안</span><span><i class="no"></i>목표 밖</span><span><i class="rec"></i>추천</span></div></div>
      <div class="chart" id="fScatter" style="height:${isMobile() ? 320 : 380}px" role="img" aria-label="규칙별 연수익률과 최대 낙폭"></div>
      <p class="cap">오른쪽 위(덜 빠지고 더 번)로 갈수록 좋아요. 초록 칸이 목표 영역이에요. 점을 누르면 그 규칙이 아래에 나와요.</p>
    </div>
    <div id="fPicked"></div>
    <div class="section-title" style="margin-top:20px">${met ? '추천 규칙' : '목표에 가장 가까운 규칙'} <span class="cap">계열이 겹치지 않게 골랐어요</span></div>
    <div class="rec-list">${recs.map((c, i) => recCard(c, i, halfY)).join('')}</div>
    <details class="more" style="margin-top:16px"><summary>${met ? `목표를 지킨 규칙 ${met}개 모두 보기` : '전체 순위 보기'}</summary>${allTable(met ? qualified : all.slice(0, 40))}</details>
    <div class="honest"><b>읽기 전에</b><ul>
      <li>과거 ${yrs}년에 잘 맞은 규칙을 수백 개 중에서 골랐기 때문에 운이 섞여 있어요. <b>앞 ${halfY}년과 뒤 ${halfY}년 성적이 둘 다 괜찮은 규칙</b>(✓ 일관)일수록 덜 우연이에요.</li>
      <li>순위 규칙은 지금 DB에 있는 종목 안에서만 고르므로 과거에 사라진 종목이 빠져 실제보다 좋게 나올 수 있어요(생존 편향).</li>
      <li>여기 수치는 월 단위 빠른 계산이에요. <b>이 규칙으로 백테스트</b>를 누르면 일별 정밀 계산을 해서 조금 다를 수 있어요.</li>
    </ul></div>`;
  drawScatter();
  $$('[data-bt]', R).forEach((b) => { b.onclick = () => toBacktest(b.dataset.bt); });
  $$('[data-pick]', R).forEach((b) => { b.onclick = () => showPicked(b.dataset.pick); });
}
const fmtYm = (ym) => `${Math.floor(ym / 100)}.${String(ym % 100).padStart(2, '0')}`;

function spark(values, w = 120, h = 34) {
  const n = values.length; if (n < 2) return '';
  const lo = Math.min(...values), hi = Math.max(...values);
  const pts = values.map((v, i) => `${((i / (n - 1)) * w).toFixed(1)},${(h - 2 - ((v - lo) / (hi - lo || 1)) * (h - 4)).toFixed(1)}`).join(' ');
  return `<svg class="spark" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}
function recCard(c, i, halfY) {
  return `<article class="rec-card${c.ok ? ' ok' : ''}">
    <div class="rc-top"><span class="rc-n">${i + 1}</span><span class="rc-fam">${esc(c.fam)}${c.mk === 'KR' ? ' · 국내' : ''}</span>${c.consistent ? '<span class="status-pill good" title="앞·뒤 절반 기간 모두 목표의 60% 이상, 낙폭도 크게 넘지 않음">✓ 일관</span>' : '<span class="status-pill caution" title="한쪽 절반에서만 좋았어요">기간 편차 큼</span>'}</div>
    <p class="rc-rule">${esc(candSentence(c))}</p>
    <div class="rc-nums">
      <div><span class="lb">연수익률</span><b class="${dirClass(c.m.cagr)}">${fmtPct(c.m.cagr)}</b></div>
      <div><span class="lb">최대 낙폭</span><b>${fmtPct(c.m.mdd)}</b></div>
      <div><span class="lb">변동성</span><b>${fmtPct(c.m.vol)}</b></div>
      <div class="rc-spark">${spark(c.values)}</div>
    </div>
    <div class="rc-half"><span>앞 ${halfY}년 <b>${fmtPct(c.h1?.cagr)}</b> · 낙폭 ${fmtPct(c.h1?.mdd)}</span><span>뒤 ${halfY}년 <b>${fmtPct(c.h2?.cagr)}</b> · 낙폭 ${fmtPct(c.h2?.mdd)}</span></div>
    <div class="row"><button class="btn primary small" type="button" data-bt="${esc(c.id)}">이 규칙으로 백테스트</button><span class="cap">연 회전율 ${fmtPct(c.turnover, 0)}</span></div>
  </article>`;
}
function allTable(list) {
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>규칙</th><th class="num">연수익률</th><th class="num">최대 낙폭</th><th class="num">앞 절반</th><th class="num">뒤 절반</th><th></th></tr></thead><tbody>${list.map((c) => `<tr><td style="white-space:normal;min-width:260px">${esc(candSentence(c))}</td><td class="num ${dirClass(c.m.cagr)}">${fmtPct(c.m.cagr)}</td><td class="num">${fmtPct(c.m.mdd)}</td><td class="num">${fmtPct(c.h1?.cagr)}</td><td class="num">${fmtPct(c.h2?.cagr)}</td><td><button class="btn small ghost" type="button" data-bt="${esc(c.id)}">백테스트</button></td></tr>`).join('')}</tbody></table></div>`;
}
function showPicked(id) {
  const c = last.all.find((x) => x.id === id);
  if (!c) return;
  picked = id;
  const box = $('#fPicked', root);
  box.innerHTML = `<div class="section-title" style="margin-top:16px">고른 점</div><div class="rec-list one">${recCard(c, -1, Math.round((last.yms.length - 1) / 24))}</div>`;
  box.querySelector('.rc-n').textContent = '•';
  $$('[data-bt]', box).forEach((b) => { b.onclick = () => toBacktest(b.dataset.bt); });
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  drawScatter();
}
function toBacktest(id) {
  const c = last.all.find((x) => x.id === id);
  if (!c) return;
  const state = candToBacktest(c, Math.round((last.yms.length - 1) / 12));
  sessionStorage.setItem('ss.pendingBt', JSON.stringify(state));
  location.hash = '#backtest';
  window.dispatchEvent(new Event('bt:pending'));
  toast('백테스트 탭에서 일별로 정밀 계산해요.');
}

function drawScatter() {
  const elm = $('#fScatter', root);
  const c = mount(elm);
  if (!c) return;
  const { all, recs, target, limit } = last;
  const recIds = new Map(recs.map((x, i) => [x.id, i + 1]));
  const pt = (x) => ({ value: [x.m.mdd * 100, x.m.cagr * 100], id: x.id, name: candSentence(x) });
  const draw = () => {
    const xs = all.map((x) => x.m.mdd * 100), ys = all.map((x) => x.m.cagr * 100);
    const xmin = Math.floor(Math.min(...xs, limit * 100) / 10) * 10, ymax = Math.ceil(Math.max(...ys, target * 100) / 5) * 5, ymin = Math.floor(Math.min(0, ...ys) / 5) * 5;
    c.setOption({
      animationDuration: 300, textStyle: { fontFamily: css('--font'), color: css('--text-2') },
      grid: { left: 8, right: 16, top: 16, bottom: 28, containLabel: true },
      tooltip: { trigger: 'item', confine: true, backgroundColor: css('--bg-surface'), borderColor: css('--border'), textStyle: { color: css('--text-1'), fontSize: 12 }, extraCssText: 'max-width:280px;white-space:normal;', formatter: (p) => `<b>연 ${p.value[1].toFixed(1)}% · 낙폭 ${p.value[0].toFixed(1)}%</b><br>${esc(p.data.name)}` },
      xAxis: { type: 'value', min: xmin, max: 0, name: '최대 낙폭(%) →  덜 빠짐', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: css('--text-3'), fontSize: 12 }, axisLabel: { color: css('--text-3'), formatter: (v) => `${v}%` }, splitLine: { lineStyle: { color: css('--border') } } },
      yAxis: { type: 'value', min: ymin, max: ymax, name: '연수익률', nameTextStyle: { color: css('--text-3'), fontSize: 12 }, axisLabel: { color: css('--text-3'), formatter: (v) => `${v}%` }, splitLine: { lineStyle: { color: css('--border') } } },
      series: [
        { type: 'scatter', name: '목표 밖', data: all.filter((x) => !x.ok && !recIds.has(x.id)).map(pt), symbolSize: 7, itemStyle: { color: css('--text-3'), opacity: 0.35 },
          markArea: { silent: true, itemStyle: { color: css('--st-good-bg'), opacity: 0.9, borderColor: css('--st-good'), borderWidth: 1, borderType: 'dashed' }, label: { show: true, position: 'insideTopRight', color: css('--st-good'), fontSize: 12, formatter: '목표 영역' }, data: [[{ xAxis: limit * 100, yAxis: target * 100 }, { xAxis: 0, yAxis: ymax }]] } },
        { type: 'scatter', name: '목표 안', data: all.filter((x) => x.ok && !recIds.has(x.id)).map(pt), symbolSize: 9, itemStyle: { color: css('--st-good') } },
        { type: 'scatter', name: '추천', data: recs.map((x) => ({ ...pt(x), label: { show: true, formatter: String(recIds.get(x.id)), color: css('--on-accent'), fontWeight: 700, fontSize: 11 } })), symbolSize: 20, itemStyle: { color: css('--accent'), borderColor: css('--bg-surface'), borderWidth: 2 }, z: 5 },
        ...(picked ? [{ type: 'scatter', name: '고른 점', data: all.filter((x) => x.id === picked).map(pt), symbolSize: 22, symbol: 'circle', itemStyle: { color: 'transparent', borderColor: css('--text-1'), borderWidth: 2 }, z: 6 }] : []),
      ],
    }, true);
    c.off('click');
    c.on('click', (p) => { if (p.data?.id) showPicked(p.data.id); });
  };
  c.__redraw = draw;
  draw();
}
