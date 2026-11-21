// 탭3 내 자산 — 현황(총자산·구성·배당·지도·계좌) · 종목 · 위험 · 기록, 캡처 인식
import { $, $$, el, store, toast, sheet, settings, saveSettings, moneyHints } from '../ui/dom.js';
import { fmtKRW, fmtKRWShort, fmtUSD, fmtPct, fmtPp, fmtPrice, esc, dirClass, arrow, krRead, krReadUSD } from '../ui/format.js';
import { donut, treemap, barChart, lineChart, catColor, css, isMobile } from '../ui/charts.js';
import { searchAssets, assetInfo } from '../core/data.js';
import { ACCOUNT_TYPES, typeLabel, loadHoldings, saveHoldings, uid, ensureKrAll, matchName, infoOf, valuate, mergeByKey, dividendForecast, riskCheck, rebalanceOrders, toBacktestAssets, fxNow, refreshFx, exposure } from '../core/holdings.js';
import { hasKey, aiReadHoldings } from '../core/ai.js';
import { kindLabel, requestTicker } from './backtest.js';
import { todayYm, ymAdd, ymToIso } from '../core/dates.js';

let root = null, H = null, filter = { owner: 'all', account: null }, seg = 'summary', compBy = 'name', compMode = 'asset', chartMode = 'donut', merged = true, afterTax = true, view = null, risk = null, riskKey = '';
const colorMap = new Map();
const colorFor = (k) => { if (!colorMap.has(k)) colorMap.set(k, colorMap.size); return catColor(colorMap.get(k)); };
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hide = () => settings().hideAmounts;
const money = (v, short = false) => (hide() ? '•••' : short ? fmtKRWShort(v) : fmtKRW(v));
let showUsd = false;
const m2 = (v) => (hide() ? '•••' : showUsd ? fmtUSD(v / view.fx.now) : fmtKRW(v));

export async function initAssets(container) {
  root = container;
  H = loadHoldings();
  await ensureKrAll();
  window.addEventListener('assets:request-total', (e) => { const v = valuate(loadHoldings(), filter); e.detail.cb(v.total, filter.owner === 'all' ? '가족 전체 자산' : `${filter.owner}님 자산`); });
  window.addEventListener('assets:request-strategy', (e) => { const v = valuate(loadHoldings(), filter); e.detail.cb(toBacktestAssets(mergeByKey(v.rows)).assets); });
  render();
}

function save() { saveHoldings(H); takeSnapshot(); }
function takeSnapshot(force = false) {
  if (!H.holdings.length && !H.accounts.some((a) => Object.values(a.cash || {}).some(Boolean))) return;
  const snaps = store('ss.snapshots') || [];
  const d = localDate();
  const all = valuate(H, {});
  const byOwner = {}, byAccount = {};
  for (const r of all.rows) { const a = H.accounts.find((x) => x.id === r.account); byOwner[a?.owner || '나'] = (byOwner[a?.owner || '나'] || 0) + r.value; byAccount[r.account] = (byAccount[r.account] || 0) + r.value; }
  const snap = { date: d, total: Math.round(all.total), byOwner, byAccount, weights: mergeByKey(all.rows).slice(0, 30).map((r) => [r.key, +r.weight.toFixed(4)]) };
  const i = snaps.findIndex((s) => s.date === d);
  if (i >= 0) snaps[i] = snap; else snaps.push(snap);
  store('ss.snapshots', snaps.slice(-1500));
  window.dispatchEvent(new Event('snapshots:changed'));
  if (force) toast('오늘 자산을 기록했어요.');
}

function owners() { return [...new Set(H.accounts.map((a) => a.owner || '나'))]; }

