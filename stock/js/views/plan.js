// 탭2 목표·노후 설계 — 여러 계획, 구간별 수익률, 오늘 가치/그때 가치, 목표 vs 실제
import { $, $$, el, store, toast, sheet, debounce, popover } from '../ui/dom.js';
import { fmtKRW, fmtKRWShort, fmtPct, esc, krRead } from '../ui/format.js';
import { moneyHints } from '../ui/dom.js';
import { lineChart, css, isMobile } from '../ui/charts.js';
import { computePlan } from '../core/plan.js';

const PENSION_KINDS = [['national', '국민연금'], ['civil', '공무원연금'], ['teacher', '사학연금'], ['military', '군인연금'], ['retire', '퇴직연금·IRP'], ['personal', '개인연금'], ['other', '기타']];
const PRESETS = [
  ['일정하게 5%', (n) => [{ from: 1, to: null, rate: 5 }]],
  ['3% → 5% → 10%', (n) => (n >= 10 ? [{ from: 1, to: 5, rate: 3 }, { from: 6, to: 8, rate: 5 }, { from: 9, to: null, rate: 10 }] : [{ from: 1, to: null, rate: 5 }])],
  ['갈수록 낮게 7 → 5 → 3%', (n) => (n >= 6 ? [{ from: 1, to: Math.floor(n / 3), rate: 7 }, { from: Math.floor(n / 3) + 1, to: Math.floor((2 * n) / 3), rate: 5 }, { from: Math.floor((2 * n) / 3) + 1, to: null, rate: 3 }] : [{ from: 1, to: null, rate: 5 }])],
];

function newPlan(name = '내 노후 계획', mode = 'retire') {
  return {
    id: `p${Date.now().toString(36)}`, name, mode, startedAt: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(),
    age: 45, retireAge: 60, endAge: 90, inflation: 2.5,
    initial: 100000000, monthly: 1500000, monthlyGrowth: 0, saveUntilAge: null,
    accSegs: [{ from: 1, to: 5, rate: 3 }, { from: 6, to: 8, rate: 5 }, { from: 9, to: null, rate: 7 }],
    decSegs: [{ from: 1, to: null, rate: 4 }],
    expenseToday: 3500000,
    pensions: [{ kind: 'civil', monthly: 2500000, startAge: 65, indexed: true, years: null }],
    events: [],
    goalAmount: 1000000000, goalYears: 20, goalBasis: 'nominal', legacy: 0,
    track: { owner: 'all' }, actuals: [], showToday: false, example: true,
  };
}

let P = null; // {active, list}
let root = null, plan = null, res = null, selSeg = { phase: 'acc', i: 0 }, altPreview = null;

export function initPlan(container) {
  root = container;
  P = store('ss.plans') || { active: 0, list: [newPlan()] };
  if (!P.list.length) P.list = [newPlan()];
  render();
  window.addEventListener('plan:set-rate', (e) => {
    plan = P.list[P.active];
    plan.accSegs = [{ from: 1, to: null, rate: +e.detail.rate.toFixed(2) }];
    plan.example = false;
    save(); render();
    toast(`적립기 수익률을 연 ${e.detail.rate.toFixed(1)}%로 바꿨어요(${e.detail.source}).`);
  });
  window.addEventListener('snapshots:changed', () => { if (root.isConnected) compute(); });
}
function save() { store('ss.plans', P); scheduleHistory(); if (plan && !plan.example) $('#clearEx', root)?.closest('.stale-bar')?.remove(); }