function render() {
  view = valuate(H, filter);
  if (!H.accounts.length) { renderEmpty(); return; }
  // 색은 대상을 따라감: 전체 보유를 비중 순으로 한 번 정해 두고 어느 화면에서나 같은 색
  if (!colorMap.size) mergeByKey(valuate(H, {}).rows).forEach((r) => colorFor(r.key));
  takeSnapshot();
  root.innerHTML = `
    <div class="row" style="margin-bottom:12px">
      <div class="chips scroll" id="ownerChips" style="flex:1" aria-label="보기 고르기">
        <button class="chip" type="button" data-o="all" aria-pressed="${filter.owner === 'all' && !filter.account}">모아보기${H.accounts.length > 1 ? ` <span class="faint">${H.accounts.length}개 계좌</span>` : ''}</button>
        ${owners().length > 1 ? owners().map((o) => `<button class="chip" type="button" data-o="${esc(o)}" aria-pressed="${filter.owner === o && !filter.account}">${esc(o)} 전체</button>`).join('') : ''}
        ${H.accounts.map((a) => `<button class="chip acc-chip" type="button" data-accchip="${a.id}" aria-pressed="${filter.account === a.id}">${esc(accName(a))}</button>`).join('')}
        <button class="chip" type="button" id="newAccChip">+ 계좌</button>
      </div>
      <div class="seg" id="curSeg"><button type="button" data-v="KRW" aria-pressed="${!showUsd}">원화</button><button type="button" data-v="USD" aria-pressed="${showUsd}">달러</button></div>
      <button class="icon-btn" type="button" id="eyeBtn" aria-label="금액 숨기기" title="금액 숨기기"><svg viewBox="0 0 24 24">${hide() ? '<path d="M3 3l18 18"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/><path d="M9.9 5.1A10 10 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3 4.2M6.6 6.6A13 13 0 0 0 2 12c1 2.5 5 7 10 7a9.9 9.9 0 0 0 4.4-1"/>' : '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'}</svg></button>
      <button class="btn" type="button" id="capBtn">캡처 올리기</button><button class="btn primary" type="button" id="addBtn">+ 종목 추가</button>
    </div>
    <div class="seg" id="segTabs" style="margin-bottom:14px">${[['summary', '현황'], ['list', '종목'], ['risk', '위험'], ['history', '기록']].map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${seg === k}">${l}</button>`).join('')}</div>
    <div id="segBody"></div>
    <p class="cap" style="margin-top:16px">자산은 계정마다 암호화해서 저장해요. 로그인하면 다른 기기에서도 보이고, 운영자도 내용을 볼 수 없어요.</p>`;
  $$('#ownerChips [data-o]', root).forEach((b) => { b.onclick = () => { filter = { owner: b.dataset.o, account: null }; render(); }; });
  $$('#ownerChips [data-accchip]', root).forEach((b) => { b.onclick = () => { filter = { owner: 'all', account: b.dataset.accchip }; render(); }; });
  $('#newAccChip', root).onclick = () => openAccount(null, (a) => { filter = { owner: 'all', account: a.id }; render(); toast(`‘${a.name}’ 계좌를 만들었어요. 캡처를 올리거나 종목을 추가하세요.`); });
  $$('#curSeg button', root).forEach((b) => { b.onclick = () => { showUsd = b.dataset.v === 'USD'; render(); }; });
  $('#eyeBtn', root).onclick = () => { saveSettings({ hideAmounts: !hide() }); render(); };
  $('#capBtn', root).onclick = openCapture;
  $('#addBtn', root).onclick = () => openAddHolding();
  $$('#segTabs button', root).forEach((b) => { b.onclick = () => { seg = b.dataset.v; render(); }; });
  ({ summary: renderSummary, list: renderList, risk: renderRisk, history: renderHistory })[seg]();
}
const alias = (a) => (a ? a.name || typeLabel(a.type) || '계좌' : '');
const accName = (a) => (a ? (owners().length > 1 ? `${a.owner || '나'} · ${alias(a)}` : alias(a)) : '');

function renderEmpty() {
  root.innerHTML = `<div class="surface empty"><h1 class="page-title">아직 등록한 자산이 없어요</h1>
    <p>계좌 캡처를 올리면 종목을 읽어 확인 표로 보여주고, 직접 입력할 수도 있어요.</p>
    <div class="row" style="justify-content:center"><button class="btn primary" type="button" id="e_cap">계좌 캡처 올리기</button><button class="btn" type="button" id="e_acc">계좌 먼저 만들기</button><button class="btn" type="button" id="e_add">종목 직접 입력</button><button class="btn ghost" type="button" id="e_demo">예시 자산으로 둘러보기</button></div>
    <p class="cap" style="margin-top:16px">자산은 계정마다 암호화해서 저장해요. 운영자도 내용을 볼 수 없어요.</p></div>`;
  $('#e_cap', root).onclick = openCapture;
  $('#e_add', root).onclick = () => openAddHolding();
  $('#e_acc', root).onclick = () => openAccount(null, (a) => { filter = { owner: 'all', account: a.id }; render(); toast(`‘${a.name}’ 계좌를 만들었어요. 캡처를 올리거나 종목을 추가하세요.`); });
  $('#e_demo', root).onclick = () => {
    const a1 = { id: uid(), owner: '나', type: 'overseas', broker: '예시증권', name: '해외주식', cash: { USD: 500 } };
    const a2 = { id: uid(), owner: '나', type: 'pension', broker: '예시증권', name: '연금저축', cash: { KRW: 300000 } };
    const a3 = { id: uid(), owner: '배우자', type: 'isa', broker: '예시증권', name: 'ISA', cash: {} };
    H = { accounts: [a1, a2, a3], holdings: [
      { id: uid(), account: a1.id, key: 'QQQM', qty: 40, avg: 180, cur: 'USD' }, { id: uid(), account: a1.id, key: 'LLY', qty: 12, avg: 700, cur: 'USD' },
      { id: uid(), account: a1.id, key: 'GOOGL', qty: 25, avg: 160, cur: 'USD' }, { id: uid(), account: a1.id, key: 'SMH', qty: 15, avg: 250, cur: 'USD' },
      { id: uid(), account: a2.id, key: '379810', qty: 1500, avg: 15000, cur: 'KRW' }, { id: uid(), account: a2.id, key: '390390', qty: 900, avg: 22000, cur: 'KRW' },
      { id: uid(), account: a3.id, key: '379800', qty: 1200, avg: 16000, cur: 'KRW' }, { id: uid(), account: a3.id, key: '458730', qty: 800, avg: 11000, cur: 'KRW' },
    ], demo: true };
    saveHoldings(H); render(); toast('예시 자산이에요. 둘러본 뒤 종목 탭에서 지우거나 고치세요.');
  };
}

// ------------------------------------------------------------------ 현황
async function renderSummary() {
  const B = $('#segBody', root);
  const v = view;
  const rows = merged ? mergeByKey(v.rows) : v.rows;
  B.innerHTML = `
    <div class="surface">
      <div class="as-head">
        ${headTitle()}
        <div class="as-totals">
          <div><div class="lb">원화로 환산한 총액</div><div class="as-total">${money(v.total)}</div></div>
          <div><div class="lb">달러로 환산한 총액</div><div class="as-total usd">${hide() ? '•••' : fmtUSD(v.total / v.fx.now)}</div>${hide() ? '' : `<div class="kr-read big">${esc(krRead(v.total / v.fx.now, 'USD'))}</div>`}</div>
        </div>
        <div class="as-split">${curSplit(v)}</div>
        <div class="as-sub"><span class="${dirClass(v.pl)}">수익률 ${fmtPct(v.plPct, 1, true)} ${arrow(v.pl)} <span class="faint">평가손익 ${hide() ? '•••' : fmtKRW(v.pl, { plus: true })}</span></span><span class="${dirClass(v.day)}">오늘 ${hide() ? '•••' : fmtKRW(v.day, { plus: true })} (${fmtPct(v.dayPct, 2, true)}) ${arrow(v.day)}</span></div>
        ${v.plCoverage?.noAvg ? `<p class="cap" style="margin:4px 0 0">평균단가가 없는 종목 ${v.plCoverage.noAvg}개는 수익률에서 뺐어요. 종목 탭에서 평균단가를 넣으면 더해져요.</p>` : ''}
        <div class="fx-line"><span>환율 <b>${v.fx.now.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}원</b> · ${esc(fxWhen(v.fx))}</span><button class="btn small ghost" type="button" id="fxBtn">지금 환율로 다시 계산</button></div>
        <div class="facts" style="margin:16px 0 0" id="divFacts"><div class="fact"><div class="lb">연간 예상 배당금</div><div class="v">…</div></div></div>
      </div>
      <div class="section" id="riskLine"><span class="cap">위험 점검 중…</span></div>
      <div class="section">
        <div class="section-title">자산 구성<span class="spacer"></span>
          <div class="seg" id="compMode"><button type="button" data-v="asset" aria-pressed="${compMode === 'asset'}">자산</button><button type="button" data-v="div" aria-pressed="${compMode === 'div'}">배당</button></div>
          <div class="seg" id="chartMode"><button type="button" data-v="donut" aria-pressed="${chartMode === 'donut'}">도넛</button><button type="button" data-v="map" aria-pressed="${chartMode === 'map'}">지도</button></div></div>
        <div class="chips scroll" id="compBy" style="margin-bottom:12px">${[['name', '종목'], ['account', '계좌'], ['cls', '자산군'], ['country', '국가'], ['fx', '통화'], ['sector', '섹터']].map(([k, l]) => `<button class="chip" type="button" data-v="${k}" aria-pressed="${compBy === k}">${l}</button>`).join('')}</div>
        <div id="compBox"></div>
      </div>
      <div class="section"><div class="section-title">예상 배당금 <span class="cap" id="divYear"></span><span class="spacer"></span><div class="seg" id="taxSeg"><button type="button" data-v="1" aria-pressed="${afterTax}">세후</button><button type="button" data-v="0" aria-pressed="${!afterTax}">세전</button></div></div>
        <div class="readout" id="divReadout"></div><div class="chart short" id="divChart"></div><div id="divCal"></div></div>
      ${filter.account ? '' : `<div class="section"><div class="section-title">계좌별 한눈에 <span class="cap">눌러서 그 계좌만 보기</span><span class="spacer"></span><button class="btn small" type="button" id="addAcc">+ 계좌</button></div><div class="acct-cards" id="accCards"></div></div>`}
      <div class="section row"><button class="btn" type="button" id="toBt">이 구성으로 백테스트</button><button class="btn ghost" type="button" id="toPlan">목표·노후에 연결</button></div>
    </div>`;
  $$('#compMode button', B).forEach((b) => { b.onclick = () => { compMode = b.dataset.v; renderSummary(); }; });
  $$('#chartMode button', B).forEach((b) => { b.onclick = () => { chartMode = b.dataset.v; renderSummary(); }; });
  $$('#compBy button', B).forEach((b) => { b.onclick = () => { compBy = b.dataset.v; renderSummary(); }; });
  $$('#taxSeg button', B).forEach((b) => { b.onclick = () => { afterTax = b.dataset.v === '1'; renderSummary(); }; });
  $('#addAcc', B)?.addEventListener('click', () => openAccount(null, (a) => { filter = { owner: 'all', account: a.id }; render(); }));
  $('#editAcc', B)?.addEventListener('click', () => openAccount(H.accounts.find((a) => a.id === filter.account)));
  $('#fxBtn', B).onclick = async (e) => { const b = e.currentTarget; b.disabled = true; b.textContent = '환율 받는 중…'; const f = await refreshFx(); render(); toast(`환율 ${f.now.toLocaleString('ko-KR')}원(${fxWhen(f)})으로 다시 계산했어요.`); };
  $('#toBt', B).onclick = toBacktest;
  $('#toPlan', B).onclick = () => { location.hash = '#plan'; toast('목표·노후 탭의 ‘지금 자산과 적립’에서 ‘내 자산에서 불러오기’를 누르면 이 금액이 들어가요. 실제 기록은 자동으로 이어져요.'); };
  // 배당(계좌별로도 나누려고 합치기 전 행으로 계산)
  const dvRaw = await dividendForecast(v.rows);
  const dv = { ...dvRaw, events: mergeEvents(dvRaw.events) };
  // 계좌별 한눈에(모아보기)
  if (!filter.account) {
    const accs = v.accounts;
    $('#accCards', B).innerHTML = accs.map((a) => {
      const ar = v.rows.filter((r) => r.account === a.id);
      const tot = ar.reduce((t, r) => t + r.value, 0);
      const known = ar.filter((r) => !r.isCash && r.cost > 0), kc = known.reduce((t, r) => t + r.cost, 0), kv = known.reduce((t, r) => t + r.value, 0);
      const ret = kc ? kv / kc - 1 : null;
      const div = dvRaw.events.filter((e) => e.account === a.id).reduce((t, e) => t + e.amt * (afterTax ? 1 - (assetInfo(e.key)?.m === 'US' ? 0.15 : 0.154) : 1), 0);
      const seg2 = mergeByKey(ar).slice(0, 6);
      return `<button class="acct" type="button" data-acc="${a.id}"><div class="who">${owners().length > 1 ? `${esc(a.owner || '나')} · ` : ''}${esc(typeLabel(a.type))} · 비중 ${fmtPct(v.total ? tot / v.total : null, 0)}</div><div class="nm">${esc(alias(a))}</div><div class="amt">${m2(tot)}</div>
        <div class="pl"><span class="${dirClass(ret)}">${ret == null ? '수익률 –' : `수익률 ${fmtPct(ret, 1, true)} ${arrow(ret)}`}</span> · ${ar.filter((r) => !r.isCash).length}종목</div>
        <div class="cap">연 배당 ${money(div)}</div>
        <div class="segbar" style="height:6px;margin:8px 0 0">${seg2.map((r) => `<span style="flex:${r.value};background:${colorFor(r.key)}"></span>`).join('')}</div></button>`;
    }).join('') || '<p class="cap">아직 계좌가 없어요.</p>';
    $$('[data-acc]', B).forEach((b) => { b.onclick = () => { filter = { owner: 'all', account: b.dataset.acc }; render(); }; b.oncontextmenu = (e) => { e.preventDefault(); openAccount(H.accounts.find((a) => a.id === b.dataset.acc)); }; });
  }
  const taxOf = (key) => (assetInfo(key)?.m === 'US' ? 0.15 : 0.154);
  const tax = (amt, key) => (afterTax ? amt * (1 - taxOf(key)) : amt);
  const byMonth = Array(12).fill(0); let annual = 0;
  dv.events.forEach((e) => { const a = tax(e.amt, e.key); byMonth[e.date.getMonth()] += a; annual += a; });
  const cost = rows.filter((r) => !r.isCash).reduce((t, r) => t + (r.cost ?? r.value), 0);
  $('#divFacts', B).innerHTML = `<div class="fact"><div class="lb">연간 예상 배당금(${afterTax ? '세후' : '세전'})</div><div class="v">${money(annual)}</div><div class="cap">월평균 ${money(annual / 12)}</div></div>
    <div class="fact"><div class="lb">투자 배당률</div><div class="v">${fmtPct(cost ? annual / cost : null, 2)}</div><div class="cap">매입 원금 대비</div></div>
    <div class="fact"><div class="lb">시가 배당률</div><div class="v">${fmtPct(v.total ? annual / v.total : null, 2)}</div><div class="cap">지금 평가액 대비</div></div>`;
  $('#divYear', B).textContent = `연 ${money(annual)} · 지난 1년 배당락일 기준 예상`;
  const nowM = new Date().getMonth();
  barChart($('#divChart', B), { cats: Array.from({ length: 12 }, (_, i) => `${i + 1}월`), series: [{ name: '예상 배당금', data: byMonth, colorFn: (val, i) => (i === nowM ? css('--series-2') : css('--series-1')) }], yFmt: (x, ax) => (hide() ? '•' : ax ? fmtKRWShort(x) : fmtKRW(x)), readout: isMobile() ? $('#divReadout', B) : null, valueLabels: !isMobile() && !hide() });
  renderCalendar($('#divCal', B), dv.events, tax);
  // 구성
  renderComposition($('#compBox', B), rows, dv, tax);
  // 위험 요약(가볍게: 상한·집중만 바로, 나머지는 위험 탭)
  const s = settings();
  const over = mergeByKey(v.rows).filter((r) => !r.isCash && r.weight > (r.exp.cls === '개별주' ? s.capSingle : s.capProduct) / 100);
  const hhi = mergeByKey(v.rows).reduce((t, r) => t + r.weight * r.weight, 0);
  const missing = v.rows.filter((r) => !r.isCash && !r.inDb);
  const items = [];
  if (over.length) items.push(`<span class="status-pill caution">! 상한 초과 ${over.length}</span> ${over.map((r) => `${esc(r.name)} ${fmtPct(r.weight)}`).join(', ')}`);
  const top3 = mergeByKey(v.rows).filter((r) => !r.isCash).slice(0, 3).reduce((t, r) => t + r.weight, 0);
  if ((hhi && 1 / hhi < 5) || top3 > 0.5) items.push(`<span class="status-pill caution">! 집중</span> 상위 3개 ${fmtPct(top3, 0)} · 유효 종목 수 ${(1 / hhi).toFixed(1)}개`);
  if (missing.length) items.push(`<span class="status-pill caution">! 시세 없음</span> ${missing.map((r) => esc(r.name)).join(', ')}`);
  $('#riskLine', B).innerHTML = items.length ? `${items.join(' &nbsp; ')} <button class="btn small ghost" type="button" id="goRisk">위험 점검에서 대안 보기</button>` : `<span class="status-pill good">✓ 양호</span> <span class="cap">상한 초과·집중 경고 없음</span> <button class="btn small ghost" type="button" id="goRisk">자세히</button>`;
  $('#goRisk', B).onclick = () => { seg = 'risk'; render(); };
}

/** 같은 종목·같은 날 배당은 한 줄로(여러 계좌에 나눠 든 경우) */
function mergeEvents(events) {
  const m = new Map();
  for (const e of events) { const k = `${e.key}|${+e.date}`; const o = m.get(k); if (o) o.amt += e.amt; else m.set(k, { ...e }); }
  return [...m.values()].sort((a, b) => a.date - b.date);
}
function fxWhen(f) {
  const d = f?.date ? `${String(f.date).slice(0, 4)}.${String(f.date).slice(4, 6)}.${String(f.date).slice(6, 8)}` : '날짜 모름';
  const at = f?.at ? ` · ${new Date(f.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}에 다시 받음` : '';
  return `${d} 기준(${f?.src || '시세 DB'})${at}`;
}
function headTitle() {
  if (filter.account) {
    const a = H.accounts.find((x) => x.id === filter.account);
    return `<div class="as-title"><span class="nm">${esc(alias(a))}</span><span class="cap">${owners().length > 1 ? `${esc(a?.owner || '나')} · ` : ''}${esc(typeLabel(a?.type))}</span><button class="btn small ghost" type="button" id="editAcc">계좌 고치기 · 현금</button></div>`;
  }
  return `<div class="as-title"><span class="nm">${filter.owner === 'all' ? '모아보기' : `${esc(filter.owner)} 전체`}</span><span class="cap">${view.accounts.length}개 계좌</span></div>`;
}
function curSplit(v) {
  if (hide()) return '';
  const krw = v.byCur?.KRW || 0, usd = v.byCur?.USD || 0;
  if (!krw || !usd) return `<span class="cap">${usd ? '모두 달러 자산' : '모두 원화 자산'}</span>`;
  const pk = v.total ? krw / v.total : 0;
  return `<div class="cur-bar" aria-hidden="true"><span style="flex:${krw}"></span><span style="flex:${v.byCur.USDinKRW}"></span></div>
    <div class="cur-legend"><span><i class="k"></i>원화 자산 <b>${fmtKRW(krw)}</b> ${fmtPct(pk, 0)}</span><span><i class="u"></i>달러 자산 <b>${fmtUSD(usd)}</b> <span class="faint">(${fmtKRWShort(v.byCur.USDinKRW)})</span> ${fmtPct(1 - pk, 0)}</span></div>`;
}
function groupKey(r) {
  if (compBy === 'name') return [r.key, r.name];
  if (compBy === 'account') { const a = H.accounts.find((x) => x.id === r.account); return [r.account, accName(a)]; }
  const v = r.exp[compBy]; return [v, v];
}
function renderComposition(box, rows, dv, tax) {
  const src = compBy === 'account' ? view.rows : rows;
  const m = new Map();
  for (const r of src) {
    let val = r.value;
    if (compMode === 'div') val = dv.events.filter((e) => e.key === r.key).reduce((t, e) => t + tax(e.amt, e.key), 0) * (compBy === 'account' ? r.qty / (rows.find((x) => x.key === r.key)?.qty || r.qty) : 1);
    if (!val) continue;
    const [k, name] = groupKey(r);
    const o = m.get(k) || { k, name, value: 0, change: 0, base: 0 };
    o.value += val; o.base += r.value; o.change += r.dayChange || 0;
    m.set(k, o);
  }
  let items = [...m.values()].sort((a, b) => b.value - a.value);
  const total = items.reduce((t, x) => t + x.value, 0);
  if (!total) { box.innerHTML = `<p class="cap">${compMode === 'div' ? '배당 기록이 있는 종목이 없어요.' : '표시할 자산이 없어요.'}</p>`; return; }
  const top = items.slice(0, 8), rest = items.slice(8);
  if (rest.length) top.push({ k: '_etc', name: `기타 ${rest.length}개`, value: rest.reduce((t, x) => t + x.value, 0) });
  const cfg = settings();
  const tgtOf = (k) => { const h = H.holdings.find((x) => x.key === k && x.target); return h ? +h.target / 100 : null; };
  if (chartMode === 'map' && compMode === 'asset') {
    const groups = new Map();
    for (const r of rows) { if (r.isCash) continue; const g = r.exp.sector; if (!groups.has(g)) groups.set(g, []); groups.get(g).push({ name: r.name.length > 14 ? r.name.slice(0, 13) + '…' : r.name, value: r.value, change: r.dayPct ?? null }); }
    box.innerHTML = `<div class="chart" id="tmChart" style="height:${isMobile() ? 360 : 420}px"></div><p class="cap">크기 = 평가액, 색 = 오늘 등락(빨강 오름 · 파랑 내림).</p>`;
    treemap($('#tmChart', box), { groups: [...groups].map(([name, children]) => ({ name, children: isMobile() ? children.slice(0, 15) : children })), fmt: (x) => money(x) });
    return;
  }
  box.innerHTML = `<div style="display:grid;gap:16px;grid-template-columns:${isMobile() ? '1fr' : 'minmax(220px,280px) 1fr'};align-items:center">
    <div class="chart" id="dnChart" style="height:${isMobile() ? 220 : 260}px"></div>
    <div class="rank-bars">${top.map((x) => { const w = x.value / total; const t = compBy === 'name' ? tgtOf(x.k) : null; const flag = t != null && Math.abs(w - t) * 100 > cfg.bandAbs; return `<div class="rank-bar"><span class="nm"><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${x.k === '_etc' ? catColor(9) : colorFor(x.k)};margin-right:6px"></i>${esc(x.name)}</span><span class="tr"><i style="width:${(w / (top[0].value / total)) * 100}%;background:${x.k === '_etc' ? catColor(9) : colorFor(x.k)}"></i></span><span class="pct">${fmtPct(w)}${t != null ? `<br><span class="flag" title="목표 ${fmtPct(t)}">${flag ? '⚠ ' : ''}목표 ${fmtPct(t, 0)}</span>` : ''}</span></div>`; }).join('')}</div></div>`;
  donut($('#dnChart', box), { items: top.map((x) => ({ name: x.name, value: x.value, color: x.k === '_etc' ? catColor(9) : colorFor(x.k) })), center: hide() ? '•••' : compMode === 'div' ? fmtKRWShort(total) : showUsd ? `$${Math.round(total / view.fx.now / 1000)}K` : fmtKRWShort(total), centerSub: compMode === 'div' ? '연 배당' : '총자산', fmt: (x) => money(x) });
}

function renderCalendar(box, events, tax) {
  const now = new Date(), y = now.getFullYear(), mo = now.getMonth();
  const first = new Date(y, mo, 1).getDay(), days = new Date(y, mo + 1, 0).getDate();
  const ev = events.filter((e) => e.date.getFullYear() === y && e.date.getMonth() === mo || (e.date.getMonth() === mo));
  const byDay = {};
  ev.forEach((e) => { const d = e.date.getDate(); (byDay[d] ||= []).push(e); });
  const cells = [];
  for (let i = 0; i < first; i++) cells.push('<td></td>');
  for (let d = 1; d <= days; d++) cells.push(`<td style="vertical-align:top;height:54px;${d === now.getDate() ? 'outline:2px solid var(--accent);outline-offset:-2px;' : ''}"><div class="cap">${d}</div>${(byDay[d] || []).map((e) => `<div title="${esc(e.name)} ${hide() ? '' : fmtKRW(tax(e.amt, e.key))}" style="font-size:11px;background:var(--bg-selected);color:var(--accent);border-radius:4px;padding:1px 4px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:90px">${esc(e.name.replace(/^(KODEX|TIGER|ACE|SOL|KoAct|TIME|RISE|PLUS|HANARO|KIWOOM) /, ''))}</div>`).join('')}</td>`);
  const weeks = []; for (let i = 0; i < cells.length; i += 7) weeks.push(`<tr>${cells.slice(i, i + 7).join('')}</tr>`);
  box.innerHTML = `<div class="section-title" style="margin-top:16px">${mo + 1}월 배당 캘린더 <span class="cap">지난해 같은 달 배당락일 기준 예상</span></div>
    <div class="tbl-wrap"><table class="tbl" style="table-layout:fixed"><thead><tr>${'일월화수목금토'.split('').map((d) => `<th style="text-align:center">${d}</th>`).join('')}</tr></thead><tbody>${weeks.join('')}</tbody></table></div>`;
}

// ------------------------------------------------------------------ 종목
function renderList() {
  const B = $('#segBody', root);
  const rows = merged ? mergeByKey(view.rows) : view.rows;
  const accLbl = (r) => (merged && r.accounts?.length > 1 ? `${r.accounts.length}개 계좌` : accName(H.accounts.find((a) => a.id === r.account)));
  B.innerHTML = `<div class="surface"><div class="section"><div class="section-title">보유 종목 ${rows.filter((r) => !r.isCash).length}개<span class="spacer"></span><label class="toggle"><input type="checkbox" id="mergeT" ${merged ? 'checked' : ''}> 같은 종목 합쳐 보기</label></div>
    <div class="tbl-wrap holdings-tbl"><table class="tbl"><thead><tr><th>종목</th><th>계좌</th><th class="num">수량</th><th class="num">평균단가</th><th class="num">현재가</th><th class="num">오늘</th><th class="num">평가액</th><th class="num">손익</th><th class="num">비중</th></tr></thead><tbody>
    ${rows.map((r) => `<tr data-id="${r.id}" style="cursor:${merged && r.accounts?.length > 1 ? 'default' : 'pointer'}"><td class="name">${esc(r.name)}<span class="sub">${esc(r.isCash ? r.cur : r.key)}${!r.inDb && !r.isCash ? ' · <span class="up">시세 없음</span>' : ''}</span></td><td>${esc(accLbl(r))}</td><td class="num">${r.isCash ? '' : (+r.qty).toLocaleString('ko-KR')}</td><td class="num">${r.avg ? fmtPrice(r.avg, r.cur) : '–'}</td><td class="num">${r.isCash ? '' : fmtPrice(r.price, r.cur)}</td><td class="num ${dirClass(r.dayPct)}">${r.dayPct == null || r.isCash ? '–' : fmtPct(r.dayPct, 2, true)}</td><td class="num">${m2(r.value)}</td><td class="num ${dirClass(r.pl)}">${r.pl == null ? '–' : hide() ? '•••' : `${fmtKRW(r.pl, { plus: true })}<span class="sub">${fmtPct(r.cost ? r.pl / r.cost : null, 1, true)}</span>`}</td><td class="num">${fmtPct(r.weight)}</td></tr>`).join('')}
    </tbody></table></div>
    <div class="holdings-list">${rows.map((r) => `<div class="h" data-id="${r.id}"><b>${esc(r.name)}</b><span class="r">${m2(r.value)}</span><span class="s">${esc(accLbl(r))} · ${r.isCash ? '' : `${(+r.qty).toLocaleString('ko-KR')}주 · `}${fmtPct(r.weight)}</span><span class="s r ${dirClass(r.pl)}">${r.pl == null ? '' : fmtPct(r.cost ? r.pl / r.cost : null, 1, true)}</span></div>`).join('')}</div>
    <div class="row" style="margin-top:12px"><button class="btn small" type="button" id="csvT">CSV 템플릿</button><label class="btn small">CSV 가져오기<input type="file" accept=".csv,text/csv" id="csvIn" hidden></label><button class="btn small ghost" type="button" id="manAcc">계좌 관리</button>${H.demo ? '<button class="btn small ghost" type="button" id="clrDemo">예시 자산 지우기</button>' : ''}</div></div></div>`;
  $('#mergeT', B).onchange = (e) => { merged = e.target.checked; renderList(); };
  $$('[data-id]', B).forEach((tr) => { tr.onclick = () => { const r = rows.find((x) => x.id === tr.dataset.id); if (!r || (merged && r.accounts?.length > 1)) { if (r && merged) toast('계좌별로 고치려면 ‘같은 종목 합쳐 보기’를 끄세요.'); return; } if (r.isCash) openAccount(H.accounts.find((a) => a.id === r.account)); else openAddHolding(H.holdings.find((h) => h.id === r.id)); }; });
  $('#csvT', B).onclick = () => { const t = '소유자,계좌유형,계좌이름,종목(티커 또는 코드),수량,평균단가,통화,목표비중\n나,overseas,해외주식,NVDA,10,120,USD,15\n나,pension,연금저축,379810,100,15000,KRW,\n'; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + t], { type: 'text/csv' })); a.download = 'seoks-stock-holdings-template.csv'; a.click(); };
  $('#csvIn', B).onchange = async (e) => { const f = e.target.files[0]; if (!f) return; importCsv(await f.text()); };
  $('#manAcc', B).onclick = manageAccounts;
  $('#clrDemo', B)?.addEventListener('click', () => { H = { accounts: [], holdings: [] }; saveHoldings(H); store('ss.snapshots', []); render(); });
}
function importCsv(text) {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/).slice(1);
  let n = 0;
  for (const line of lines) {
    const [owner, type, name, sym, qty, avg, cur, tgt] = line.split(',').map((x) => x?.trim());
    if (!sym) continue;
    let acc = H.accounts.find((a) => a.owner === owner && a.name === name);
    if (!acc) { acc = { id: uid(), owner: owner || '나', type: type || 'general', name: name || typeLabel(type), cash: {} }; H.accounts.push(acc); }
    const mt = matchName(null, sym) || matchName(sym);
    H.holdings.push({ id: uid(), account: acc.id, key: mt?.k || sym.toUpperCase(), name: sym, qty: +qty || 0, avg: +avg || null, cur: cur || infoOf(mt?.k)?.cur || 'KRW', target: tgt ? +tgt : null });
    n++;
  }
  save(); render(); toast(`${n}개 종목을 가져왔어요.`);
}

// ------------------------------------------------------------------ 위험
async function renderRisk() {
  const B = $('#segBody', root);
  const cfg = settings();
  const key = JSON.stringify([filter, H.holdings.map((h) => [h.key, h.qty, h.account]), cfg.capSingle, cfg.capProduct, cfg.altStyle]);
  B.innerHTML = `<div class="surface"><div class="section"><div class="section-title">위험 점검 <span class="cap">경고마다 최근 3년으로 다시 계산한 대안을 붙여요</span></div><div class="cards" id="rCards"><p class="cap">점검 중… (종목 시세를 불러와 비교 백테스트를 돌려요)</p></div></div>
    <div class="section" id="rDetail"></div><div class="section" id="rOrders"></div></div>`;
  if (riskKey !== key || !risk) { risk = await riskCheck(view, cfg); riskKey = key; }
  if (seg !== 'risk') return;
  const fmtW = (x) => fmtPct(x, 1);
  const cardsHtml = risk.cards.filter((c) => c.id !== 'R6').map((c, i) => {
    const cmp = c.cmp;
    const dumb = cmp ? `<div class="dumb">${[['연환산 수익률', cmp.before.cagr, cmp.after.cagr], ['최대 낙폭', cmp.before.mdd, cmp.after.mdd], ['변동성', cmp.before.vol, cmp.after.vol], ['최악 위기 구간', cmp.before.stress, cmp.after.stress]].map(([n, a, b]) => { const lo = Math.min(a, b, 0), hi = Math.max(a, b, 0.0001), pos = (x) => ((x - lo) / (hi - lo || 1)) * 100; return `<span class="lb">${n}</span><span class="vals"><span>${fmtPct(a)}</span><span class="track"><i class="ln" style="left:${Math.min(pos(a), pos(b))}%;width:${Math.abs(pos(a) - pos(b))}%"></i><i class="a" style="left:${pos(a)}%"></i><i class="b" style="left:${pos(b)}%"></i></span><b>${fmtPct(b)}</b></span>`; }).join('')}</div>` : '';
    const fxd = c.fxOnly ? `<div class="dumb"><span class="lb">달러 노출</span><span class="vals"><span>${fmtPct(c.fxOnly.before, 0)}</span><span class="track"><i class="a" style="left:${c.fxOnly.before * 100}%"></i><i class="b" style="left:${c.fxOnly.after * 100}%"></i></span><b>${fmtPct(c.fxOnly.after, 0)}</b></span></div>` : '';
    const diff = c.diff?.length ? `<div class="tbl-wrap"><table class="tbl"><tbody>${c.diff.slice(0, 8).map((d) => `<tr><td>${esc(d.name)}</td><td class="num">${fmtW(d.from)} → <b>${fmtW(d.to)}</b></td><td class="num ${dirClass(d.to - d.from)}">${fmtPp(d.to - d.from)}</td></tr>`).join('')}</tbody></table></div>` : '';
    if (!cmp && !c.fxOnly) return `<div class="rcard"><span class="st info">ⓘ 참고</span><h4>${esc(c.title)}</h4><p class="why">${esc(c.why)}</p><p class="cap">대안 수치를 계산하지 못했어요(시세 기간 부족). ${esc(c.altLabel || '')}</p></div>`;
    return `<div class="rcard"><span class="st ${c.level}">${{ warning: '⚠ 경고', caution: '! 주의', info: 'ⓘ 참고' }[c.level]}</span><h4>${esc(c.title)}</h4><p class="why">${esc(c.why)}</p><div class="alt"><b>대안</b> ${esc(c.altLabel)}</div>${dumb}${fxd}${diff}
      ${cmp?.skipped?.length ? `<p class="cap">상장 3년이 안 된 ${esc(cmp.skipped.join(', '))}는 빼고 계산했어요.</p>` : ''}
      ${c.after ? `<div class="row" style="margin-top:10px"><button class="btn small" type="button" data-cmp="${i}">대안을 백테스트로 비교</button><button class="btn small ghost" type="button" data-tgt="${i}">목표 비중에 반영</button></div>` : ''}</div>`;
  }).join('');
  $('#rCards', B).innerHTML = (cardsHtml || '<div class="rcard"><span class="st good">✓ 양호</span><h4>큰 경고는 없어요</h4></div>') + '<p class="cap">대안은 같은 과거 기간으로 계산한 값이라 앞으로도 같다는 보장은 없어요. 실제 보유 수량은 앱이 바꾸지 않아요.</p>';
  const visible = risk.cards.filter((c) => c.id !== 'R6');
  $$('[data-cmp]', B).forEach((b) => { b.onclick = () => compareInBacktest(visible[+b.dataset.cmp].after); });
  $$('[data-tgt]', B).forEach((b) => { b.onclick = () => { const after = visible[+b.dataset.tgt].after; applyTargets(after); }; });
  // 세부 패널
  const st = risk.stress;
  const rows = mergeByKey(view.rows);
  const usd = risk.usd;
  $('#rDetail', B).innerHTML = `<div class="section-title">세부</div>
    <div class="facts"><div class="fact"><div class="lb">상위 1·3개 비중</div><div class="v">${fmtPct(rows[0]?.weight)} · ${fmtPct(risk.top3)}</div></div><div class="fact"><div class="lb">유효 종목 수(1/HHI)</div><div class="v">${risk.effN.toFixed(1)}개</div><div class="cap">${rows.filter((r) => !r.isCash).length}개 보유</div></div>
      <div class="fact"><div class="lb">달러 노출</div><div class="v">${fmtPct(usd, 0)}</div><div class="cap">환율 10% 하락 시 ${hide() ? '•••' : fmtKRW(-usd * 0.1 * view.total)}</div></div><div class="fact"><div class="lb">평균 상관(상위 10)</div><div class="v">${risk.avgCorr == null ? '–' : risk.avgCorr.toFixed(2)}</div></div></div>
    <div class="section-title">과거 위기 때라면 <span class="cap">지금 비중 그대로 넣어 본 손실률(원화 기준, 참고)</span></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>구간</th><th class="num">손실률</th><th class="num">${hide() ? '' : '금액(지금 자산 기준)'}</th><th>비고</th></tr></thead><tbody>${st.map((x) => `<tr><td>${esc(x.name)}<span class="sub">${x.from} ~ ${x.to}</span></td><td class="num ${dirClass(x.ret)}">${x.ret == null ? '–' : fmtPct(x.ret, 1, true)}</td><td class="num">${x.ret == null || hide() ? '' : fmtKRW(x.ret * view.total)}</td><td class="cap">${x.covered < 0.999 ? `비중 ${fmtPct(x.covered, 0)}만 계산(그때 없던 종목 제외)` : ''}${x.proxies.length ? ` 대신 계산: ${esc(x.proxies.join(', '))}` : ''}</td></tr>`).join('')}</tbody></table></div>
    <div class="section-title" style="margin-top:18px">상한 점검</div>
    <div class="rank-bars">${rows.filter((r) => !r.isCash).slice(0, 12).map((r) => { const cap = (r.exp.cls === '개별주' ? cfg.capSingle : cfg.capProduct) / 100; return `<div class="rank-bar"><span class="nm">${esc(r.name)}</span><span class="tr" style="position:relative"><i style="width:${Math.min(100, (r.weight / 0.4) * 100)}%;background:${r.weight > cap ? 'var(--st-warning)' : 'var(--series-1)'}"></i><b style="position:absolute;left:${(cap / 0.4) * 100}%;top:-2px;bottom:-2px;width:2px;background:var(--text-1)"></b></span><span class="pct">${fmtPct(r.weight)}</span></div>`; }).join('')}</div>
    <p class="cap">세로선 = 상한(개별주 ${cfg.capSingle}%, 상품 ${cfg.capProduct}%, 설정에서 변경).</p>`;
  // 리밸런싱 도우미
  const orders = rebalanceOrders(view, H, cfg.bandAbs);
  const hasT = H.holdings.some((h) => h.target != null && h.target !== '');
  $('#rOrders', B).innerHTML = `<div class="section-title">리밸런싱 도우미 <span class="cap">목표 비중 ±${cfg.bandAbs}%p를 벗어난 종목만, 계좌 안에서</span></div>
    ${!hasT ? '<p class="cap">종목 탭에서 종목을 눌러 ‘목표 비중’을 넣으면 주문 수량을 계산해요. 위 대안의 ‘목표 비중에 반영’으로도 채울 수 있어요.</p>' : !orders.length ? `<p><span class="status-pill good">✓ 모두 밴드 안</span></p>` : `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>계좌</th><th>종목</th><th class="num">지금</th><th class="num">목표</th><th class="num">주문</th></tr></thead><tbody>${orders.map((o) => `<tr><td>${esc(accName(o.account))}</td><td>${esc(o.row.name)}</td><td class="num">${fmtPct(o.w)}</td><td class="num">${fmtPct(o.t)}</td><td class="num ${o.qty > 0 ? 'up' : 'down'}"><b>${o.qty == null ? '가격 없음' : `${Math.abs(o.qty).toLocaleString('ko-KR')}주 ${o.qty > 0 ? '매수' : '매도'}`}</b></td></tr>`).join('')}</tbody></table></div>`}`;
}
function applyTargets(after) {
  const t = new Map(after.map((x) => [x.key, x.w]));
  // 계좌별로 목표 비중 = 그 종목의 전체 목표 비중을 계좌 안 비중으로 근사: 같은 종목이 한 계좌에만 있으면 정확
  for (const h of H.holdings) if (t.has(h.key)) h.target = +(t.get(h.key) * 100).toFixed(1);
  save(); risk = null; toast('목표 비중을 넣었어요. 아래 리밸런싱 도우미에서 주문 수량을 보세요.'); renderRisk();
}
function compareInBacktest(after) {
  const cur = toBacktestAssets(mergeByKey(view.rows), ymAdd(todayYm(), -37));
  const alt = toBacktestAssets(after.map((x) => ({ ...mergeByKey(view.rows).find((r) => r.key === x.key) || { key: x.key, name: x.name, inDb: !!assetInfo(x.key), exp: exposure(x.key) }, weight: x.w })), ymAdd(todayYm(), -37));
  const state = {
    period: { preset: '3y', start: null, end: null }, currency: 'KRW', initial: 10000000, flow: { type: 'none', amount: 0, freq: 'M', pct: 4, growth: 0 }, reinvest: true, feeBp: settings().feeBp ?? 10, benchmark: 'SPY',
    portfolios: [{ name: '지금 구성', kind: 'static', assets: cur.assets, rank: null, rebalance: 'A', band: { abs: 5, rel: 0 } }, { name: '대안', kind: 'static', assets: alt.assets, rank: null, rebalance: 'A', band: { abs: 5, rel: 0 } }],
  };
  sendToBacktest(state);
}
function toBacktest() {
  const cfg = settings();
  const cur = toBacktestAssets(mergeByKey(view.rows));
  if (!cur.assets.length) { toast('시세가 있는 종목이 없어요.'); return; }
  const state = {
    period: { preset: 'max', start: null, end: null }, currency: 'KRW', initial: 10000000, flow: { type: 'none', amount: 0, freq: 'M', pct: 4, growth: 0 }, reinvest: true, feeBp: cfg.feeBp ?? 10, benchmark: 'SPY',
    portfolios: [{ name: '내 포트폴리오', kind: 'static', assets: cur.assets.slice(0, 20), rank: null, rebalance: 'band', band: { abs: cfg.bandAbs, rel: 0, cap: cfg.capProduct, daily: cfg.bandDaily } }],
  };
  if (cur.skipped.length) toast(`${cur.skipped.join(', ')}은 시세가 없어 빼고 계산해요.`);
  sendToBacktest(state);
}
function sendToBacktest(state) {
  sessionStorage.setItem('ss.pendingBt', JSON.stringify(state));
  location.hash = '#backtest';
  window.dispatchEvent(new Event('bt:pending'));
}

// ------------------------------------------------------------------ 기록
function renderHistory() {
  const B = $('#segBody', root);
  const snaps = (store('ss.snapshots') || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const val = (s) => (filter.account ? s.byAccount?.[filter.account] : filter.owner !== 'all' ? s.byOwner?.[filter.owner] : s.total) || 0;
  B.innerHTML = `<div class="surface"><div class="section"><div class="section-title">총자산 추이 <span class="cap">앱을 연 날 하루 한 번 자동 기록</span><span class="spacer"></span><button class="btn small" type="button" id="snapNow">오늘 기록</button><button class="btn small ghost" type="button" id="snapAdd">지난 기록 넣기</button></div>
    ${snaps.length < 2 ? '<p class="cap">기록이 두 개 이상 쌓이면 추이 그래프가 그려져요. 예전 자산 기록이 있으면 ‘지난 기록 넣기’로 넣으세요. 목표·노후 탭의 ‘목표 vs 실제’에도 같이 찍혀요.</p>' : ''}
    <div class="readout" id="hReadout"></div><div class="chart short" id="hChart"></div>
    <div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>날짜</th><th class="num">총자산</th><th class="num">변화</th><th></th></tr></thead><tbody>${snaps.slice().reverse().slice(0, 60).map((s, i, arr) => { const prev = arr[i + 1]; const d = prev ? val(s) - val(prev) : null; return `<tr><td>${s.date}</td><td class="num">${money(val(s))}</td><td class="num ${dirClass(d)}">${d == null || hide() ? '' : fmtKRW(d, { plus: true })}</td><td><button class="x-btn" type="button" data-del="${s.date}" aria-label="기록 지우기">×</button></td></tr>`; }).join('')}</tbody></table></div></div></div>`;
  if (snaps.length >= 2) lineChart($('#hChart', B), { series: [{ name: '총자산', color: css('--series-1'), area: true, data: snaps.map((s) => [Date.parse(s.date), val(s)]) }], yFmt: (x, ax) => (hide() ? '•' : ax ? fmtKRWShort(x) : fmtKRW(x)), readout: isMobile() ? $('#hReadout', B) : null });
  $('#snapNow', B).onclick = () => { takeSnapshot(true); renderHistory(); };
  $('#snapAdd', B).onclick = () => {
    const s = sheet(`<h3>지난 기록 넣기</h3><div class="stack"><label class="field">날짜<input class="input" type="date" id="sa_d"></label><label class="field">총자산<div class="input-unit"><input class="input num" id="sa_v" inputmode="numeric" data-money="KRW"><span>원</span></div></label><p class="cap">모아보기 합계로 저장돼요.</p></div><div class="actions"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" data-ok>넣기</button></div>`);
    $('[data-close]', s.root).onclick = s.close;
    $('[data-ok]', s.root).onclick = () => { const d = $('#sa_d', s.root).value, v = +$('#sa_v', s.root).value.replace(/[^\d]/g, ''); if (!d || !v) return; const arr = store('ss.snapshots') || []; arr.push({ date: d, total: v, byOwner: {}, byAccount: {}, manual: true }); store('ss.snapshots', arr); window.dispatchEvent(new Event('snapshots:changed')); s.close(); renderHistory(); };
  };
  $$('[data-del]', B).forEach((b) => { b.onclick = () => { store('ss.snapshots', (store('ss.snapshots') || []).filter((x) => x.date !== b.dataset.del)); renderHistory(); }; });
}

// ------------------------------------------------------------------ 입력 시트
function accountOptions(sel) {
  const opts = H.accounts.map((a) => `<option value="${a.id}" ${a.id === sel ? 'selected' : ''}>${esc(accName(a))}</option>`).join('');
  return opts + `<option value="__new" ${sel === '__new' || !H.accounts.length ? 'selected' : ''}>+ 새 계좌 만들기</option>`;
}
const ownerDatalist = (id) => `<datalist id="${id}">${[...new Set(['나', '배우자', '자녀1', '자녀2', ...owners()])].map((o) => `<option>${esc(o)}</option>`).join('')}</datalist>`;
/** 별칭으로 계좌 종류 짐작(바꿀 수 있음) */
function guessType(name) {
  const n = String(name || '');
  return /연금|저축/.test(n) ? 'pension' : /isa/i.test(n) ? 'isa' : /irp/i.test(n) ? 'irp' : /dc|퇴직/i.test(n) ? 'dc' : /cma|현금/i.test(n) ? 'cma' : /해외|미국|달러|외화/.test(n) ? 'overseas' : 'other';
}
/** 다른 창 안에서 바로 새 계좌 만들기(창을 겹쳐 열지 않음) */
function newAccFields(prefix, show, defName) {
  return `<div class="grid2 new-acc" id="${prefix}_new" ${show ? '' : 'hidden'}><label class="field">새 계좌 별칭<input class="input" id="${prefix}_nname" value="${esc(defName || '')}" placeholder="예: 미국주식, 연금저축" maxlength="20"></label><label class="field">누구 계좌<input class="input" id="${prefix}_nowner" value="${esc(owners()[0] || '나')}" list="${prefix}_owners">${ownerDatalist(`${prefix}_owners`)}</label></div>`;
}
function wireAccSelect(root, sel, prefix) { sel.addEventListener('change', () => { $(`#${prefix}_new`, root).hidden = sel.value !== '__new'; if (sel.value === '__new') $(`#${prefix}_nname`, root).focus(); }); }
function createFromFields(root, prefix) {
  const name = $(`#${prefix}_nname`, root).value.trim() || `계좌 ${H.accounts.length + 1}`;
  const a = { id: uid(), owner: $(`#${prefix}_nowner`, root).value.trim() || '나', type: guessType(name), name, cash: {} };
  H.accounts.push(a);
  return a;
}
function openAccount(acc = null, onDone = null) {
  const a = acc || { id: uid(), owner: owners()[0] || '나', type: 'other', name: '', cash: {} };
  const s = sheet(`<h3>${acc ? '계좌 고치기' : '새 계좌'}</h3><div class="stack">
    <label class="field">계좌 별칭<input class="input" id="a_name" value="${esc(a.name || '')}" placeholder="예: 미국주식, 연금저축, 아이 ISA" maxlength="20"></label>
    <div class="grid2"><label class="field">누구 계좌<input class="input" id="a_owner" value="${esc(a.owner || '나')}" list="ownerList">${ownerDatalist('ownerList')}</label>
    <label class="field">종류(선택)<select class="input" id="a_type">${ACCOUNT_TYPES.map(([k, l]) => `<option value="${k}" ${a.type === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="grid2"><label class="field">원화 현금(예수금)<div class="input-unit"><input class="input num" id="a_krw" value="${a.cash?.KRW || ''}" inputmode="numeric" data-money="KRW"><span>원</span></div></label><label class="field">달러 현금<div class="input-unit"><input class="input num" id="a_usd" value="${a.cash?.USD || ''}" inputmode="decimal" data-money="USD"><span>$</span></div></label></div>
    <p class="cap">증권사 이름은 없어도 돼요. 별칭만 있으면 구분돼요. 누구 계좌를 다르게 넣으면 모아보기에서 사람별로도 볼 수 있어요.</p>
  </div><div class="actions">${acc ? '<button class="btn ghost" type="button" data-del>계좌 삭제</button>' : ''}<button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" data-ok>저장</button></div>`);
  const nm = $('#a_name', s.root);
  if (!acc) nm.addEventListener('input', () => { $('#a_type', s.root).value = guessType(nm.value); });
  $('[data-close]', s.root).onclick = s.close;
  $('[data-del]', s.root)?.addEventListener('click', () => { if (!confirm('이 계좌와 안의 종목을 모두 지울까요?')) return; H.accounts = H.accounts.filter((x) => x.id !== a.id); H.holdings = H.holdings.filter((h) => h.account !== a.id); save(); s.close(); filter = { owner: 'all', account: null }; render(); });
  $('[data-ok]', s.root).onclick = () => {
    const type = $('#a_type', s.root).value;
    Object.assign(a, { owner: $('#a_owner', s.root).value.trim() || '나', type, name: nm.value.trim() || (type !== 'other' ? typeLabel(type) : `계좌 ${H.accounts.length + (acc ? 0 : 1)}`), cash: { KRW: +$('#a_krw', s.root).value.replace(/[^\d.]/g, '') || 0, USD: +$('#a_usd', s.root).value.replace(/[^\d.]/g, '') || 0 } });
    if (!acc) H.accounts.push(a);
    delete H.demo; save(); s.close(); onDone ? onDone(a) : render();
  };
}
function manageAccounts() {
  const s = sheet(`<h3>계좌 관리</h3><div class="stack">${H.accounts.map((a) => `<button class="acct" type="button" data-a="${a.id}"><div class="who">${esc(a.owner || '나')} · ${esc(typeLabel(a.type))}</div><div class="nm">${esc(alias(a))}</div></button>`).join('')}<button class="btn" type="button" id="ma_new">+ 새 계좌</button></div><div class="actions"><button class="btn" type="button" data-close>닫기</button></div>`);
  $('[data-close]', s.root).onclick = s.close;
  $$('[data-a]', s.root).forEach((b) => { b.onclick = () => { s.close(); openAccount(H.accounts.find((a) => a.id === b.dataset.a)); }; });
  $('#ma_new', s.root).onclick = () => { s.close(); openAccount(); };
}
function openAddHolding(hold = null) {
  const h = hold || { id: uid(), account: filter.account || H.accounts[0]?.id || '__new', key: '', qty: 0, avg: null, cur: 'KRW', target: null };
  const it = h.key ? infoOf(h.key) : null;
  const s = sheet(`<h3>${hold ? '종목 고치기' : '종목 추가'}</h3><div class="stack">
    <label class="field">계좌<select class="input" id="h_acc">${accountOptions(h.account)}</select></label>
    ${newAccFields('h', h.account === '__new' || !H.accounts.length, H.accounts.length ? '' : '내 계좌')}
    <label class="field">종목<div class="search"><input class="input" id="h_search" placeholder="이름·티커·코드(예: 엔비디아, QQQM, 390390)" autocomplete="off" value="${esc(it?.n || h.name || '')}"><ul class="search-list" hidden></ul></div></label>
    <p class="cap" id="h_pick">${h.key ? `${esc(h.key)} · ${it ? kindLabel(it) : 'DB에 없음'}${it?.p || it?.price ? ` · 최근 ${fmtPrice(it.p || it.price, it.cur)}` : ''}` : '검색해서 고르세요. DB에 없는 국내 종목도 이름이 있으면 시세가 잡혀요.'}</p>
    <div class="grid2"><label class="field">수량<input class="input num" id="h_qty" inputmode="decimal" value="${h.qty || ''}"></label><label class="field">평균단가(선택)<div class="input-unit"><input class="input num" id="h_avg" inputmode="decimal" value="${h.avg || ''}"><span id="h_cur">${h.cur === 'USD' ? '$' : '원'}</span></div></label></div>
    <div class="grid2"><label class="field">목표 비중(선택, 계좌 안)<div class="input-unit"><input class="input num" id="h_tgt" inputmode="decimal" value="${h.target ?? ''}"><span>%</span></div></label><label class="field">수동 가격(시세 없을 때)<input class="input num" id="h_mp" inputmode="decimal" value="${h.manualPrice || ''}"></label></div>
  </div><div class="actions">${hold ? '<button class="btn ghost" type="button" data-del>삭제</button>' : ''}<button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" data-ok>저장</button></div>`);
  const inp = $('#h_search', s.root), list = $('.search-list', s.root);
  inp.addEventListener('input', () => {
    const q = inp.value.trim(); if (!q) { list.hidden = true; return; }
    const res = searchAssets(q, 8).map((x) => ({ k: x.k, n: x.n, t: kindLabel(x) }));
    // DB 밖 국내 종목
    import('../core/holdings.js').then(() => {});
    list.innerHTML = res.map((x) => `<li data-k="${esc(x.k)}">${esc(x.n)} <span class="faint">${esc(x.k)}</span><span class="t">${esc(x.t)}</span></li>`).join('') + (/^[A-Za-z]{1,5}$|^\d{6}$/.test(q) && !res.some((x) => x.k === q.toUpperCase()) ? `<li data-req="${esc(q.toUpperCase())}">‘${esc(q.toUpperCase())}’ DB에 없음 · 추가 요청</li>` : '') + (() => { const m = matchName(q); return m?.krOnly ? `<li data-k="${m.k}">${esc(infoOf(m.k).n)} <span class="faint">${m.k}</span><span class="t">국내(시세만)</span></li>` : ''; })();
    list.hidden = false;
    $$('li[data-k]', list).forEach((li) => { li.onmousedown = (e) => { e.preventDefault(); h.key = li.dataset.k; const i2 = infoOf(h.key); h.cur = i2?.cur || 'KRW'; inp.value = i2?.n || h.key; $('#h_cur', s.root).textContent = h.cur === 'USD' ? '$' : '원'; $('#h_pick', s.root).textContent = `${h.key} · ${i2 ? kindLabel(i2) : ''}${i2?.p || i2?.price ? ` · 최근 ${fmtPrice(i2.p || i2.price, h.cur)}` : ''}`; list.hidden = true; }; });
    $('li[data-req]', list)?.addEventListener('mousedown', (e) => { e.preventDefault(); requestTicker(e.currentTarget.dataset.req); });
  });
  wireAccSelect(s.root, $('#h_acc', s.root), 'h');
  $('[data-close]', s.root).onclick = s.close;
  $('[data-del]', s.root)?.addEventListener('click', () => { H.holdings = H.holdings.filter((x) => x.id !== h.id); save(); s.close(); render(); });
  $('[data-ok]', s.root).onclick = () => {
    if (!h.key) { toast('종목을 검색해서 골라 주세요.'); return; }
    let accId = $('#h_acc', s.root).value;
    if (accId === '__new') accId = createFromFields(s.root, 'h').id;
    Object.assign(h, { account: accId, qty: +$('#h_qty', s.root).value || 0, avg: +$('#h_avg', s.root).value || null, target: $('#h_tgt', s.root).value === '' ? null : +$('#h_tgt', s.root).value, manualPrice: +$('#h_mp', s.root).value || null });
    if (!hold) H.holdings.push(h);
    delete H.demo; save(); s.close();
    if (!hold) filter = { owner: 'all', account: accId };
    render();
  };
}

// ------------------------------------------------------------------ 캡처 인식
function openCapture() {
  const withKey = hasKey();
  const s = sheet(`<h3>계좌 캡처로 불러오기</h3>
    <div class="dropzone" id="dz"><b>여기에 캡처를 놓거나 눌러서 고르세요</b><br><span class="cap">여러 장 가능(같은 계좌의 이어진 화면) · PNG/JPG</span><input type="file" id="dzIn" accept="image/*" multiple hidden></div>
    <p class="cap" style="margin-top:10px">${withKey ? '이 이미지를 Anthropic API로 보내 인식해요. 내 키로 직접 보내며 이 앱의 서버는 없어요.' : '이미지는 이 기기 안에서만 읽어요. 밖으로 보내지 않아요. (설정에 Claude API 키를 넣으면 훨씬 정확하게 읽어요.)'}</p>
    <div id="capStatus"></div><div class="actions"><button class="btn" type="button" data-close>닫기</button></div>`, { wide: true });
  $('[data-close]', s.root).onclick = s.close;
  const dz = $('#dz', s.root), inp = $('#dzIn', s.root);
  dz.onclick = () => inp.click();
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('over'); handle([...e.dataTransfer.files]); };
  inp.onchange = () => handle([...inp.files]);
  const status = $('#capStatus', s.root);
  async function handle(files) {
    files = files.filter((f) => f.type.startsWith('image/')).slice(0, 10);
    if (!files.length) return;
    status.innerHTML = `<p>읽는 중… <span class="cap">${withKey ? 'Claude가 표를 읽고 있어요' : '이미지 준비 → 글자 읽기 → 표로 정리(처음엔 한국어 글자 데이터를 받느라 30초쯤 걸려요)'}</span></p><div class="progress"><i style="width:15%"></i></div>`;
    try {
      let parsed;
      if (withKey) {
        const images = await Promise.all(files.map(fileToB64));
        parsed = await aiReadHoldings(images);
      } else {
        parsed = await ocrParse(files, (p) => { const b = $('.progress i', status); if (b) b.style.width = `${Math.round(15 + p * 80)}%`; });
      }
      s.close();
      openConfirm(parsed);
    } catch (e) {
      console.error(e);
      status.innerHTML = `<p class="sentence-note">⚠ ${esc(e.message || '읽지 못했어요')}. <button class="btn small" type="button" id="toManual">직접 입력으로</button></p>`;
      $('#toManual', status).onclick = () => { s.close(); openAddHolding(); };
    }
  }
}
function fileToB64(f) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = img.width * scale; c.height = img.height * scale;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      res({ type: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.9).split(',')[1] });
    };
    img.onerror = rej; img.src = URL.createObjectURL(f);
  });
}
async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  await new Promise((res, rej) => { const sc = document.createElement('script'); sc.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'; sc.onload = res; sc.onerror = () => rej(new Error('글자 인식 도구를 불러오지 못했어요')); document.head.appendChild(sc); });
  return window.Tesseract;
}
/** 키 없는 경로: Tesseract로 글자 → 줄 단위 규칙 파싱 */
async function ocrParse(files, onP) {
  const T = await loadTesseract();
  let text = '';
  for (let i = 0; i < files.length; i++) {
    const url = await preprocess(files[i]);
    const r = await T.recognize(url, 'kor+eng', { logger: (m) => { if (m.status === 'recognizing text') onP((i + m.progress) / files.length); } });
    text += '\n' + r.data.text;
  }
  return parseOcrText(text);
}
async function preprocess(f) {
  const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(f); });
  const c = document.createElement('canvas'); const k = img.width < 1400 ? 2 : 1; c.width = img.width * k; c.height = img.height * k;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, c.width, c.height);
  const d = g.getImageData(0, 0, c.width, c.height); let sum = 0;
  for (let i = 0; i < d.data.length; i += 4) sum += d.data[i] + d.data[i + 1] + d.data[i + 2];
  if (sum / (d.data.length / 4) / 3 < 110) { for (let i = 0; i < d.data.length; i += 4) { d.data[i] = 255 - d.data[i]; d.data[i + 1] = 255 - d.data[i + 1]; d.data[i + 2] = 255 - d.data[i + 2]; } g.putImageData(d, 0, 0); }
  return c.toDataURL('image/png');
}
export function parseOcrText(text) {
  const out = { holdings: [], cash: [], total: null };
  const numRe = /[-+]?[₩$]?\d[\d,]*(?:\.\d+)?%?/g;
  for (let line of text.split(/\n/)) {
    line = line.trim(); if (!line) continue;
    if (/\d{3,}-\d{2,}-\d{3,}/.test(line)) continue; // 계좌번호처럼 보이는 줄
    const nums = (line.match(numRe) || []).map((t) => ({ t, v: parseFloat(t.replace(/[₩$,%+]/g, '')), pct: t.endsWith('%'), cur: t.includes('$') ? 'USD' : t.includes('₩') ? 'KRW' : null })).filter((x) => isFinite(x.v));
    const name = line.replace(numRe, ' ').replace(/[|·•:]/g, ' ').replace(/\s+/g, ' ').trim();
    if (/총\s*자산|평가\s*금액\s*합계|총\s*평가/.test(line) && nums.length) { out.total = Math.max(...nums.map((x) => x.v)); continue; }
    if (!name || name.length < 2 || !nums.length) continue;
    if (/^(KRW|원화|예수금|현금)$/.test(name)) { const p = nums.find((x) => x.pct); if (p) out.holdings.push({ name: 'KRW', weightPct: p.v, isCash: true }); continue; }
    const mt = matchName(name);
    if (!mt) continue;
    const pct = nums.find((x) => x.pct);
    const plain = nums.filter((x) => !x.pct);
    const ints = plain.filter((x) => Number.isInteger(x.v) && x.v > 0 && x.v < 1e6 && !x.t.includes(','));
    const big = plain.length ? plain.reduce((a, b) => (b.v > a.v ? b : a)) : null;
    out.holdings.push({ name, ticker: mt.k, quantity: ints[0]?.v ?? null, value: big && big.v >= 1000 ? big.v : null, weightPct: pct?.v ?? null, currency: big?.cur || null, confidence: mt.score });
  }
  return out;
}
export function openConfirm(parsed) {
  const fx = fxNow();
  const total = parsed.total || null;
  const rows = (parsed.holdings || []).filter((x) => x.name || x.ticker).map((x) => {
    const mt = x.isCash ? null : matchName(x.name, x.ticker);
    const it = mt ? infoOf(mt.k) : null;
    const cur = x.currency || it?.cur || 'KRW';
    const price = it?.p || it?.price || x.price || null;
    let qty = x.quantity ?? null, value = x.value ?? null;
    if (!value && x.weightPct != null && total) value = total * x.weightPct / 100;
    const valKRW = value != null ? (cur === 'USD' && (parsed.account?.currency === 'USD' || x.currency === 'USD') ? value * fx.now : value) : null;
    if (qty == null && valKRW && price) qty = +(valKRW / (price * (it?.cur === 'USD' ? fx.now : 1))).toFixed(it?.cur === 'USD' ? 4 : 0);
    let check = 'ok';
    if (!mt || mt.score < 0.8) check = 'low';
    if (qty != null && price && x.value) { const est = qty * price * (it?.cur === 'USD' ? (cur === 'USD' ? 1 : fx.now) : 1); if (Math.abs(est / x.value - 1) > 0.05) check = 'low'; }
    if (qty == null) check = 'low';
    // 평균단가가 안 보이고 수익률만 보이면 '지금 가격 ÷ (1 + 수익률)'로 추정(고칠 수 있음)
    const pNow = x.price || price;
    const avgEst = !x.avgPrice && x.returnPct != null && pNow && x.returnPct > -99 ? pNow / (1 + x.returnPct / 100) : null;
    const avg = x.avgPrice || (avgEst ? +(avgEst.toFixed((it?.cur || cur) === 'USD' ? 2 : 0)) : null);
    return { use: true, raw: x.name, key: mt?.k || '', name: it?.n || x.name, qty, avg, avgEst: !!avgEst, value: x.value, cur: it?.cur || cur, check, isCash: x.isCash, pct: x.weightPct };
  });
  const cashIn = { KRW: 0, USD: 0 };
  for (const c of parsed.cash || []) if (c?.amount > 0 && (c.currency === 'USD' || c.currency === 'KRW')) cashIn[c.currency] += +c.amount;
  // 넣을 계좌: 화면의 계좌 이름과 같은 별칭이 있으면 그것, 지금 보는 계좌, 없으면 새 계좌
  const pName = (parsed.account?.name || '').trim();
  const sameName = pName && H.accounts.find((a) => (a.name || '').replace(/\s/g, '') === pName.replace(/\s/g, ''));
  // 화면에 다른 계좌 이름이 보이면 지금 보는 계좌가 아니라 새 계좌가 기본(엉뚱한 계좌를 덮어쓰지 않게)
  const defAcc = sameName?.id || (pName ? '__new' : filter.account || H.accounts[0]?.id || '__new');
  const defName = pName || (parsed.account?.broker ? `${parsed.account.broker} 계좌` : H.accounts.length ? '' : '내 계좌');
  const lowN = rows.filter((r) => r.check === 'low').length;
  const s = sheet(`<h3>읽은 내용 확인</h3><p class="cap">${rows.length}줄 인식 · 확인이 필요한 칸 ${lowN}개(노란 칸). 매칭 종목과 수량을 확인한 뒤 반영하세요.${total ? ` 화면 총자산 ${fmtKRW(total)}.` : ''}</p>
    <div class="grid2"><label class="field">넣을 계좌<select class="input" id="c_acc">${accountOptions(defAcc)}</select></label>
    <div class="field">반영 방식<div class="seg" id="c_mode"><button type="button" data-v="replace" aria-pressed="true">이 계좌를 이 내용으로 교체</button><button type="button" data-v="add" aria-pressed="false">기존에 더하기</button></div></div></div>
    ${newAccFields('c', defAcc === '__new', defName)}
    ${cashIn.KRW || cashIn.USD ? `<label class="toggle" style="margin-top:8px"><input type="checkbox" id="c_cash" checked> 현금도 반영: ${[cashIn.KRW ? `원화 ${fmtKRW(cashIn.KRW)}` : '', cashIn.USD ? `달러 ${fmtUSD(cashIn.USD, { cents: true })}` : ''].filter(Boolean).join(' · ')}</label>` : ''}
    <div class="tbl-wrap" style="margin-top:12px"><table class="tbl ocr-tbl"><thead><tr><th></th><th>읽은 이름</th><th>매칭 종목</th><th class="num">수량</th><th class="num">평균단가</th><th class="num">평가액(읽은 값)</th></tr></thead><tbody>
    ${rows.map((r, i) => `<tr><td><input type="checkbox" data-use="${i}" ${r.use ? 'checked' : ''}></td><td class="cap">${esc(r.raw)}${r.pct != null ? ` · ${r.pct}%` : ''}</td><td class="${!r.key && !r.isCash ? 'low' : ''}">${r.isCash ? '현금' : `<input class="input" data-key="${i}" value="${esc(r.key)}" style="width:110px" aria-label="종목 코드"> <span class="cap" data-kn="${i}">${esc(r.name)}</span>`}</td><td class="num ${r.check === 'low' ? 'low' : ''}"><input class="input num" data-qty="${i}" value="${r.qty ?? ''}" style="width:96px" aria-label="수량">${r.check === 'low' ? ' <span title="확인 필요">⚠</span>' : ''}</td><td class="num"><input class="input num" data-avg="${i}" value="${r.avg ?? ''}" style="width:96px"${r.avgEst ? ' title="화면의 수익률로 계산한 값이에요"' : ''}>${r.avgEst ? ' <span class="cap" title="화면의 수익률로 계산">≈</span>' : ''}</td><td class="num">${r.value != null ? r.value.toLocaleString('ko-KR') : '–'}</td></tr>`).join('')}</tbody></table></div>
    ${lowN ? `<p class="sentence-note">⚠ 노란 칸 ${lowN}개를 아직 확인하지 않았어요. 그대로 반영할 수도 있어요.</p>` : ''}
    <div class="actions"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" data-ok>확인한 줄 반영</button></div>`, { wide: true });
  $$('#c_mode button', s.root).forEach((b) => { b.onclick = () => $$('#c_mode button', s.root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
  $$('[data-key]', s.root).forEach((x) => x.addEventListener('change', () => { const i = +x.dataset.key; const m = matchName(null, x.value) || matchName(x.value); rows[i].key = m?.k || x.value.toUpperCase(); const it = infoOf(rows[i].key); rows[i].cur = it?.cur || rows[i].cur; $(`[data-kn="${i}"]`, s.root).textContent = it?.n || '목록에 없음 · 시세 없이 저장'; }));
  wireAccSelect(s.root, $('#c_acc', s.root), 'c');
  $('[data-close]', s.root).onclick = s.close;
  $('[data-ok]', s.root).onclick = () => {
    const prev = structuredClone(H);
    let accId = $('#c_acc', s.root).value;
    if (accId === '__new') accId = createFromFields(s.root, 'c').id;
    const mode = $('#c_mode button[aria-pressed="true"]', s.root).dataset.v;
    const acc = H.accounts.find((a) => a.id === accId);
    if ($('#c_cash', s.root)?.checked && acc) {
      const c0 = acc.cash || {};
      // 교체: 캡처에 보인 통화만 바꿈 / 더하기: 더함
      acc.cash = mode === 'replace' ? { KRW: cashIn.KRW || c0.KRW || 0, USD: cashIn.USD || c0.USD || 0 } : { KRW: (c0.KRW || 0) + cashIn.KRW, USD: (c0.USD || 0) + cashIn.USD };
    }
    if (mode === 'replace') H.holdings = H.holdings.filter((h) => h.account !== accId);
    let n = 0;
    rows.forEach((r, i) => {
      if (!$(`[data-use="${i}"]`, s.root).checked || r.isCash) return;
      const qty = +$(`[data-qty="${i}"]`, s.root).value || 0; if (!qty) return;
      const avg = +$(`[data-avg="${i}"]`, s.root).value || null;
      const ex = H.holdings.find((h) => h.account === accId && h.key === r.key);
      if (ex && mode === 'add') ex.qty += qty; else H.holdings.push({ id: uid(), account: accId, key: r.key, name: r.raw, qty, avg, cur: r.cur });
      n++;
    });
    delete H.demo; save(); s.close();
    filter = { owner: 'all', account: accId }; seg = 'summary'; render();
    toast(`‘${alias(acc)}’에 ${n}줄을 반영했어요.`, { label: '되돌리기', fn: () => { H = prev; saveHoldings(H); filter = { owner: 'all', account: null }; render(); } });
  };
}
void el; void fmtUSD; void ymToIso;