// ------------------------------------------------------------------ 계획 기록(계획마다 최근 5회): 값을 바꾸고 3초 쉬면 한 번 남김
const MAX_PH = 5;
let phTimer = null;
const INPUT_KEYS = ['mode', 'age', 'retireAge', 'endAge', 'inflation', 'initial', 'monthly', 'monthlyGrowth', 'saveUntilAge', 'accSegs', 'decSegs', 'expenseToday', 'pensions', 'events', 'goalAmount', 'goalYears', 'goalBasis', 'legacy'];
function snapOf(p) { const o = {}; INPUT_KEYS.forEach((k) => { o[k] = structuredClone(p[k]); }); return o; }
function phAll() { return store('ss.planHistory') || {}; }
function scheduleHistory() {
  clearTimeout(phTimer);
  phTimer = setTimeout(() => {
    if (!plan || plan.example || !res) return;
    const all = phAll(); const list = all[plan.id] || [];
    const snap = snapOf(plan), sig = JSON.stringify(snap);
    if (list[0]?.sig === sig) return;
    const sum = plan.mode === 'goal' ? `${plan.goalYears}년 뒤 ${fmtKRWShort(plan.goalAmount)} 목표 · 월 ${fmtKRWShort(plan.monthly)} · ${res.gap < 0 ? '부족' : '여유'} ${fmtKRWShort(Math.abs(res.gap))}` : `${plan.retireAge}세 은퇴 · 생활비 월 ${fmtKRWShort(plan.expenseToday)} · 적립 월 ${fmtKRWShort(plan.monthly)} · ${res.gap < 0 ? '부족' : '여유'} ${fmtKRWShort(Math.abs(res.gap))}`;
    list.unshift({ at: Date.now(), sig, snap, sum, ok: res.gap >= 0 });
    all[plan.id] = list.slice(0, MAX_PH);
    store('ss.planHistory', all);
    renderHistoryChips();
  }, 3000);
}
function renderHistoryChips() {
  const box = $('#planHist', root);
  if (!box) return;
  const list = (phAll()[plan.id] || []);
  if (!list.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<span class="ph-title">최근 기록</span>${list.map((h, i) => `<button class="ph-chip ${h.ok ? 'ok' : 'short'}" type="button" data-ph="${i}" title="이 값으로 되돌리기"><small>${esc(new Date(h.at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</small>${esc(h.sum)}</button>`).join('')}`;
  $$('[data-ph]', box).forEach((b) => { b.onclick = () => {
    const h = list[+b.dataset.ph]; const before = snapOf(plan);
    Object.assign(plan, structuredClone(h.snap)); plan.example = false; store('ss.plans', P); render();
    toast('그때 값으로 되돌렸어요.', { label: '취소', fn: () => { Object.assign(plan, before); store('ss.plans', P); render(); } });
  }; });
}

function render() {
  plan = P.list[P.active];
  root.innerHTML = `
    <div class="row" style="margin-bottom:12px;justify-content:space-between">
      <div class="chips scroll" id="planTabs">${P.list.map((p, i) => `<button class="chip" type="button" data-i="${i}" aria-pressed="${i === P.active}">${esc(p.name)}</button>`).join('')}<button class="chip" type="button" id="newPlan">+ 새 계획</button></div>
      <div class="row"><button class="btn small ghost" type="button" id="renPlan">이름 바꾸기</button>${P.list.length > 1 ? '<button class="btn small ghost" type="button" id="delPlan">삭제</button>' : ''}</div>
    </div>
    <div class="ph-strip" id="planHist"></div>
    ${plan.example ? `<div class="stale-bar" style="border-radius:12px;margin-bottom:12px">예시 값이에요. 내 나이와 생활비로 바꿔 보세요. <button class="btn small" type="button" id="clearEx">알겠어요</button></div>` : ''}
    <div class="plan-layout">
      <aside class="surface plan-input" id="planInput"></aside>
      <div class="surface result" id="planResult"></div>
    </div>`;
  $$('#planTabs [data-i]', root).forEach((b) => { b.onclick = () => { P.active = +b.dataset.i; save(); render(); }; });
  $('#newPlan', root).onclick = () => {
    const s = sheet(`<h3>새 계획</h3><div class="stack"><label class="field">이름<input class="input" id="np_name" value="새 계획 ${P.list.length + 1}"></label><div class="field">종류<div class="seg" id="np_mode"><button type="button" data-v="goal" aria-pressed="true">목표 금액 모으기</button><button type="button" data-v="retire" aria-pressed="false">노후 자금</button></div></div><label class="toggle"><input type="checkbox" id="np_copy" checked> 지금 계획의 나이·자산·수익률 가져오기</label></div><div class="actions"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" data-ok>만들기</button></div>`);
    $$('#np_mode button', s.root).forEach((b) => { b.onclick = () => $$('#np_mode button', s.root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
    $('[data-close]', s.root).onclick = s.close;
    $('[data-ok]', s.root).onclick = () => {
      const mode = $('#np_mode button[aria-pressed="true"]', s.root).dataset.v;
      const n = newPlan($('#np_name', s.root).value || '새 계획', mode);
      if ($('#np_copy', s.root).checked) Object.assign(n, { age: plan.age, initial: plan.initial, monthly: plan.monthly, accSegs: structuredClone(plan.accSegs), inflation: plan.inflation, example: false });
      if (mode === 'goal') { n.accSegs = [{ from: 1, to: null, rate: 7 }]; n.example = false; }
      P.list.push(n); P.active = P.list.length - 1; save(); render(); s.close();
    };
  };
  $('#renPlan', root).onclick = () => { const v = prompt('계획 이름', plan.name); if (v) { plan.name = v; save(); render(); } };
  $('#delPlan', root)?.addEventListener('click', () => { if (confirm(`'${plan.name}' 계획을 지울까요?`)) { const removed = P.list.splice(P.active, 1)[0]; P.active = 0; save(); render(); toast('계획을 지웠어요.', { label: '되돌리기', fn: () => { P.list.push(removed); save(); render(); } }); } });
  $('#clearEx', root)?.addEventListener('click', () => { plan.example = false; save(); render(); });
  renderInput();
  compute();
  renderHistoryChips();
}

// ------------------------------------------------------------------ 입력
function thenYear() { const y = plan.mode === 'goal' ? +plan.goalYears : plan.retireAge - plan.age; return new Date().getFullYear() + Math.max(0, Math.round(y)); }
const MONEY_KEYS = new Set(['goalAmount', 'expenseToday', 'initial', 'monthly', 'legacy']);
const num = (id, v, unit, attrs = '') => `<div class="input-unit"><input class="input num" data-k="${id}" inputmode="decimal" value="${v ?? ''}" ${MONEY_KEYS.has(id) ? 'data-money="KRW"' : ''} ${attrs}><span>${unit}</span></div>`;
let openSteps = null; // 다시 그려도 펼친 단계 유지(목돈 추가 버튼이 '안 눌리는' 것처럼 보이던 원인)
const won = (v) => (v == null ? '' : Number(v).toLocaleString('ko-KR'));
function renderInput() {
  const p = plan, g = p.mode === 'goal';
  const box = $('#planInput', root);
  if (box.querySelector('details.step')) openSteps = new Set($$('details.step', box).filter((d) => d.open).map((d) => d.dataset.step));
  box.innerHTML = `
    <div class="seg mode-switch" id="pMode"><button type="button" data-v="goal" aria-pressed="${g}">목표 금액 모으기</button><button type="button" data-v="retire" aria-pressed="${!g}">노후 자금</button></div>
    <div class="field basis-switch"><span class="lb">숫자를 어떤 돈으로 볼까요? <button class="help" type="button" id="basisHelp">?</button></span><div class="seg" id="pBasis"><button type="button" data-v="0" aria-pressed="${!p.showToday}">${thenYear()}년 통장 숫자</button><button type="button" data-v="1" aria-pressed="${!!p.showToday}">오늘 돈 가치</button></div></div>
    <details class="step" data-step="me" open><summary><span class="n">1</span>${g ? '얼마를, 몇 년 뒤에?' : '나는 몇 살?'}<span class="sum">${g ? `${p.goalYears}년 뒤 ${fmtKRWShort(p.goalAmount)}` : `${p.age}세 · ${p.retireAge}세 은퇴 · ${p.endAge}세까지`}</span></summary><div class="stack">
      ${g ? `<div class="grid2"><label class="field">목표 금액${num('goalAmount', won(p.goalAmount), '원')}</label><label class="field">기간${num('goalYears', p.goalYears, '년')}</label></div>
        <div class="field">목표 금액 기준<div class="seg" id="gBasis"><button type="button" data-v="nominal" aria-pressed="${p.goalBasis !== 'today'}">그때 금액 그대로</button><button type="button" data-v="today" aria-pressed="${p.goalBasis === 'today'}">오늘 돈 가치로</button></div><p class="cap">‘오늘 돈 가치로’를 고르면 물가만큼 목표를 키워서 계산해요(지금 10억의 구매력).</p></div>`
      : `<div class="grid3"><label class="field">지금 나이${num('age', p.age, '세')}</label><label class="field">은퇴 나이${num('retireAge', p.retireAge, '세')}</label><label class="field">기대 수명${num('endAge', p.endAge, '세')}</label></div>`}
      <label class="field">물가상승률(연)${num('inflation', p.inflation, '%')}</label>
    </div></details>
    ${g ? '' : `<details class="step" data-step="exp" open><summary><span class="n">2</span>은퇴하면 한 달에 얼마 쓸까?<span class="sum">월 ${fmtKRWShort(p.expenseToday)}(오늘 돈)</span></summary><div class="stack">
      <label class="field">한 달 생활비 <span class="when-tag now">오늘 돈으로</span>${num('expenseToday', won(p.expenseToday), '원')}</label>
      <p class="cap">지금 물가로 생각해서 넣으세요. 은퇴할 때까지 오른 물가는 앱이 계산해요.</p>
      <label class="field">기대 수명 때 남길 돈(선택)${num('legacy', won(p.legacy), '원')}</label>
    </div></details>
    <details class="step" data-step="pen"><summary><span class="n">3</span>연금은 얼마?<span class="sum">${p.pensions.length ? p.pensions.map((x) => `${PENSION_KINDS.find((k) => k[0] === x.kind)?.[1]} ${fmtKRWShort(x.monthly)}`).join(' · ') : '없음'}</span></summary><div class="stack" id="pensionList">
      ${p.pensions.map((x, i) => `<div class="stack" style="gap:6px;padding:10px;border:1px solid var(--border);border-radius:8px">
        <div class="row"><select class="input" data-pen="${i}" data-f="kind" style="flex:1">${PENSION_KINDS.map(([k, l]) => `<option value="${k}" ${x.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="x-btn" type="button" data-rmpen="${i}" aria-label="빼기">×</button></div>
        <div class="grid3"><label class="field">월액(오늘 가치)<div class="input-unit"><input class="input num" data-pen="${i}" data-f="monthly" data-money="KRW" value="${won(x.monthly)}"><span>원</span></div></label>
          <label class="field">받기 시작<div class="input-unit"><input class="input num" data-pen="${i}" data-f="startAge" value="${x.startAge}"><span>세</span></div></label>
          <label class="field">받는 기간<div class="input-unit"><input class="input num" data-pen="${i}" data-f="years" value="${x.years ?? ''}" placeholder="평생"><span>년</span></div></label></div>
        <label class="toggle"><input type="checkbox" data-pen="${i}" data-f="indexed" ${x.indexed !== false ? 'checked' : ''}> 물가만큼 오름(공적연금은 보통 켬)</label></div>`).join('')}
      <button class="btn small" type="button" id="addPen">+ 연금 추가</button>
      <p class="cap">공무원연금은 공무원연금공단 ‘예상퇴직급여’, 국민연금은 ‘내 연금 알아보기’ 금액을 오늘 가치로 넣으세요.</p>
    </div></details>`}
    <details class="step" data-step="save" open><summary><span class="n">${g ? 2 : 4}</span>지금 가진 돈과 매달 모을 돈<span class="sum">${fmtKRWShort(p.initial)} + 월 ${fmtKRWShort(p.monthly)}</span></summary><div class="stack">
      <label class="field">지금 모아 둔 돈${num('initial', won(p.initial), '원')}</label>
      <button class="btn small ghost" type="button" id="fromAssets">내 자산에서 불러오기</button>
      <div class="grid2"><label class="field">매달 적립${num('monthly', won(p.monthly), '원')}</label><label class="field">적립액 매년 증가${num('monthlyGrowth', p.monthlyGrowth, '%')}</label></div>
      ${g ? '' : `<label class="field">적립 그만두는 나이(비우면 은퇴 때)${num('saveUntilAge', p.saveUntilAge ?? '', '세')}</label>`}
    </div></details>
    <p class="cap step-note">목돈(등록금·집·퇴직금 등)은 오른쪽 결과의 <b>나이 띠</b>에서 넣어요.</p>`;
  if (openSteps) $$('details.step', box).forEach((d) => { d.open = openSteps.has(d.dataset.step) || (d.dataset.step === 'me' && !openSteps.size); });
  moneyHints(box);
  $('#basisHelp', box).onclick = (e) => popover(e.currentTarget, `<b>그때 금액 vs 오늘 물가</b><p style="margin:6px 0">물가가 오르면 같은 1억으로 살 수 있는 게 줄어요. 물가 ${plan.inflation}%면 20년 뒤 1억은 오늘 돈으로 ${krRead(1e8 / Math.pow(1 + plan.inflation / 100, 20))}어치예요.</p><p class="cap" style="margin:0">‘그때 통장에 찍힐 금액’은 실제로 찍힐 숫자, ‘오늘 물가로 환산’은 지금 기준으로 얼마만큼의 생활인지예요.</p>`);
  $$('#pBasis button', box).forEach((b) => { b.onclick = () => { plan.showToday = b.dataset.v === '1'; $$('#pBasis button', box).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); save(); compute(); }; });
  $$('#pMode button', box).forEach((b) => { b.onclick = () => { plan.mode = b.dataset.v; if (plan.mode === 'goal' && plan.accSegs.length > 1 && plan.goalYears < 9) plan.accSegs = [{ from: 1, to: null, rate: 7 }]; save(); renderInput(); compute(); }; });
  $$('#gBasis button', box).forEach((b) => { b.onclick = () => { $$('#gBasis button', box).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); plan.goalBasis = b.dataset.v; changed(); }; });
  const parse = (v) => +String(v).replace(/[^\d.\-]/g, '');
  $$('[data-k]', box).forEach((x) => x.addEventListener('input', () => { const v = x.value.trim(); plan[x.dataset.k] = v === '' ? (x.dataset.k === 'saveUntilAge' ? null : 0) : parse(v); if (['goalAmount', 'expenseToday', 'initial', 'monthly', 'legacy'].includes(x.dataset.k) && v) { const pos = x.value.length; x.value = won(parse(v)); void pos; } changed(); }));
  $$('[data-pen]', box).forEach((x) => x.addEventListener('change', () => { const pe = plan.pensions[+x.dataset.pen]; const f = x.dataset.f; pe[f] = f === 'indexed' ? x.checked : f === 'kind' ? x.value : x.value === '' ? null : parse(x.value); changed(true); }));
  $$('[data-rmpen]', box).forEach((x) => { x.onclick = () => { plan.pensions.splice(+x.dataset.rmpen, 1); changed(true); }; });
  $('#addPen', box)?.addEventListener('click', () => { plan.pensions.push({ kind: 'national', monthly: 1000000, startAge: 65, indexed: true, years: null }); changed(true); });
  $$('[data-ev]', box).forEach((x) => x.addEventListener('change', () => { const ev = plan.events[+x.dataset.ev]; const f = x.dataset.f; ev[f] = ['name', 'dir'].includes(f) ? x.value : parse(x.value); changed(true); }));
  $$('[data-rmev]', box).forEach((x) => { x.onclick = () => { plan.events.splice(+x.dataset.rmev, 1); changed(true); }; });
  const addEv = (dir) => { plan.events.push({ name: dir === 'in' ? '들어올 돈' : '목돈 지출', age: g ? 5 : plan.age + 5, amount: 30000000, years: 1, dir, inflate: true }); openSteps = new Set([...(openSteps || []), 'ev']); plan.example = false; save(); renderInput(); compute(); setTimeout(() => { const rows = $$('.event-row', box); rows[rows.length - 1]?.querySelector('input')?.focus(); }, 30); };
  void addEv;
  $('#fromAssets', box).onclick = () => window.dispatchEvent(new CustomEvent('assets:request-total', { detail: { cb: (total, label) => { if (!total) { toast('내 자산 탭에 등록된 자산이 없어요.'); return; } plan.initial = Math.round(total); changed(true); toast(`${label} ${fmtKRW(total)}을 불러왔어요.`); } } }));
}
const changed = debounce((rerenderInput = false) => { plan.example = false; save(); if (rerenderInput) renderInput(); compute(); }, 150);

// ------------------------------------------------------------------ 계산·결과
function compute() {
  const p = plan;
  try { res = computePlan(p.mode === 'goal' ? { ...p, events: p.events.map((e) => ({ ...e, age: e.age })) } : p); } catch (e) { console.error(e); $('#planResult', root).innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  renderResult();
}
const monthsOf = () => (plan.mode === 'goal' ? res.M : res.lp.path.length - 1);
const disc = (m) => Math.pow(1 + res.infl, m / 12);
function shown(v, m) { return plan.showToday ? v / disc(m) : v; }

function renderResult() {
  const p = plan, R = $('#planResult', root), g = p.mode === 'goal';
  const errs = [res.errAcc, res.errDec].filter(Boolean);
  const valLbl = p.showToday ? '오늘 가치' : '그때 가치';
  let verdict, kpis, hero;
  if (g) {
    const M = res.M, short = res.gap < 0;
    verdict = `${p.goalYears}년 뒤 <b>${fmtKRW(shown(res.fv.fv, M))}</b>이 모여 목표 ${fmtKRW(shown(res.targetNominal, M))}${short ? `보다 <b>${fmtKRW(shown(-res.gap, M))}</b> 부족해요.` : `를 <b>${fmtKRW(shown(res.gap, M))}</b> 넘겨요.`}`
      + (short && res.reqM.status === 'ok' ? ` 매달 <b>${fmtKRW(res.reqM.monthly)}</b>씩 모으면 채울 수 있어요.` : '')
      + (res.reqY.status === 'ok' ? ` 지금 계획대로면 ${Math.floor(res.reqY.months / 12)}년 ${res.reqY.months % 12}개월 뒤에 도달해요.` : '');
    hero = { lb: short ? '부족' : '여유', v: fmtKRW(shown(Math.abs(res.gap), M)), alt: fmtKRW(p.showToday ? Math.abs(res.gap) : Math.abs(res.gap) / disc(M)), st: short ? 'caution' : 'good' };
    kpis = [
      ['목표(그때 가치)', fmtKRW(res.targetNominal), `오늘 가치 ${fmtKRW(res.targetToday)}`],
      ['예상 자산', fmtKRW(shown(res.fv.fv, M)), `넣은 돈 ${fmtKRW(res.fv.totalContrib)}`],
      ['필요한 월 납입', res.reqMNominalTarget.status === 'ok' ? fmtKRW(res.reqMNominalTarget.monthly) : '이미 충분', `물가 반영 목표면 ${res.reqMRealTarget.status === 'ok' ? fmtKRW(res.reqMRealTarget.monthly) : '이미 충분'}`],
      ['지금 한 번에 넣는다면', fmtKRW(res.pvNeeded), '적립 없이 지금 필요한 돈'],
      ['필요한 수익률', res.reqR.status === 'ok' ? `구간마다 ${res.reqR.delta >= 0 ? '+' : ''}${(res.reqR.delta * 100).toFixed(2)}%p` : res.reqR.status === 'unreachable' ? '수익률만으론 어려움' : '–', res.alts.find((a) => a.id === 'rate')?.single != null ? `한 가지 수익률이면 연 ${fmtPct(res.alts.find((a) => a.id === 'rate').single)}` : ''],
    ];
  } else {
    const lp = res.lp, Mr = res.Mr, short = res.gap < 0;
    verdict = `지금 계획대로면 ${p.retireAge}세에 <b>${fmtKRW(shown(lp.fvAtRetire, Mr))}</b>이 모이고, 필요 자금 ${fmtKRW(shown(lp.needAtRetire, Mr))}${short ? `보다 <b>${fmtKRW(shown(-res.gap, Mr))}</b> 부족해요.` : `보다 <b>${fmtKRW(shown(res.gap, Mr))}</b> 여유 있어요.`} `
      + (lp.depletionAge != null ? `자산은 <b>${lp.depletionAgeYears}세 ${lp.depletionAgeMonths}개월</b>에 바닥나요.` : `${p.endAge}세에도 ${fmtKRW(shown(lp.endBalance, lp.path.length - 1))}이 남아요.`);
    hero = { lb: short ? '은퇴 때 부족' : '은퇴 때 여유', v: fmtKRW(shown(Math.abs(res.gap), Mr)), alt: fmtKRW(p.showToday ? Math.abs(res.gap) : Math.abs(res.gap) / disc(Mr)), st: short ? 'caution' : 'good' };
    const pen0 = lp.rows[0]?.pension || 0;
    kpis = [
      [`필요 자금(${p.retireAge}세)`, fmtKRW(shown(lp.needAtRetire, Mr)), `${plan.showToday ? '그때 가치' : '오늘 가치'} ${fmtKRW(plan.showToday ? lp.needAtRetire : lp.needToday)}`],
      [`예상 자산(${p.retireAge}세)`, fmtKRW(shown(lp.fvAtRetire, Mr)), `넣은 돈 ${fmtKRW(lp.totalContrib)}`],
      ['은퇴 첫 달 생활비', fmtKRW(shown(lp.rows[0]?.expense || 0, Mr)), pen0 ? `연금 ${fmtKRW(shown(pen0, Mr))}` : '연금 없음(개시 전)'],
      ['필요한 월 적립', res.alts.find((a) => a.id === 'monthly') ? fmtKRW(res.alts.find((a) => a.id === 'monthly').value) : '지금으로 충분', `지금 월 ${fmtKRW(p.monthly)}`],
    ];
  }
  R.innerHTML = `
    ${errs.length ? `<div class="stale-bar">⚠ ${esc(errs.join(' '))}</div>` : ''}
    <div class="plan-hero">
      <p class="verdict">${verdict}</p>
      <div class="hero-lb"><span class="status-pill ${hero.st}">${hero.st === 'good' ? '✓' : '!'} ${hero.lb}</span> <span class="when-tag ${p.showToday ? 'now' : 'then'}">${p.showToday ? '오늘 돈' : `${thenYear()}년 통장 숫자`}</span></div>
      <div class="hero">${hero.v}</div>
      <div class="money-alt">= ${p.showToday ? `${thenYear()}년 통장 숫자로 ${esc(hero.alt)}` : `오늘 돈으로 ${esc(hero.alt)}어치`} <span class="when-tag ${p.showToday ? 'then' : 'now'}">${p.showToday ? `${thenYear()}년` : '오늘 돈'}</span></div>
      ${valueBridge()}
      ${lifeBar()}
      ${res.alts.length ? `<div class="alt-chips" id="altChips">${res.alts.map((a, i) => `<button class="alt-chip" type="button" data-a="${i}" aria-pressed="${altPreview === i}"><b>${esc(altTitle(a))}</b>${esc(a.label)} · 누르면 그래프에 점선으로</button>`).join('')}</div>` : ''}
    </div>
    <div class="to-finder"><button class="btn small" type="button" id="toFinder">이 계획에 필요한 연 ${fmtPct(needRate())} 수익률을 내는 투자 규칙 찾기 →</button></div>
    <div class="kpis" style="grid-template-columns:repeat(${isMobile() ? 2 : Math.min(kpis.length, 5)},1fr)">${kpis.map(([lb, v, c]) => `<div class="kpi"><div class="lb">${esc(lb)}</div><div class="v" style="font-size:clamp(17px,1.6vw,22px)">${v}</div><div class="cmp">${esc(c)}</div></div>`).join('')}</div>
    <div class="chart-tools" style="padding-top:12px"><div class="legend" id="planLegend"></div></div>
    <div class="readout" id="planReadout"></div>
    <div class="chart-box"><div class="chart" id="planChart" role="img" aria-label="자산 경로"></div></div>
    <div class="seg-editor" id="segEditor"></div>
    <div class="section" id="incomeBox"></div>
    <div class="section" id="trackBox"></div>
    <div class="section"><details class="more"><summary>연도별 표</summary><div id="yearTbl"></div></details></div>`;
  wireLifeBar(R);
  $('#toFinder', R).onclick = () => { const yrs = plan.mode === 'goal' ? +plan.goalYears : (plan.retireAge - plan.age); sessionStorage.setItem('ss.finderPrefill', JSON.stringify({ targetCagr: +(needRate() * 100).toFixed(1), years: [5, 10, 15, 20].reduce((a, y) => (Math.abs(y - yrs) < Math.abs(a - yrs) ? y : a), 15) })); location.hash = '#finder'; window.dispatchEvent(new CustomEvent('finder:prefill', { detail: JSON.parse(sessionStorage.getItem('ss.finderPrefill')) })); };
  $$('#altChips [data-a]', R).forEach((b) => { b.onclick = () => { const i = +b.dataset.a; altPreview = altPreview === i ? null : i; renderResult(); }; });
  drawPlanChart();
  renderSegEditor();
  renderIncome();
  renderTrack();
  renderYearTable();
}
/** 나이 띠: 모으는 기간 | 쓰는 기간 + 목돈 핀, 아래 큰 버튼 두 개 */
function lifeBar() {
  const g = plan.mode === 'goal';
  const a0 = g ? 0 : +plan.age, aR = g ? +plan.goalYears : +plan.retireAge, aE = g ? +plan.goalYears : +plan.endAge;
  const span = Math.max(1, aE - a0);
  const pos = (a) => Math.max(0, Math.min(100, ((a - a0) / span) * 100));
  const u = g ? '년 뒤' : '세';
  const pins = plan.events.map((e, i) => ({ e, i, x: pos(+e.age) })).sort((a, b) => a.x - b.x);
  let lastX = -100, alt = false; pins.forEach((p) => { p.alt = p.x - lastX < 12 ? !alt : false; alt = p.alt; lastX = p.x; });
  return `<div class="life${pins.some((p) => p.alt) ? ' has-alt' : ''}" aria-label="나이 띠">
    <div class="life-pins">${pins.map((p) => `<button type="button" class="pin ${p.e.dir === 'in' ? 'in' : 'out'}${p.alt ? ' alt' : ''}" style="left:${p.x}%" data-pin="${p.i}" title="${esc(p.e.name)} 고치기"><b>${p.e.dir === 'in' ? '+' : '−'}${esc(fmtKRWShort(p.e.amount))}</b><span>${esc(p.e.name)}${(p.e.years || 1) > 1 ? ` ×${p.e.years}년` : ''}</span></button>`).join('')}</div>
    <div class="life-bar" id="lifeBar" title="빈 곳을 누르면 그 나이에 목돈을 넣어요">${g ? `<i class="acc" style="width:100%">모으는 ${plan.goalYears}년</i>` : `<i class="acc" style="width:${pos(aR)}%">모으는 ${aR - a0}년</i><i class="dec" style="width:${100 - pos(aR)}%">쓰는 ${aE - aR}년</i>`}${pins.map((p) => `<span class="tick" style="left:${p.x}%"></span>`).join('')}</div>
    <div class="life-axis"><span>${g ? '지금' : `${a0}세`}</span>${g ? '' : `<span style="left:${pos(aR)}%">${aR}세 은퇴</span>`}<span class="end">${g ? `${aE}년 뒤` : `${aE}세`}</span></div>
    <div class="ev-add"><button class="btn" type="button" data-addev="out">+ 목돈 나감 <small>등록금·집·차</small></button><button class="btn" type="button" data-addev="in">+ 목돈 들어옴 <small>퇴직금·상속</small></button></div>
  </div>`;
}
function wireLifeBar(R) {
  $$('[data-addev]', R).forEach((b) => { b.onclick = () => editEvent(null, b.dataset.addev); });
  $$('[data-pin]', R).forEach((b) => { b.onclick = () => editEvent(+b.dataset.pin); });
  $('#lifeBar', R)?.addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const g = plan.mode === 'goal';
    const a0 = g ? 0 : +plan.age, aE = g ? +plan.goalYears : +plan.endAge;
    editEvent(null, 'out', Math.round(a0 + ((e.clientX - r.left) / r.width) * (aE - a0)));
  });
}
function editEvent(i, dir = 'out', age = null) {
  const g = plan.mode === 'goal';
  const e = i != null ? structuredClone(plan.events[i]) : { name: dir === 'in' ? '들어올 돈' : '목돈 지출', age: age ?? (g ? 5 : plan.age + 5), amount: 30000000, years: 1, dir, inflate: true };
  const s = sheet(`<h3>${i != null ? '목돈 고치기' : e.dir === 'in' ? '목돈 들어옴' : '목돈 나감'}</h3><div class="stack">
    <div class="seg" id="evDir"><button type="button" data-v="out" aria-pressed="${e.dir !== 'in'}">나감(지출)</button><button type="button" data-v="in" aria-pressed="${e.dir === 'in'}">들어옴</button></div>
    <label class="field">이름<input class="input" id="evName" value="${esc(e.name)}" placeholder="예: 자녀 대학 등록금"></label>
    <div class="grid2"><label class="field">${g ? '몇 년 뒤' : '몇 살 때'}<div class="input-unit"><input class="input num" id="evAge" inputmode="numeric" value="${e.age}"><span>${g ? '년 뒤' : '세'}</span></div></label>
      <label class="field">해마다 반복<div class="input-unit"><input class="input num" id="evYears" inputmode="numeric" value="${e.years || 1}"><span>년</span></div></label></div>
    <label class="field">금액 <span class="when-tag now">오늘 돈으로</span><div class="input-unit"><input class="input num" id="evAmt" inputmode="numeric" data-money="KRW" value="${Number(e.amount).toLocaleString('ko-KR')}"><span>원</span></div></label>
    <label class="toggle"><input type="checkbox" id="evInf" ${e.inflate !== false ? 'checked' : ''}> 물가만큼 키워서 계산(오늘 돈 기준)</label>
  </div><div class="actions">${i != null ? '<button class="btn ghost" type="button" id="evDel">지우기</button><span style="flex:1"></span>' : ''}<button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" data-ok>${i != null ? '고치기' : '넣기'}</button></div>`);
  $$('#evDir button', s.root).forEach((b) => { b.onclick = () => $$('#evDir button', s.root).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); });
  $('[data-close]', s.root).onclick = s.close;
  $('#evDel', s.root)?.addEventListener('click', () => { plan.events.splice(i, 1); plan.example = false; save(); s.close(); compute(); });
  $('[data-ok]', s.root).onclick = () => {
    const n = { name: $('#evName', s.root).value.trim() || '목돈', age: +$('#evAge', s.root).value || e.age, years: Math.max(1, +$('#evYears', s.root).value || 1), amount: +String($('#evAmt', s.root).value).replace(/[^\d]/g, '') || 0, dir: $('#evDir button[aria-pressed="true"]', s.root).dataset.v, inflate: $('#evInf', s.root).checked };
    if (i != null) plan.events[i] = n; else plan.events.push(n);
    plan.example = false; save(); s.close(); compute();
  };
}

/** 계획에 필요한 연수익률(부족하면 역산값, 아니면 지금 가정의 평균) */
function needRate() {
  const alt = res.alts.find((a) => a.id === 'rate');
  if (alt?.single != null) return alt.single;
  const segs = plan.accSegs; const n = plan.mode === 'goal' ? +plan.goalYears : plan.retireAge - plan.age;
  let tot = 0; for (let y = 1; y <= n; y++) { const g = segs.find((x) => x.from <= y && (x.to == null || y <= x.to)) || segs[segs.length - 1]; tot += +g.rate; }
  return n > 0 ? tot / n / 100 : 0.05;
}
/** 지금 돈 vs 나중 돈: 같은 금액이 물가 때문에 얼마나 '작아지는지' 막대와 국밥값으로 */
function valueBridge() {
  const g = plan.mode === 'goal';
  const M = g ? res.M : res.Mr;
  const nominal = g ? res.fv.fv : res.lp.fvAtRetire;
  const real = nominal / disc(M);
  const yrs = M / 12, ratio = real / nominal;
  const whenLb = g ? `${plan.goalYears}년 뒤(${new Date().getFullYear() + Math.round(yrs)}년)` : `${plan.retireAge}세(${new Date().getFullYear() + Math.round(yrs)}년)`;
  const soup = 10000 * disc(M);
  return `<div class="vbridge" aria-label="그때 돈과 오늘 돈 비교">
    <div class="vb-row"><span class="vb-lb">${esc(whenLb)}에 통장에 찍힐 돈</span><span class="vb-bar"><i style="width:100%"></i></span><b>${fmtKRW(nominal)}</b></div>
    <div class="vb-row real"><span class="vb-lb">오늘 물가로 치면</span><span class="vb-bar"><i style="width:${(ratio * 100).toFixed(1)}%"></i></span><b>${fmtKRW(real)}</b></div>
    <p class="vb-ex">🍜 물가가 해마다 ${plan.inflation}%씩 오르면 지금 1만원짜리 국밥이 ${Math.round(yrs)}년 뒤엔 <b>${Math.round(soup / 10) * 10 >= 10000 ? (Math.round(soup / 10) * 10).toLocaleString('ko-KR') : '1만'}원</b>. 같은 돈으로 살 수 있는 게 <b>${fmtPct(ratio, 0)}</b>로 줄어요.</p>
  </div>`;
}
function altTitle(a) {
  if (a.id === 'monthly') return `월 ${fmtKRW(a.value)} 적립 (+${fmtKRW(a.value - a.from)})`;
  if (a.id === 'rate') return `수익률 ${a.value >= 0 ? '+' : ''}${(a.value * 100).toFixed(2)}%p`;
  if (a.id === 'retire') return `${a.value}세 은퇴 (+${a.value - a.from}년)`;
  if (a.id === 'years') return `${Math.ceil(a.value / 12)}년 모으기`;
  if (a.id === 'expense') return `생활비 월 ${fmtKRW(a.value)}`;
  return a.label;
}

function xOfMonth(m) { return plan.mode === 'goal' ? m / 12 : plan.age + m / 12; }
function xFmt(x) { return plan.mode === 'goal' ? `${new Date().getFullYear() + Math.round(x)}년` : `${Math.floor(x)}세`; }

function drawPlanChart() {
  const p = plan, g = p.mode === 'goal';
  const path = g ? res.fv.path : res.lp.path;
  const Mr = g ? res.M : res.Mr;
  const data = path.map((v, m) => [xOfMonth(m), shown(v, m)]);
  const acc = data.slice(0, Mr + 1), dec = data.slice(Mr);
  const series = [{ name: '적립기', color: css('--series-1'), area: true, data: acc }];
  if (!g) series.push({ name: '인출기', color: css('--series-2'), area: true, data: dec });
  // 목표선
  const target = g ? shown(res.targetNominal, Mr) : shown(res.lp.needAtRetire, Mr);
  series.push({ name: g ? '목표' : '필요 자금', color: css('--text-2'), dashed: true, width: 1.5, data: [[xOfMonth(0), target], [xOfMonth(Mr), target]], tooltipHide: true });
  // 대안 미리보기
  if (altPreview != null && res.alts[altPreview]) {
    const alt = res.alts[altPreview];
    const r2 = computePlan({ ...p, ...alt.apply, _noAlt: true });
    const path2 = g ? r2.fv.path : r2.lp.path;
    series.push({ name: `대안: ${alt.label}`, color: css('--series-3'), dashed: true, width: 2, data: path2.map((v, m) => [xOfMonth(m), shown(v, m)]) });
  }
  // 실제 기록
  const act = actualPoints();
  if (act.length) series.push({ name: '실제', color: css('--text-1'), width: 0, data: act.map((a) => [xOfMonth(a.m), shown(a.v, a.m)]), markPoint: undefined, z: 5, symbol: true });
  const leg = $('#planLegend', root);
  leg.innerHTML = series.filter((s) => !s.tooltipHide || true).map((s) => `<button type="button" aria-pressed="true"><i style="background:${s.color}"></i>${esc(s.name)}</button>`).join('');
  const c = lineChart($('#planChart', root), {
    series: series.map((s) => (s.name === '실제' ? { ...s, width: 0.01 } : s)), xType: 'value', isTime: false, xFmt, xMin: xOfMonth(0), xMax: xOfMonth(path.length - 1),
    yFmt: (v, ax) => (ax ? fmtKRWShort(v) : fmtKRW(v)), yMin: 0, readout: isMobile() ? $('#planReadout', root) : null, grid: { left: 64, right: 20, containLabel: false, bottom: 28 },
  });
  if (c && act.length) {
    const opt = c.getOption();
    const i = opt.series.findIndex((s) => s.name === '실제');
    opt.series[i] = { ...opt.series[i], showSymbol: true, symbol: 'circle', symbolSize: 9, lineStyle: { width: 0 }, itemStyle: { color: css('--text-1'), borderColor: css('--bg-surface'), borderWidth: 2 } };
    c.setOption({ series: opt.series });
  }
  if (c && !g) {
    c.setOption({ series: [{ name: '적립기', markLine: { silent: true, symbol: 'none', label: { formatter: `${p.retireAge}세 은퇴`, color: css('--text-2'), fontSize: 11 }, lineStyle: { color: css('--text-3'), type: 'solid' }, data: [{ xAxis: p.retireAge }] } }] });
  }
}

function renderSegEditor() {
  const box = $('#segEditor', root);
  const g = plan.mode === 'goal';
  const accYears = g ? +plan.goalYears || 1 : Math.max(1, plan.retireAge - plan.age);
  const decYears = g ? 0 : Math.max(1, plan.endAge - plan.retireAge);
  const total = accYears + decYears;
  const pct = (y) => `calc(64px + (100% - 84px) * ${y / total})`;
  const segsOf = (phase) => (phase === 'acc' ? plan.accSegs : plan.decSegs);
  const span = (phase) => (phase === 'acc' ? accYears : decYears);
  const offset = (phase) => (phase === 'acc' ? 0 : accYears);
  const bars = [];
  for (const phase of g ? ['acc'] : ['acc', 'dec']) {
    const segs = segsOf(phase), n = span(phase);
    segs.forEach((s, i) => {
      const a = s.from - 1, b = Math.min(n, s.to == null ? n : s.to);
      if (a >= n) return;
      bars.push(`<div class="tseg ${phase} ${selSeg.phase === phase && selSeg.i === i ? 'sel' : ''}" data-phase="${phase}" data-i="${i}" style="left:${pct(offset(phase) + a)};width:calc((100% - 84px) * ${(b - a) / total})">연 ${(+s.rate).toFixed(1)}%</div>`);
      if (i < segs.length - 1 && s.to != null && s.to < n) bars.push(`<div class="knob" role="slider" tabindex="0" aria-label="구간 경계" aria-valuenow="${s.to}" data-phase="${phase}" data-i="${i}" style="left:${pct(offset(phase) + s.to)}"></div>`);
    });
  }
  const ticks = [];
  const step = total > 40 ? 10 : total > 15 ? 5 : total > 6 ? 2 : 1;
  for (let y = 0; y <= total; y += step) ticks.push(`<span style="left:${pct(y)}">${g ? `${y}년` : `${plan.age + y}`}</span>`);
  const list = (phase) => segsOf(phase).map((s, i) => `<div class="seg-row ${selSeg.phase === phase && selSeg.i === i ? 'sel' : ''}"><span class="tag ${phase}">${phase === 'acc' ? '적립' : '인출'} ${i + 1}</span>
      <span>${s.from}~${s.to ?? '끝'}년차 <span class="cap">${g ? `${new Date().getFullYear() + s.from - 1}~${s.to ? new Date().getFullYear() + s.to - 1 : ''}` : `${plan.age + offset(phase) + s.from - 1}~${s.to ? plan.age + offset(phase) + s.to - 1 : plan.endAge}세`}</span></span>
      <div class="input-unit"><input class="input num" data-rate="${phase}-${i}" value="${s.rate}" inputmode="decimal" aria-label="수익률"><span>%</span></div>
      ${segsOf(phase).length > 1 ? `<button class="x-btn" type="button" data-rmseg="${phase}-${i}" aria-label="구간 합치기">×</button>` : '<span></span>'}</div>`).join('');
  box.innerHTML = `<div class="section-title" style="margin-top:4px">구간별 수익률 <span class="cap">경계를 끌거나 아래에서 숫자를 고치세요 · 실효 연수익률</span></div>
    <div class="timeline" id="tl">${bars.join('')}${g ? '' : `<div class="ret-line" style="left:${pct(accYears)}"></div>`}</div>
    <div class="tl-axis">${ticks.join('')}</div>
    <div class="row" style="margin-top:8px"><button class="btn small" type="button" id="splitSeg">+ 선택 구간 나누기</button><span class="cap">빠른 채우기:</span>${PRESETS.map(([l], i) => `<button class="chip" type="button" data-pre="${i}">${l}</button>`).join('')}</div>
    <div class="seg-list"><div class="cap">${g ? '' : '적립기(지금 ~ 은퇴)'}</div>${list('acc')}${g ? '' : `<div class="cap" style="margin-top:6px">인출기(은퇴 ~ ${plan.endAge}세)</div>${list('dec')}`}</div>`;
  $$('.tseg', box).forEach((b) => { b.onclick = () => { selSeg = { phase: b.dataset.phase, i: +b.dataset.i }; renderSegEditor(); $(`[data-rate="${selSeg.phase}-${selSeg.i}"]`, box)?.focus(); }; });
  $$('[data-rate]', box).forEach((x) => x.addEventListener('change', () => { const [ph, i] = x.dataset.rate.split('-'); segsOf(ph)[+i].rate = +x.value || 0; plan.example = false; save(); compute(); }));
  $$('[data-rmseg]', box).forEach((x) => { x.onclick = () => { const [ph, i] = x.dataset.rmseg.split('-'); const s = segsOf(ph); const k = +i; if (k > 0) { s[k - 1].to = s[k].to; s.splice(k, 1); } else { s[1].from = 1; s.splice(0, 1); } selSeg = { phase: ph, i: 0 }; save(); compute(); }; });
  $('#splitSeg', box).onclick = () => {
    const s = segsOf(selSeg.phase), seg = s[selSeg.i], n = span(selSeg.phase);
    const end = seg.to ?? n; if (end - seg.from < 1) { toast('1년짜리 구간은 더 나눌 수 없어요.'); return; }
    const mid = Math.floor((seg.from + end) / 2);
    s.splice(selSeg.i + 1, 0, { from: mid + 1, to: seg.to, rate: seg.rate });
    seg.to = mid; save(); compute();
  };
  $$('[data-pre]', box).forEach((b) => { b.onclick = () => { plan.accSegs = PRESETS[+b.dataset.pre][1](accYears); selSeg = { phase: 'acc', i: 0 }; plan.example = false; save(); compute(); }; });
  // 경계 끌기(1년 단위)
  const tl = $('#tl', box);
  $$('.knob', box).forEach((k) => {
    const ph = k.dataset.phase, i = +k.dataset.i, segs = segsOf(ph);
    const move = (to) => { const lo = segs[i].from, hi = (segs[i + 1].to ?? span(ph)) - 1; to = Math.max(lo, Math.min(hi, to)); if (to !== segs[i].to) { segs[i].to = to; segs[i + 1].from = to + 1; save(); compute(); } };
    k.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') move(segs[i].to - 1); if (e.key === 'ArrowRight') move(segs[i].to + 1); });
    k.addEventListener('pointerdown', (e) => {
      e.preventDefault(); k.setPointerCapture(e.pointerId);
      const rect = tl.getBoundingClientRect();
      const onMove = (ev) => { const x = ev.clientX - rect.left - 64; const y = Math.round((x / (rect.width - 84)) * total) - offset(ph); const lo = segs[i].from, hi = (segs[i + 1].to ?? span(ph)) - 1; const to = Math.max(lo, Math.min(hi, y)); if (to !== segs[i].to) { segs[i].to = to; segs[i + 1].from = to + 1; k.style.left = pct(offset(ph) + to); } };
      const up = () => { k.removeEventListener('pointermove', onMove); k.removeEventListener('pointerup', up); save(); compute(); };
      k.addEventListener('pointermove', onMove); k.addEventListener('pointerup', up);
    });
  });
}

function renderIncome() {
  const box = $('#incomeBox', root);
  const g = plan.mode === 'goal';
  const M = g ? res.M : res.Mr;
  const asset = g ? res.targetNominal : res.lp.fvAtRetire;
  const pens = g ? 0 : (plan.pensions || []).reduce((t, p) => t + (+p.monthly || 0), 0);
  const want = plan.wantMonthly || 3000000;
  const rate = plan.wantRate || 4;
  box.innerHTML = `<div class="section-title">${g ? '목표 금액' : `${plan.retireAge}세 예상 자산`}으로 매달 쓸 수 있는 돈 <span class="cap">매년 자산의 x%를 꺼내 쓸 때</span></div>
    <div class="tbl-wrap"><table class="tbl"><thead><tr><th>꺼내 쓰는 비율(연)</th><th class="num">매달(그때 가치)</th><th class="num">매달(오늘 가치)</th>${pens ? '<th class="num">+ 연금(오늘 가치)</th>' : ''}</tr></thead><tbody>
    ${res.incomeTable.map((r) => `<tr><td>${r.rate}%</td><td class="num">${fmtKRW(r.monthly)}</td><td class="num">${fmtKRW(r.monthlyToday)}</td>${pens ? `<td class="num">${fmtKRW(r.monthlyToday + pens)}</td>` : ''}</tr>`).join('')}</tbody></table></div>
    <div class="row" style="margin-top:14px;align-items:flex-end;gap:12px">
      <label class="field" style="flex:1;min-width:160px">거꾸로: 매달 이만큼 받고 싶다면(오늘 가치)<div class="input-unit"><input class="input num" id="wantM" value="${want.toLocaleString('ko-KR')}"><span>원</span></div></label>
      <label class="field" style="width:110px">꺼내는 비율<div class="input-unit"><input class="input num" id="wantR" value="${rate}"><span>%</span></div></label>
    </div>
    <p id="wantOut" style="margin:10px 0 0"></p>
    <p class="cap">‘4% 규칙’은 은퇴 자산의 4%를 해마다 꺼내 쓰는 방식이에요. 비율이 높을수록 자산이 빨리 줄어요.${g ? '' : ' 위 그래프의 인출기는 생활비에서 연금을 뺀 만큼을 실제로 꺼낸 결과예요.'}</p>`;
  const upd = () => {
    const w = +$('#wantM', box).value.replace(/[^\d]/g, '') || 0, r = +$('#wantR', box).value || 4;
    plan.wantMonthly = w; plan.wantRate = r; save();
    const needToday = ((Math.max(0, w - pens) * 12) / (r / 100));
    const needThen = needToday * disc(M);
    $('#wantOut', box).innerHTML = `${pens ? `연금 ${fmtKRW(pens)}을 빼고 ` : ''}필요한 자산은 <b>${fmtKRW(needThen)}</b>(그때 가치) · 오늘 가치 ${fmtKRW(needToday)}. ${asset >= needThen ? `<span class="status-pill good">✓ 예상 자산으로 충분</span>` : `<span class="status-pill caution">! ${fmtKRW(needThen - asset)} 부족</span>`}`;
  };
  $('#wantM', box).oninput = upd; $('#wantR', box).oninput = upd; upd();
}

// ------------------------------------------------------------------ 목표 vs 실제
function actualPoints() {
  const start = new Date(plan.startedAt);
  const toM = (d) => { const t = new Date(d); return (t.getFullYear() - start.getFullYear()) * 12 + (t.getMonth() - start.getMonth()) + (t.getDate() - start.getDate()) / 30; };
  const snaps = (store('ss.snapshots') || []).map((s) => ({ date: s.date, v: plan.track?.owner && plan.track.owner !== 'all' ? s.byOwner?.[plan.track.owner] : s.total })).filter((x) => x.v);
  const manual = (plan.actuals || []).map((a) => ({ date: a.date, v: a.value, manual: true }));
  return [...snaps, ...manual].map((a) => ({ ...a, m: toM(a.date) })).filter((a) => a.m >= -0.5).sort((a, b) => a.m - b.m);
}
function renderTrack() {
  const box = $('#trackBox', root);
  const pts = actualPoints();
  const path = plan.mode === 'goal' ? res.fv.path : res.lp.path;
  const owners = [...new Set((store('ss.holdings')?.accounts || []).map((a) => a.owner).filter(Boolean))];
  let body;
  if (!pts.length) {
    body = `<p class="cap">아직 실제 기록이 없어요. <b>내 자산</b> 탭에 자산을 넣으면 매일 한 번 총액이 기록되고, 여기 그래프에 점으로 찍혀요. 직접 넣을 수도 있어요.</p>`;
  } else {
    const lastP = pts[pts.length - 1];
    const mi = Math.max(0, Math.min(path.length - 1, Math.round(lastP.m)));
    const planned = path[mi];
    const rate = planned ? lastP.v / planned : null;
    const first = pts[0];
    const yrs = (lastP.m - first.m) / 12;
    const cagr = yrs > 0.25 ? Math.pow(lastP.v / first.v, 1 / yrs) - 1 : null;
    body = `<div class="facts"><div class="fact"><div class="lb">최근 실제 자산</div><div class="v">${fmtKRW(lastP.v)}</div><div class="cap">${lastP.date}</div></div>
      <div class="fact"><div class="lb">그때 계획 경로</div><div class="v">${fmtKRW(planned)}</div></div>
      <div class="fact"><div class="lb">계획 대비 달성률</div><div class="v">${rate ? `${(rate * 100).toFixed(1)}%` : '–'}</div><div class="cap">${rate && rate < 1 ? `${fmtKRW(planned - lastP.v)} 뒤처짐` : rate ? '계획보다 앞서 있어요' : ''}</div></div>
      <div class="fact"><div class="lb">실제 연평균 증가율</div><div class="v">${cagr == null ? '–' : fmtPct(cagr)}</div><div class="cap">적립 포함 · ${first.date}부터</div></div></div>
      ${rate && rate < 0.95 ? `<div class="rcard"><span class="st caution">! 주의</span><h4>계획 경로보다 ${((1 - rate) * 100).toFixed(1)}% 뒤처져 있어요</h4><p class="why">지금 자산에서 다시 출발해 같은 목표를 맞추려면 위 ‘대안’ 칩의 월 적립액을 확인하세요.</p><div class="alt"><b>대안</b> 지금 자산 ${fmtKRW(lastP.v)}을 시작 금액으로 다시 계산 <button class="btn small" type="button" id="rebase">다시 계산</button></div></div>` : ''}`;
  }
  box.innerHTML = `<div class="section-title">목표 vs 실제 <span class="cap">계획 시작 ${plan.startedAt}</span><span class="spacer"></span>
      ${owners.length ? `<select class="input" id="trOwner" style="width:auto;min-height:34px"><option value="all">가족 전체</option>${owners.map((o) => `<option ${plan.track?.owner === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : ''}
      <button class="btn small" type="button" id="addActual">+ 실제 금액 기록</button></div>${body}`;
  $('#trOwner', box)?.addEventListener('change', (e) => { plan.track = { owner: e.target.value }; save(); renderResult(); });
  $('#addActual', box).onclick = () => {
    const s = sheet(`<h3>실제 자산 기록</h3><div class="stack"><label class="field">날짜<input class="input" type="date" id="ac_d" value="${new Date().toISOString().slice(0, 10)}"></label><label class="field">금액<div class="input-unit"><input class="input num" id="ac_v" inputmode="numeric"><span>원</span></div></label><label class="field">계획 시작일 바꾸기(선택)<input class="input" type="date" id="ac_s" value="${plan.startedAt}"></label></div><div class="actions"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" data-ok>기록</button></div>`);
    $('[data-close]', s.root).onclick = s.close;
    $('[data-ok]', s.root).onclick = () => { const v = +$('#ac_v', s.root).value.replace(/[^\d]/g, ''); if (v) plan.actuals.push({ date: $('#ac_d', s.root).value, value: v }); plan.startedAt = $('#ac_s', s.root).value || plan.startedAt; save(); s.close(); renderResult(); };
  };
  $('#rebase', box)?.addEventListener('click', () => { const lastP = pts[pts.length - 1]; plan.initial = Math.round(lastP.v); plan.startedAt = lastP.date; save(); renderInput(); compute(); toast('지금 자산에서 다시 출발하도록 바꿨어요.'); });
}

function renderYearTable() {
  const box = $('#yearTbl', root);
  const g = plan.mode === 'goal';
  const rows = res.years;
  box.innerHTML = `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${g ? '연도' : '나이'}</th><th class="num">자산(그때 가치)</th><th class="num">자산(오늘 가치)</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td>${g ? `${Math.round(r.year)}년 (${r.y}년 뒤)` : `${Math.floor(r.age)}세 · ${Math.round(r.year)}년`}</td><td class="num">${fmtKRW(r.balance)}</td><td class="num">${fmtKRW(r.real)}</td></tr>`).join('')}</tbody></table></div>`;
}
void el; void popover;
