// 탭 '노후' — 목표 탭에서 정한 값을 기본으로, 은퇴 전·후 숫자를 가로로 넣고 바로 아래 그래프로 확인
// 2026-11-21 개편: 목표·노후 분리, 가로 입력, 목적별 카드(줄마다 같은 높이), 최근 기록 5개
import { $, $$, store, toast, sheet, debounce } from '../ui/dom.js';
import { fmtKRW, fmtKRWShort, fmtPct, esc } from '../ui/format.js';
import { moneyHints } from '../ui/dom.js';
import { lineChart, css, isMobile } from '../ui/charts.js';
import { computePlan } from '../core/plan.js';
import { goalSummary } from '../core/goalcalc.js';
import { loadGoal, migratePlan } from './goalcards.js';
import { requestAssetsTotal } from './goal.js';

const PENSION_KINDS = [['national', '국민연금'], ['civil', '공무원연금'], ['teacher', '사학연금'], ['military', '군인연금'], ['retire', '퇴직연금·IRP'], ['personal', '개인연금'], ['other', '기타']];
const PRESETS = [
  ['일정하게 5%', () => [{ from: 1, to: null, rate: 5 }]],
  ['3% → 5% → 10%', (n) => (n >= 10 ? [{ from: 1, to: 5, rate: 3 }, { from: 6, to: 8, rate: 5 }, { from: 9, to: null, rate: 10 }] : [{ from: 1, to: null, rate: 5 }])],
  ['갈수록 낮게 7 → 5 → 3%', (n) => (n >= 6 ? [{ from: 1, to: Math.floor(n / 3), rate: 7 }, { from: Math.floor(n / 3) + 1, to: Math.floor((2 * n) / 3), rate: 5 }, { from: Math.floor((2 * n) / 3) + 1, to: null, rate: 3 }] : [{ from: 1, to: null, rate: 5 }])],
];
// 목표 탭에서 따라오는 칸(고치면 그 칸만 '직접 입력'으로 바뀜)
const LINK_KEYS = ['retireAge', 'initial', 'monthly', 'rate', 'inflation'];
const allLinked = () => Object.fromEntries(LINK_KEYS.map((k) => [k, true]));

function newPlan(name = '내 노후 계획') {
  return {
    id: `p${Date.now().toString(36)}`, name, mode: 'retire', startedAt: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; })(),
    age: 45, retireAge: 60, endAge: 90, inflation: 2.5,
    initial: 100000000, monthly: 1500000, monthlyGrowth: 0, saveUntilAge: null,
    accSegs: [{ from: 1, to: null, rate: 5 }],
    decSegs: [{ from: 1, to: null, rate: 4 }],
    expenseToday: 3500000,
    pensions: [{ kind: 'national', monthly: 1200000, startAge: 65, indexed: true, years: null }],
    events: [], legacy: 0, link: allLinked(),
    track: { owner: 'all' }, actuals: [], example: true,
  };
}
/** 예전 '목표·노후' 계획 → 노후 계획(목표 모드는 기간을 은퇴까지로) */
function migrate(p) {
  migratePlan(p);
  if (p.mode === 'goal') { p.retireAge = (+p.age || 45) + Math.max(1, Math.round(+p.goalYears || 20)); if (p.endAge <= p.retireAge) p.endAge = p.retireAge + 25; p.mode = 'retire'; }
  if (!p.link) p.link = p.example ? allLinked() : {};
  delete p.scale; delete p.calc;
  return p;
}

let P = null; // {active, list}
let root = null, plan = null, res = null, G = null, selSeg = { phase: 'acc', i: 0 }, altPreview = null, lastStamp = null;

export function initPlan(container) {
  root = container;
  P = store('ss.plans') || { active: 0, list: [newPlan()] };
  if (!P.list.length) P.list = [newPlan()];
  loadGoal(); // 목표 탭 상태가 없으면 예전 계획의 저울 값으로 먼저 만들어 둠(아래 migrate가 지우기 전에)
  P.list.forEach(migrate);
  store('ss.plans', P);
  consumeUseGoal(false);
  render();
  window.addEventListener('plan:set-rate', (e) => {
    plan = P.list[P.active];
    plan.accSegs = [{ from: 1, to: null, rate: +e.detail.rate.toFixed(2) }];
    plan.link = { ...plan.link, rate: false };
    plan.example = false;
    save(); render();
    toast(`은퇴 전 수익률을 연 ${e.detail.rate.toFixed(1)}%로 바꿨어요(${e.detail.source}).`);
  });
  window.addEventListener('snapshots:changed', () => { if (root.isConnected) compute(); });
  window.addEventListener('tabshown', (e) => {
    if (e.detail !== 'plan' || !root.isConnected) return;
    if (consumeUseGoal(true)) return;
    plan = P.list[P.active];
    if (syncFromGoal(plan)) { store('ss.plans', P); render(); } else renderGoalStrip();
  });
}
function save() { store('ss.plans', P); scheduleHistory(); if (plan && !plan.example) $('#clearEx', root)?.closest('.stale-bar')?.remove(); }

/** 목표 탭 '노후 탭에서 이어 가기'를 눌렀으면 목표 값을 모두 연결해서 넣음 */
function consumeUseGoal(doRender) {
  if (!sessionStorage.getItem('ss.useGoal')) return false;
  sessionStorage.removeItem('ss.useGoal');
  plan = P.list[P.active];
  const before = structuredClone(plan);
  plan.link = allLinked(); plan.example = false;
  syncFromGoal(plan);
  store('ss.plans', P);
  if (doRender) render();
  setTimeout(() => toast('목표 탭에서 정한 값을 넣었어요.', { label: '되돌리기', fn: () => { P.list[P.active] = before; store('ss.plans', P); render(); } }), 50);
  return true;
}
/** 연결된 칸을 목표 값으로 맞춤. 바뀐 게 있으면 true */
function syncFromGoal(p) {
  G = goalSummary(loadGoal());
  if (!G) return false;
  const L = p.link || {};
  let ch = false;
  const put = (k, v) => { if (v != null && isFinite(v) && p[k] !== v) { p[k] = v; ch = true; } };
  if (L.retireAge && G.months > 0) put('retireAge', +p.age + Math.max(1, Math.ceil(G.months / 12)));
  if (L.initial) put('initial', Math.round(G.initial));
  if (L.monthly) put('monthly', Math.round(G.monthly));
  if (L.inflation) put('inflation', G.inflation);
  if (L.rate && !(p.accSegs.length === 1 && +p.accSegs[0].rate === G.ratePct)) { p.accSegs = [{ from: 1, to: null, rate: G.ratePct }]; ch = true; }
  if (p.endAge <= p.retireAge) { p.endAge = p.retireAge + 1; ch = true; }
  return ch;
}
const goalVal = (k) => (!G ? null : k === 'retireAge' ? (G.months > 0 ? +plan.age + Math.max(1, Math.ceil(G.months / 12)) : null) : k === 'initial' ? Math.round(G.initial) : k === 'monthly' ? Math.round(G.monthly) : k === 'rate' ? G.ratePct : k === 'inflation' ? G.inflation : null);
const curVal = (k) => (k === 'rate' ? (plan.accSegs.length === 1 ? +plan.accSegs[0].rate : null) : +plan[k]);

// ------------------------------------------------------------------ 계획 기록(계획마다 최근 5회): 값을 바꾸고 3초 쉬면 한 번 남김
const MAX_PH = 5;
let phTimer = null;
const INPUT_KEYS = ['age', 'retireAge', 'endAge', 'inflation', 'initial', 'monthly', 'monthlyGrowth', 'saveUntilAge', 'accSegs', 'decSegs', 'expenseToday', 'pensions', 'events', 'legacy', 'link'];
function snapOf(p) { const o = {}; INPUT_KEYS.forEach((k) => { o[k] = structuredClone(p[k]); }); return o; }
function phAll() { return store('ss.planHistory') || {}; }
function scheduleHistory() {
  clearTimeout(phTimer);
  phTimer = setTimeout(() => {
    if (!plan || plan.example || !res) return;
    const all = phAll(); const list = all[plan.id] || [];
    const snap = snapOf(plan), sig = JSON.stringify(snap);
    if (list[0]?.sig === sig) return;
    const sum = `${plan.retireAge}세 은퇴 · 월 ${fmtKRWShort(plan.monthly)} · ${res.gap < 0 ? '부족' : '여유'} ${fmtKRWShort(Math.abs(res.gap))}`;
    list.unshift({ at: Date.now(), sig, snap, sum, ok: res.gap >= 0 });
    all[plan.id] = list.slice(0, MAX_PH);
    store('ss.planHistory', all);
    renderHistoryChips();
  }, 3000);
}
function renderHistoryChips() {
  const box = $('#planHist', root);
  if (!box) return;
  const list = (phAll()[plan.id] || []).slice(0, MAX_PH);
  if (!list.length) { box.innerHTML = ''; return; }
  const when = (t) => { const d = new Date(t); return `${d.getMonth() + 1}.${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  box.innerHTML = `<span class="ph-title">최근 기록</span>${list.map((h, i) => `<button class="ph-chip ${h.ok ? 'ok' : 'short'}" type="button" data-ph="${i}" title="${esc(h.sum)} · 이 값으로 되돌리기"><small>${esc(when(h.at))}</small>${esc(h.sum)}</button>`).join('')}`;
  $$('[data-ph]', box).forEach((b) => { b.onclick = () => {
    const h = list[+b.dataset.ph]; const before = snapOf(plan);
    Object.assign(plan, structuredClone(h.snap)); if (!plan.link) plan.link = {}; plan.example = false; store('ss.plans', P); render();
    toast('그때 값으로 되돌렸어요.', { label: '취소', fn: () => { Object.assign(plan, before); store('ss.plans', P); render(); } });
  }; });
}

// ------------------------------------------------------------------ 화면 뼈대
function render() {
  plan = P.list[P.active];
  syncFromGoal(plan);
  root.innerHTML = `
    <div class="view-intro"><h1>풍족한 노후를 위해</h1><p>목표 탭에서 정한 값이 기본으로 들어가 있어요. <b>1~4</b> 칸을 직접 고치면 바로 아래 그래프가 바뀌고, 그 아래 카드에서 목돈·구간 수익률·매달 쓸 돈·실제 기록을 더 넣어 볼 수 있어요.</p></div>
    <div class="plan-top">
      <div class="chips scroll" id="planTabs">${P.list.map((p, i) => `<button class="chip" type="button" data-i="${i}" aria-pressed="${i === P.active}">${esc(p.name)}</button>`).join('')}<button class="chip" type="button" id="newPlan">+ 새 계획</button></div>
      <div class="row"><button class="btn small ghost" type="button" id="renPlan">이름 바꾸기</button>${P.list.length > 1 ? '<button class="btn small ghost" type="button" id="delPlan">삭제</button>' : ''}</div>
    </div>
    <div class="ph-strip" id="planHist"></div>
    ${plan.example ? `<div class="stale-bar" style="border-radius:12px;margin-bottom:12px">예시 값이에요. 내 나이와 생활비로 바꿔 보세요. <button class="btn small" type="button" id="clearEx">알겠어요</button></div>` : ''}
    <div class="goal-strip" id="goalStrip"></div>
    <section class="surface rp-input" id="planInput" aria-label="노후 계획 숫자"></section>
    <section class="surface rp-result" id="planResult" aria-label="결과"></section>
    <div class="rp-grid" id="planMore"></div>`;
  $$('#planTabs [data-i]', root).forEach((b) => { b.onclick = () => { P.active = +b.dataset.i; save(); render(); }; });
  $('#newPlan', root).onclick = () => {
    const s = sheet(`<h3>새 노후 계획</h3><div class="stack"><label class="field">이름<input class="input" id="np_name" value="새 계획 ${P.list.length + 1}"></label><label class="toggle"><input type="checkbox" id="np_copy" checked> 지금 계획의 나이·생활비·연금 가져오기</label><p class="cap">목표 탭 값(은퇴 나이·목돈·매달·수익률·물가)은 새 계획에도 기본으로 들어가요.</p></div><div class="actions"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" data-ok>만들기</button></div>`);
    $('[data-close]', s.root).onclick = s.close;
    $('[data-ok]', s.root).onclick = () => {
      const n = newPlan($('#np_name', s.root).value || '새 계획');
      n.example = false;
      if ($('#np_copy', s.root).checked) Object.assign(n, { age: plan.age, endAge: plan.endAge, expenseToday: plan.expenseToday, pensions: structuredClone(plan.pensions), decSegs: structuredClone(plan.decSegs) });
      P.list.push(n); P.active = P.list.length - 1; save(); render(); s.close();
    };
  };
  $('#renPlan', root).onclick = () => { const v = prompt('계획 이름', plan.name); if (v) { plan.name = v; save(); render(); } };
  $('#delPlan', root)?.addEventListener('click', () => { if (confirm(`'${plan.name}' 계획을 지울까요?`)) { const removed = P.list.splice(P.active, 1)[0]; P.active = 0; save(); render(); toast('계획을 지웠어요.', { label: '되돌리기', fn: () => { P.list.push(removed); save(); render(); } }); } });
  $('#clearEx', root)?.addEventListener('click', () => { plan.example = false; save(); render(); });
  renderGoalStrip();
  renderInput();
  compute();
  renderHistoryChips();
}

function renderGoalStrip() {
  const box = $('#goalStrip', root);
  if (!box) return;
  G = goalSummary(loadGoal());
  if (!G) { box.innerHTML = `<div class="gstrip-in"><div><b>목표 탭에서 목표 금액을 먼저 정해 보세요</b><span class="cap">정한 값이 여기 칸에 기본으로 들어가요.</span></div><a class="btn small" href="#goal">목표 정하러 가기</a></div>`; return; }
  const y = Math.max(1, Math.ceil(G.months / 12));
  const off = LINK_KEYS.filter((k) => !plan.link?.[k] && goalVal(k) != null && goalVal(k) !== curVal(k));
  box.innerHTML = `<div class="gstrip-in"><svg class="gs-flagico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 15V2"/><path d="M3 2h9l-2 3 2 3H3"/></svg>
    <div><b>목표: ${y}년 뒤 통장에 ${esc(fmtKRW(G.target))}</b><span class="cap">오늘 돈 ${esc(fmtKRW(G.today))}어치 · 처음 ${esc(fmtKRW(G.initial))} · 매달 ${esc(fmtKRW(G.monthly))} · 연 ${G.ratePct}% · 물가 ${G.inflation}%</span></div>
    <div class="row">${off.length ? `<button class="btn small" type="button" id="relinkAll">목표 값 다시 넣기(${off.length}칸)</button>` : '<span class="cap gstrip-ok">✓ 목표 값과 같아요</span>'}<a class="btn small ghost" href="#goal">목표 바꾸기</a></div></div>`;
  $('#relinkAll', box)?.addEventListener('click', () => { const before = structuredClone(plan); plan.link = allLinked(); syncFromGoal(plan); plan.example = false; save(); render(); toast('목표 값을 다시 넣었어요.', { label: '되돌리기', fn: () => { P.list[P.active] = before; save(); render(); } }); });
}

// ------------------------------------------------------------------ 입력(가로 네 묶음)
const won = (v) => (v == null || v === '' ? '' : Number(v).toLocaleString('ko-KR'));
const MONEY_KEYS = new Set(['expenseToday', 'initial', 'monthly', 'legacy']);
const segText = (segs) => segs.map((s) => `${+s.rate}`).join('→') + '%';
function tagHtml(link) {
  if (!link || !G) return '';
  if (plan.link?.[link]) return '<i class="link-tag" title="목표 탭에서 온 값이에요. 고치면 이 칸만 직접 입력으로 바뀌어요.">목표</i>';
  const gv = goalVal(link);
  if (gv == null || gv === curVal(link)) return '';
  const t = link === 'rate' || link === 'inflation' ? `${gv}%` : link === 'retireAge' ? `${gv}세` : fmtKRWShort(gv);
  return `<button class="linkbtn" type="button" data-relink="${link}" title="목표 탭 값으로 되돌리기">목표 ${esc(t)}</button>`;
}
function F(k, label, v, unit, o = {}) {
  return `<div class="field rp-f"><div class="rp-lb"><label for="rp_${k}">${label}</label><span data-tag="${o.link || ''}">${tagHtml(o.link)}</span>${o.extra || ''}</div>
    <div class="input-unit"><input class="input num" id="rp_${k}" data-k="${k}" inputmode="decimal" value="${esc(String(v ?? ''))}" ${MONEY_KEYS.has(k) ? 'data-money="KRW"' : ''} ${o.attrs || ''}><span>${unit}</span></div>${MONEY_KEYS.has(k) ? '' : `<span class="kr-hint">${o.hint || ''}</span>`}</div>`;
}
function segField(phase, label) {
  const segs = phase === 'acc' ? plan.accSegs : plan.decSegs;
  if (segs.length === 1) return F(phase === 'acc' ? 'accRate' : 'decRate', label, segs[0].rate, '%', { link: phase === 'acc' ? 'rate' : null, hint: phase === 'acc' ? '' : '은퇴 뒤엔 보통 낮게' });
  return `<div class="field rp-f"><div class="rp-lb"><span>${label}</span><span data-tag="${phase === 'acc' ? 'rate' : ''}">${phase === 'acc' ? tagHtml('rate') : ''}</span></div>
    <button class="rp-segbtn" type="button" data-goto="segCard">구간별 ${esc(segText(segs))} <small>고치기</small></button><span class="kr-hint"></span></div>`;
}
function renderInput() {
  const p = plan, box = $('#planInput', root);
  box.innerHTML = `
    <div class="rp-head"><h2>내 노후 계획 숫자</h2><span class="cap">칸을 눌러 바로 고치세요 · <i class="link-tag">목표</i>는 목표 탭에서 온 값</span></div>
    <div class="rp-groups">
      <fieldset class="rp-group ages"><legend><span class="n">1</span>나이</legend>
        ${F('age', '지금 나이', p.age, '세')}
        ${F('retireAge', '은퇴 나이', p.retireAge, '세', { link: 'retireAge', hint: `${Math.max(0, p.retireAge - p.age)}년 모으기` })}
        ${F('endAge', '기대 수명', p.endAge, '세', { hint: `${Math.max(0, p.endAge - p.retireAge)}년 쓰기` })}
      </fieldset>
      <fieldset class="rp-group"><legend><span class="n">2</span>은퇴 전 — 모으기</legend>
        ${F('initial', '지금 모은 돈', won(p.initial), '원', { link: 'initial', extra: '<button class="linkbtn rp-assets" type="button" id="fromAssets">내 자산에서</button>' })}
        ${F('monthly', '매달 모을 돈', won(p.monthly), '원', { link: 'monthly' })}
        ${segField('acc', '연수익률')}
      </fieldset>
      <fieldset class="rp-group"><legend><span class="n">3</span>은퇴 후 — 쓰기</legend>
        ${F('expenseToday', '한 달 생활비 <span class="when-tag now">오늘 돈</span>', won(p.expenseToday), '원')}
        ${segField('dec', '은퇴 뒤 수익률')}
        ${F('inflation', '물가(연)', p.inflation, '%', { link: 'inflation' })}
      </fieldset>
      <fieldset class="rp-group rp-pens"><legend><span class="n">4</span>연금 <span class="when-tag now">오늘 돈</span></legend>
        <div class="rp-penlist">${p.pensions.map((x, i) => `<div class="rp-pen">
          <div class="rp-pen-top"><select class="input" data-pen="${i}" data-f="kind" aria-label="연금 종류">${PENSION_KINDS.map(([k, l]) => `<option value="${k}" ${x.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="linkbtn" type="button" data-penmore="${i}">자세히</button><button class="x-btn" type="button" data-rmpen="${i}" aria-label="이 연금 빼기">×</button></div>
          <div class="rp-pen-row"><div class="input-unit"><input class="input num" data-pen="${i}" data-f="monthly" data-money="KRW" inputmode="numeric" value="${won(x.monthly)}" aria-label="월액"><span>원</span></div><div class="input-unit"><input class="input num" data-pen="${i}" data-f="startAge" inputmode="numeric" value="${x.startAge}" aria-label="받기 시작 나이"><span>세부터</span></div></div>
        </div>`).join('') || '<p class="cap" style="margin:0">연금이 없으면 비워 두세요.</p>'}</div>
        <button class="btn small" type="button" id="addPen">+ 연금 추가</button>
      </fieldset>
    </div>
    <details class="rp-more"${p.monthlyGrowth || p.saveUntilAge || p.legacy ? ' open' : ''}><summary>더 넣기 — 적립액 매년 늘리기 · 적립 일찍 멈추기 · 남길 돈</summary>
      <div class="rp-more-grid">
        ${F('monthlyGrowth', '적립액 매년 증가', p.monthlyGrowth, '%')}
        ${F('saveUntilAge', '적립 멈추는 나이', p.saveUntilAge ?? '', '세', { attrs: 'placeholder="은퇴 때"' })}
        ${F('legacy', '기대 수명 때 남길 돈', won(p.legacy), '원')}
      </div></details>`;
  moneyHints(box);
  const parse = (v) => +String(v).replace(/[^\d.\-]/g, '');
  $$('[data-k]', box).forEach((x) => x.addEventListener('input', () => {
    const k = x.dataset.k, v = x.value.trim();
    const val = v === '' ? (k === 'saveUntilAge' ? null : 0) : parse(v);
    if (k === 'accRate') { plan.accSegs[0].rate = val; unlink('rate'); }
    else if (k === 'decRate') plan.decSegs[0].rate = val;
    else { plan[k] = val; if (LINK_KEYS.includes(k)) unlink(k); }
    if (MONEY_KEYS.has(k) && v) x.value = won(parse(v));
    if (k === 'age' && syncFromGoal(plan)) refreshValues();
    refreshHints();
    changed();
  }));
  $$('[data-pen]', box).forEach((x) => x.addEventListener(x.tagName === 'SELECT' ? 'change' : 'input', () => { const pe = plan.pensions[+x.dataset.pen]; const f = x.dataset.f; pe[f] = f === 'kind' ? x.value : x.value === '' ? null : parse(x.value); if (f === 'monthly' && x.value.trim()) x.value = won(parse(x.value)); changed(); }));
  $$('[data-rmpen]', box).forEach((x) => { x.onclick = () => { plan.pensions.splice(+x.dataset.rmpen, 1); changed(true); }; });
  $$('[data-penmore]', box).forEach((x) => { x.onclick = () => editPension(+x.dataset.penmore); });
  $('#addPen', box).onclick = () => { plan.pensions.push({ kind: 'national', monthly: 1000000, startAge: 65, indexed: true, years: null }); changed(true); };
  $('#fromAssets', box).onclick = () => requestAssetsTotal((total, label) => { if (!total) { toast('내 자산 탭에 등록된 자산이 없어요.'); return; } plan.initial = Math.round(total); unlink('initial'); changed(true); toast(`${label} ${fmtKRW(total)}을 불러왔어요.`); });
  $$('[data-goto]', box).forEach((b) => { b.onclick = () => $(`#${b.dataset.goto}`, root)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); });
  wireRelink(box);
}
function wireRelink(box) {
  $$('[data-relink]', box).forEach((b) => { b.onclick = (e) => { e.preventDefault(); const k = b.dataset.relink; plan.link = { ...plan.link, [k]: true }; syncFromGoal(plan); save(); renderInput(); renderGoalStrip(); compute(); }; });
}
function unlink(k) {
  if (!plan.link?.[k]) return;
  plan.link = { ...plan.link, [k]: false };
  const t = $(`[data-tag="${k}"]`, root); if (t) t.innerHTML = tagHtml(k);
  wireRelink($('#planInput', root));
}
function refreshValues() { // 연결 칸이 바뀌었을 때 값만 다시 씀(입력 중인 칸은 그대로)
  const set = (k, v) => { const x = $(`[data-k="${k}"]`, root); if (x && document.activeElement !== x) x.value = v; };
  set('retireAge', plan.retireAge); set('initial', won(plan.initial)); set('monthly', won(plan.monthly)); set('inflation', plan.inflation);
  if (plan.accSegs.length === 1) set('accRate', plan.accSegs[0].rate);
  moneyHints($('#planInput', root));
}
function refreshHints() {
  const h = (k, t) => { const x = $(`[data-k="${k}"]`, root)?.closest('.rp-f')?.querySelector('.kr-hint'); if (x) x.textContent = t; };
  h('retireAge', `${Math.max(0, plan.retireAge - plan.age)}년 모으기`); h('endAge', `${Math.max(0, plan.endAge - plan.retireAge)}년 쓰기`);
}
function editPension(i) {
  const x = plan.pensions[i];
  const s = sheet(`<h3>${esc(PENSION_KINDS.find((k) => k[0] === x.kind)?.[1] || '연금')} 자세히</h3><div class="stack">
    <label class="field">받는 기간(비우면 평생)<div class="input-unit"><input class="input num" id="pe_years" inputmode="numeric" value="${x.years ?? ''}" placeholder="평생"><span>년</span></div></label>
    <label class="toggle"><input type="checkbox" id="pe_idx" ${x.indexed !== false ? 'checked' : ''}> 물가만큼 오름(공적연금은 보통 켬)</label>
    <p class="cap">공무원연금은 공무원연금공단 ‘예상퇴직급여’, 국민연금은 ‘내 연금 알아보기’ 금액을 오늘 돈으로 넣으세요.</p></div>
    <div class="actions"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" data-ok>저장</button></div>`);
  $('[data-close]', s.root).onclick = s.close;
  $('[data-ok]', s.root).onclick = () => { const y = $('#pe_years', s.root).value.trim(); x.years = y ? +y : null; x.indexed = $('#pe_idx', s.root).checked; s.close(); changed(); };
}
const changed = debounce((rerenderInput = false) => { plan.example = false; save(); if (rerenderInput) renderInput(); renderGoalStrip(); compute(); }, 150);

// ------------------------------------------------------------------ 계산·결과
function compute() {
  try { res = computePlan(plan); } catch (e) { console.error(e); $('#planResult', root).innerHTML = `<p class="empty">${esc(e.message)}</p>`; return; }
  renderResult();
  renderMore();
}
const disc = (m) => Math.pow(1 + res.infl, m / 12);

function renderResult() {
  const p = plan, R = $('#planResult', root);
  const lp = res.lp, Mr = res.Mr, short = res.gap < 0;
  const errs = [res.errAcc, res.errDec].filter(Boolean);
  if (p.endAge <= p.retireAge) errs.push('기대 수명은 은퇴 나이보다 커야 해요.');
  const goalT = G?.target;
  const B = (t, tone = '') => `<b${tone ? ` class="t-${tone}"` : ''}>${esc(t)}</b>`;
  const goalLine = goalT ? (lp.fvAtRetire >= goalT ? ` 목표 ${fmtKRW(goalT)}은 ${B('넘었어요', 'good')}.` : ` 목표 ${fmtKRW(goalT)}까지는 ${B(`${fmtKRW(goalT - lp.fvAtRetire)} 모자라요`, 'bad')}.`) : '';
  const verdict = `${p.retireAge}세에 ${B(fmtKRW(lp.fvAtRetire))}이 모여요. 생활비로 필요한 ${fmtKRW(lp.needAtRetire)}${short ? `보다 ${B(`${fmtKRW(-res.gap)} 부족`, 'bad')}해요.` : `보다 ${B(`${fmtKRW(res.gap)} 여유`, 'good')}가 있어요.`}${goalLine} `
    + (lp.depletionAge != null ? `이대로면 자산이 ${B(`${lp.depletionAgeYears}세 ${lp.depletionAgeMonths}개월`, 'bad')}에 바닥나요.` : `${B(`${p.endAge}세에도 ${fmtKRW(lp.endBalance)}`, 'good')}이 남아요.`);
  const pen0 = lp.rows[0]?.pension || 0, exp0 = lp.rows[0]?.expense || 0;
  const kpis = [
    [`${p.retireAge}세에 모일 돈`, fmtKRW(lp.fvAtRetire), goalT ? (lp.fvAtRetire >= goalT ? `✓ 목표 ${fmtKRWShort(goalT)} 넘음` : `목표 ${fmtKRWShort(goalT)}까지 ${fmtKRWShort(goalT - lp.fvAtRetire)}`) : `넣은 돈 ${fmtKRWShort(lp.totalContrib)}`, goalT ? (lp.fvAtRetire >= goalT ? 'good' : 'bad') : ''],
    [`${p.retireAge}세에 필요한 돈`, fmtKRW(lp.needAtRetire), `생활비·연금으로 계산 · 오늘 돈 ${fmtKRWShort(lp.needToday)}`, ''],
    ['은퇴 첫 달 생활비', fmtKRW(exp0), pen0 ? `연금 ${fmtKRWShort(pen0)} + 꺼내 쓸 돈 ${fmtKRWShort(Math.max(0, exp0 - pen0))}` : '연금 받기 전 · 모두 꺼내 써요', ''],
    lp.depletionAge != null ? ['자산이 바닥나는 나이', `${lp.depletionAgeYears}세 ${lp.depletionAgeMonths}개월`, `기대 수명 ${p.endAge}세보다 ${Math.max(0, p.endAge - lp.depletionAgeYears)}년 빨라요`, 'bad'] : [`${p.endAge}세에 남는 돈`, fmtKRW(lp.endBalance), `오늘 돈 ${fmtKRWShort(lp.endBalance / disc(lp.path.length - 1))}`, 'good'],
  ];
  const goalLow = goalT && short && goalT < lp.needAtRetire;
  const stampKey = short ? 'bad' : 'good';
  const slam = stampKey !== lastStamp; lastStamp = stampKey;
  R.innerHTML = `
    ${errs.length ? `<div class="stale-bar">⚠ ${esc(errs.join(' '))}</div>` : ''}
    <div class="rp-res-head">
      <div class="rp-hero">
        <div class="rp-hero-lb">${p.retireAge}세 은퇴 때 ${short ? '모자라는 돈' : '남는 여유'} <span class="cap">(그해 통장 숫자 · 오늘 돈 ${esc(fmtKRWShort(Math.abs(res.gap) / disc(Mr)))})</span></div>
        <div class="rp-hero-row"><span class="rp-hero-v t-${stampKey}">${short ? '−' : '+'}${esc(fmtKRW(Math.abs(res.gap)))}</span><span class="stamp ${stampKey}${slam ? ' slam' : ''}" role="img" aria-label="${short ? '은퇴 때 부족' : '여유로운 은퇴'}">${short ? '은퇴 때 부족!' : '여유로운 은퇴!'}</span></div>
        <p class="rp-verdict">${verdict}</p>
        ${goalLow ? `<p class="rp-goallow">목표를 정할 때보다 은퇴 뒤 쓸 돈이 더 커서 그래요. <button class="btn small" type="button" id="needToGoal">필요한 돈 ${esc(fmtKRW(lp.needAtRetire))}을 목표로 →</button></p>` : ''}
      </div>
      <button class="btn small" type="button" id="toFinder">이 계획에 필요한 연 ${fmtPct(needRate())} → 투자 규칙 찾기</button>
    </div>
    <div class="chart-tools rp-chart-tools"><div class="legend" id="planLegend"></div><span class="cap">모든 금액은 그해 통장 숫자</span></div>
    <div class="readout" id="planReadout"></div>
    <div class="chart-box"><div class="chart" id="planChart" role="img" aria-label="나이별 자산"></div></div>
    <div class="kpis rp-kpis">${kpis.map(([lb, v, c, tone]) => `<div class="kpi"><div class="lb">${esc(lb)}</div><div class="v${tone ? ` t-${tone}` : ''}">${v}</div><div class="cmp">${esc(c)}</div></div>`).join('')}</div>
    ${res.alts.length ? `<div class="rp-alts"><span class="gs-lb">이렇게 바꾸면? <span class="faint">누르면 그래프에 점선으로 · 한 번 더 누르면 계획에 넣기</span></span><div class="alt-chips" id="altChips">${res.alts.map((a, i) => `<button class="alt-chip" type="button" data-a="${i}" aria-pressed="${altPreview === i}"><b>${esc(altTitle(a))}</b>${esc(a.label)}${altPreview === i ? ' · 다시 누르면 넣기' : ''}</button>`).join('')}</div></div>` : ''}`;
  $('#toFinder', R).onclick = () => goFinder(needRate() * 100, plan.retireAge - plan.age);
  $('#needToGoal', R)?.addEventListener('click', () => {
    const g = loadGoal(), before = structuredClone(g);
    g.scale = { ...g.scale, then: Math.round(lp.needAtRetire), years: Math.max(1, plan.retireAge - plan.age), last: 'then' };
    g.calc = { ...g.calc, link: 'scale' }; g.inflation = +plan.inflation;
    store('ss.goal', g); location.hash = '#goal';
    setTimeout(() => toast('필요한 돈을 목표 탭 저울 오른쪽에 넣었어요.', { label: '되돌리기', fn: () => { store('ss.goal', before); window.dispatchEvent(new CustomEvent('goal:reload')); } }), 80);
  });
  $$('#altChips [data-a]', R).forEach((b) => { b.onclick = () => {
    const i = +b.dataset.a;
    if (altPreview === i) { // 두 번째 누름: 계획에 넣기
      const a = res.alts[i], before = structuredClone(plan);
      Object.assign(plan, structuredClone(a.apply));
      ['monthly', 'retireAge'].forEach((k) => { if (a.apply[k] != null) plan.link = { ...plan.link, [k]: false }; });
      if (a.apply.accSegs) plan.link = { ...plan.link, rate: false };
      altPreview = null; plan.example = false; save(); renderInput(); renderGoalStrip(); compute();
      toast('계획에 넣었어요.', { label: '되돌리기', fn: () => { P.list[P.active] = before; save(); render(); } });
      return;
    }
    altPreview = i; renderResult();
  }; });
  drawPlanChart();
}
function goFinder(ratePct, years) {
  const pre = { targetCagr: +(+ratePct).toFixed(1), years: [5, 10, 15, 20].reduce((a, y) => (Math.abs(y - years) < Math.abs(a - years) ? y : a), 15) };
  sessionStorage.setItem('ss.finderPrefill', JSON.stringify(pre));
  location.hash = '#finder';
  window.dispatchEvent(new CustomEvent('finder:prefill', { detail: pre }));
}
/** 계획에 필요한 연수익률(부족하면 역산값, 아니면 지금 가정의 평균) */
function needRate() {
  const alt = res.alts.find((a) => a.id === 'rate');
  if (alt?.single != null) return alt.single;
  const segs = plan.accSegs; const n = plan.retireAge - plan.age;
  let tot = 0; for (let y = 1; y <= n; y++) { const g = segs.find((x) => x.from <= y && (x.to == null || y <= x.to)) || segs[segs.length - 1]; tot += +g.rate; }
  return n > 0 ? tot / n / 100 : 0.05;
}
function altTitle(a) {
  if (a.id === 'monthly') return `월 ${fmtKRW(a.value)} 적립 (+${fmtKRW(a.value - a.from)})`;
  if (a.id === 'rate') return `수익률 ${a.value >= 0 ? '+' : ''}${(a.value * 100).toFixed(2)}%p`;
  if (a.id === 'retire') return `${a.value}세 은퇴 (+${a.value - a.from}년)`;
  if (a.id === 'expense') return `생활비 월 ${fmtKRW(a.value)}`;
  return a.label;
}

const xOfMonth = (m) => plan.age + m / 12;
function drawPlanChart() {
  const p = plan, path = res.lp.path, Mr = res.Mr;
  const data = path.map((v, m) => [xOfMonth(m), v]);
  // 기대 수명까지 축을 늘리고, 돈이 바닥난 뒤 구간은 빨갛게
  const endM = Math.round((+p.endAge - +p.age) * 12);
  const lastM = Math.max(path.length - 1, endM);
  let dec = data.slice(Mr), gapArea;
  if (res.lp.depletionAge != null && path.length - 1 < endM) {
    dec = dec.concat([[xOfMonth(endM), 0]]);
    const yrs = Math.round((endM - (path.length - 1)) / 12);
    gapArea = { silent: true, itemStyle: { color: css('--st-bad-bg'), opacity: 0.6 }, label: { show: true, position: 'insideTop', formatter: `돈이 없는 ${yrs}년`, color: css('--st-bad'), fontWeight: 700, fontSize: 12 }, data: [[{ xAxis: xOfMonth(path.length - 1) }, { xAxis: xOfMonth(endM) }]] };
  }
  const series = [
    { name: '모으는 동안', color: css('--series-1'), area: true, data: data.slice(0, Mr + 1) },
    { name: '쓰는 동안', color: css('--series-2'), area: true, data: dec, markArea: gapArea },
    { name: '필요한 돈', color: css('--text-2'), dashed: true, width: 1.5, data: [[xOfMonth(0), res.lp.needAtRetire], [xOfMonth(Mr), res.lp.needAtRetire]], tooltipHide: true },
  ];
  if (G?.target) series.push({ name: '목표', color: css('--accent'), dashed: true, width: 1.5, data: [[xOfMonth(0), G.target], [xOfMonth(Mr), G.target]], tooltipHide: true });
  if (altPreview != null && res.alts[altPreview]) {
    const alt = res.alts[altPreview];
    const r2 = computePlan({ ...p, ...alt.apply, _noAlt: true });
    series.push({ name: `바꾸면: ${alt.label}`, color: css('--series-3'), dashed: true, width: 2, data: r2.lp.path.map((v, m) => [xOfMonth(m), v]) });
  }
  const act = actualPoints();
  if (act.length) series.push({ name: '실제', color: css('--text-1'), width: 0.01, data: act.map((a) => [xOfMonth(a.m), a.v]), z: 5 });
  $('#planLegend', root).innerHTML = series.map((s) => `<button type="button" aria-pressed="true"><i style="background:${s.dashed ? `repeating-linear-gradient(90deg, ${s.color} 0 4px, transparent 4px 7px)` : s.color}"></i>${esc(s.name)}</button>`).join('');
  const c = lineChart($('#planChart', root), {
    series, xType: 'value', isTime: false, xFmt: (x) => `${Math.floor(x)}세`, xMin: xOfMonth(0), xMax: xOfMonth(lastM),
    yFmt: (v, ax) => (ax ? fmtKRWShort(v) : fmtKRW(v)), yMin: 0, readout: isMobile() ? $('#planReadout', root) : null, grid: { left: 64, right: 20, containLabel: false, bottom: 28 },
  });
  if (c && act.length) {
    const opt = c.getOption();
    const i = opt.series.findIndex((s) => s.name === '실제');
    opt.series[i] = { ...opt.series[i], showSymbol: true, symbol: 'circle', symbolSize: 9, lineStyle: { width: 0 }, itemStyle: { color: css('--text-1'), borderColor: css('--bg-surface'), borderWidth: 2 } };
    c.setOption({ series: opt.series });
  }
  if (c) c.setOption({ series: [{ name: '모으는 동안', markLine: { silent: true, symbol: 'none', label: { formatter: `${p.retireAge}세 은퇴`, color: css('--text-2'), fontSize: 11 }, lineStyle: { color: css('--text-3'), type: 'solid' }, data: [{ xAxis: p.retireAge }] } }] });
}

// ------------------------------------------------------------------ 아래 카드: 목적이 보이는 질문형 제목 + 한 줄 설명
function card(id, title, why, body, wide = false) {
  return `<section class="rp-card${wide ? ' wide' : ''}" id="${id}"><header><h3>${title}</h3><p class="cap">${why}</p></header><div class="rp-card-body">${body}</div></section>`;
}
function renderMore() {
  const box = $('#planMore', root);
  box.innerHTML = [
    card('lifeCard', '목돈은 언제 들어오고 나가나요?', '자녀 등록금·집·퇴직금처럼 한 번에 오가는 돈을 나이에 꽂아 두면 위 그래프에 반영돼요. 핀을 누르면 고쳐요.', lifeBar()),
    card('segCard', '수익률을 구간마다 다르게 잡을까요?', '은퇴가 가까울수록 안전하게 굴린다면 구간마다 수익률을 다르게 넣으세요. 경계를 끌거나 숫자를 고쳐요.', '<div id="segEditor"></div>'),
    card('incomeCard', `${plan.retireAge}세 자산으로 한 달에 얼마 쓸 수 있나요?`, '모인 돈에서 해마다 몇 %씩 꺼내 쓰면 매달 얼마가 되는지, 거꾸로 원하는 생활비엔 얼마가 필요한지 봐요.', '<div id="incomeBox" class="rp-income"></div>', true),
    `<section class="rp-card wide rp-track" id="trackCard"><div id="trackBox"></div></section>`,
    `<section class="rp-card wide rp-years"><details class="more"><summary>나이별 표 — 해마다 자산(그해 통장 숫자 · 오늘 돈)</summary><div id="yearTbl"></div></details></section>`,
  ].join('');
  wireLifeBar(box);
  renderSegEditor();
  renderIncome();
  renderTrack();
  renderYearTable();
}

/** 나이 띠: 모으는 기간 | 쓰는 기간 + 목돈 핀, 아래 큰 버튼 두 개 */
function lifeBar() {
  const a0 = +plan.age, aR = +plan.retireAge, aE = +plan.endAge;
  const sp = Math.max(1, aE - a0);
  const pos = (a) => Math.max(0, Math.min(100, ((a - a0) / sp) * 100));
  const pins = plan.events.map((e, i) => ({ e, i, x: pos(+e.age) })).sort((a, b) => a.x - b.x);
  let lastX = -100, alt = false; pins.forEach((p) => { p.alt = p.x - lastX < 12 ? !alt : false; alt = p.alt; lastX = p.x; });
  return `<div class="life${pins.some((p) => p.alt) ? ' has-alt' : ''}" aria-label="나이 띠">
    <div class="life-pins">${pins.map((p) => `<button type="button" class="pin ${p.e.dir === 'in' ? 'in' : 'out'}${p.alt ? ' alt' : ''}" style="left:${p.x}%" data-pin="${p.i}" title="${esc(p.e.name)} 고치기"><b>${p.e.dir === 'in' ? '+' : '−'}${esc(fmtKRWShort(p.e.amount))}</b><span>${esc(p.e.name)}${(p.e.years || 1) > 1 ? ` ×${p.e.years}년` : ''}</span></button>`).join('')}</div>
    <div class="life-bar" id="lifeBar" title="빈 곳을 누르면 그 나이에 목돈을 넣어요"><i class="acc" style="width:${pos(aR)}%">모으는 ${aR - a0}년</i><i class="dec" style="width:${100 - pos(aR)}%">쓰는 ${aE - aR}년</i>${pins.map((p) => `<span class="tick" style="left:${p.x}%"></span>`).join('')}</div>
    <div class="life-axis"><span>${a0}세</span><span style="left:${pos(aR)}%">${aR}세 은퇴</span><span class="end">${aE}세</span></div>
    <div class="ev-add"><button class="btn" type="button" data-addev="out">+ 목돈 나감 <small>등록금·집·차</small></button><button class="btn" type="button" data-addev="in">+ 목돈 들어옴 <small>퇴직금·상속</small></button></div>
    ${plan.events.length ? '' : '<p class="cap" style="margin:8px 0 0">아직 넣은 목돈이 없어요.</p>'}
  </div>`;
}
function wireLifeBar(R) {
  $$('[data-addev]', R).forEach((b) => { b.onclick = () => editEvent(null, b.dataset.addev); });
  $$('[data-pin]', R).forEach((b) => { b.onclick = () => editEvent(+b.dataset.pin); });
  $('#lifeBar', R)?.addEventListener('click', (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    editEvent(null, 'out', Math.round(+plan.age + ((e.clientX - r.left) / r.width) * (+plan.endAge - +plan.age)));
  });
}
function editEvent(i, dir = 'out', age = null) {
  const e = i != null ? structuredClone(plan.events[i]) : { name: dir === 'in' ? '들어올 돈' : '목돈 지출', age: age ?? plan.age + 5, amount: 30000000, years: 1, dir, inflate: true };
  const s = sheet(`<h3>${i != null ? '목돈 고치기' : e.dir === 'in' ? '목돈 들어옴' : '목돈 나감'}</h3><div class="stack">
    <div class="seg" id="evDir"><button type="button" data-v="out" aria-pressed="${e.dir !== 'in'}">나감(지출)</button><button type="button" data-v="in" aria-pressed="${e.dir === 'in'}">들어옴</button></div>
    <label class="field">이름<input class="input" id="evName" value="${esc(e.name)}" placeholder="예: 자녀 대학 등록금"></label>
    <div class="grid2"><label class="field">몇 살 때<div class="input-unit"><input class="input num" id="evAge" inputmode="numeric" value="${e.age}"><span>세</span></div></label>
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

function renderSegEditor() {
  const box = $('#segEditor', root);
  const accYears = Math.max(1, plan.retireAge - plan.age);
  const decYears = Math.max(1, plan.endAge - plan.retireAge);
  const total = accYears + decYears;
  const pct = (y) => `calc(64px + (100% - 84px) * ${y / total})`;
  const segsOf = (phase) => (phase === 'acc' ? plan.accSegs : plan.decSegs);
  const spanOf = (phase) => (phase === 'acc' ? accYears : decYears);
  const offset = (phase) => (phase === 'acc' ? 0 : accYears);
  const bars = [];
  for (const phase of ['acc', 'dec']) {
    const segs = segsOf(phase), n = spanOf(phase);
    segs.forEach((s, i) => {
      const a = s.from - 1, b = Math.min(n, s.to == null ? n : s.to);
      if (a >= n) return;
      bars.push(`<div class="tseg ${phase} ${selSeg.phase === phase && selSeg.i === i ? 'sel' : ''}" data-phase="${phase}" data-i="${i}" style="left:${pct(offset(phase) + a)};width:calc((100% - 84px) * ${(b - a) / total})">연 ${(+s.rate).toFixed(1)}%</div>`);
      if (i < segs.length - 1 && s.to != null && s.to < n) bars.push(`<div class="knob" role="slider" tabindex="0" aria-label="구간 경계" aria-valuenow="${s.to}" data-phase="${phase}" data-i="${i}" style="left:${pct(offset(phase) + s.to)}"></div>`);
    });
  }
  const ticks = [];
  const step = total > 40 ? 10 : total > 15 ? 5 : total > 6 ? 2 : 1;
  for (let y = 0; y <= total; y += step) ticks.push(`<span style="left:${pct(y)}">${plan.age + y}</span>`);
  const list = (phase) => segsOf(phase).map((s, i) => `<div class="seg-row ${selSeg.phase === phase && selSeg.i === i ? 'sel' : ''}"><span class="tag ${phase}">${phase === 'acc' ? '모으기' : '쓰기'} ${i + 1}</span>
      <span>${plan.age + offset(phase) + s.from - 1}~${s.to ? plan.age + offset(phase) + s.to - 1 : (phase === 'acc' ? plan.retireAge - 1 : plan.endAge)}세</span>
      <div class="input-unit"><input class="input num" data-rate="${phase}-${i}" value="${s.rate}" inputmode="decimal" aria-label="수익률"><span>%</span></div>
      ${segsOf(phase).length > 1 ? `<button class="x-btn" type="button" data-rmseg="${phase}-${i}" aria-label="구간 합치기">×</button>` : '<span></span>'}</div>`).join('');
  box.innerHTML = `<div class="timeline" id="tl">${bars.join('')}<div class="ret-line" style="left:${pct(accYears)}"></div></div>
    <div class="tl-axis">${ticks.join('')}</div>
    <div class="row" style="margin-top:8px;gap:6px"><button class="btn small" type="button" id="splitSeg">+ 선택 구간 나누기</button>${PRESETS.map(([l], i) => `<button class="chip small" type="button" data-pre="${i}">${l}</button>`).join('')}</div>
    <div class="seg-list">${list('acc')}${list('dec')}</div>`;
  const afterSeg = () => { plan.example = false; save(); renderInput(); renderGoalStrip(); compute(); };
  $$('.tseg', box).forEach((b) => { b.onclick = () => { selSeg = { phase: b.dataset.phase, i: +b.dataset.i }; renderSegEditor(); $(`[data-rate="${selSeg.phase}-${selSeg.i}"]`, box)?.focus(); }; });
  $$('[data-rate]', box).forEach((x) => x.addEventListener('change', () => { const [ph, i] = x.dataset.rate.split('-'); segsOf(ph)[+i].rate = +x.value || 0; if (ph === 'acc') plan.link = { ...plan.link, rate: false }; afterSeg(); }));
  $$('[data-rmseg]', box).forEach((x) => { x.onclick = () => { const [ph, i] = x.dataset.rmseg.split('-'); const s = segsOf(ph); const k = +i; if (k > 0) { s[k - 1].to = s[k].to; s.splice(k, 1); } else { s[1].from = 1; s.splice(0, 1); } selSeg = { phase: ph, i: 0 }; afterSeg(); }; });
  $('#splitSeg', box).onclick = () => {
    const s = segsOf(selSeg.phase), seg = s[selSeg.i], n = spanOf(selSeg.phase);
    const end = seg.to ?? n; if (end - seg.from < 1) { toast('1년짜리 구간은 더 나눌 수 없어요.'); return; }
    const mid = Math.floor((seg.from + end) / 2);
    s.splice(selSeg.i + 1, 0, { from: mid + 1, to: seg.to, rate: seg.rate });
    seg.to = mid; if (selSeg.phase === 'acc') plan.link = { ...plan.link, rate: false }; afterSeg();
  };
  $$('[data-pre]', box).forEach((b) => { b.onclick = () => { plan.accSegs = PRESETS[+b.dataset.pre][1](accYears); plan.link = { ...plan.link, rate: false }; selSeg = { phase: 'acc', i: 0 }; afterSeg(); }; });
  const tl = $('#tl', box);
  $$('.knob', box).forEach((k) => {
    const ph = k.dataset.phase, i = +k.dataset.i, segs = segsOf(ph);
    const move = (to) => { const lo = segs[i].from, hi = (segs[i + 1].to ?? spanOf(ph)) - 1; to = Math.max(lo, Math.min(hi, to)); if (to !== segs[i].to) { segs[i].to = to; segs[i + 1].from = to + 1; save(); compute(); } };
    k.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') move(segs[i].to - 1); if (e.key === 'ArrowRight') move(segs[i].to + 1); });
    k.addEventListener('pointerdown', (e) => {
      e.preventDefault(); k.setPointerCapture(e.pointerId);
      const rect = tl.getBoundingClientRect();
      const onMove = (ev) => { const x = ev.clientX - rect.left - 64; const y = Math.round((x / (rect.width - 84)) * total) - offset(ph); const lo = segs[i].from, hi = (segs[i + 1].to ?? spanOf(ph)) - 1; const to = Math.max(lo, Math.min(hi, y)); if (to !== segs[i].to) { segs[i].to = to; segs[i + 1].from = to + 1; k.style.left = pct(offset(ph) + to); } };
      const up = () => { k.removeEventListener('pointermove', onMove); k.removeEventListener('pointerup', up); save(); compute(); };
      k.addEventListener('pointermove', onMove); k.addEventListener('pointerup', up);
    });
  });
}

function renderIncome() {
  const box = $('#incomeBox', root);
  const M = res.Mr, asset = res.lp.fvAtRetire;
  const pens = (plan.pensions || []).reduce((t, p) => t + (+p.monthly || 0), 0);
  const want = plan.wantMonthly || 3000000, rate = plan.wantRate || 4;
  box.innerHTML = `<div class="tbl-wrap rp-income-tbl"><table class="tbl"><thead><tr><th>해마다 꺼내는 비율</th><th class="num">매달(그해 숫자)</th><th class="num">매달(오늘 돈)</th>${pens ? '<th class="num">+ 연금(오늘 돈)</th>' : ''}</tr></thead><tbody>
    ${res.incomeTable.map((r) => `<tr${r.rate === 4 ? ' class="hl-row"' : ''}><td>${r.rate}%${r.rate === 4 ? ' <span class="cap">4% 규칙</span>' : ''}</td><td class="num">${fmtKRW(r.monthly)}</td><td class="num">${fmtKRW(r.monthlyToday)}</td>${pens ? `<td class="num">${fmtKRW(r.monthlyToday + pens)}</td>` : ''}</tr>`).join('')}</tbody></table></div>
    <div class="rp-income-rev"><h4>거꾸로 — 원하는 생활비엔 얼마가 필요할까?</h4>
    <div class="rp-want">
      <label class="field">매달 이만큼 쓰고 싶다면 <span class="when-tag now">오늘 돈</span><div class="input-unit"><input class="input num" id="wantM" inputmode="numeric" data-money="KRW" value="${want.toLocaleString('ko-KR')}"><span>원</span></div></label>
      <label class="field">꺼내는 비율<div class="input-unit"><input class="input num" id="wantR" inputmode="decimal" value="${rate}"><span>%</span></div><span class="kr-hint"></span></label>
    </div>
    <p id="wantOut" class="rp-wantout"></p>
    <p class="cap">‘4% 규칙’은 은퇴 자산의 4%를 해마다 꺼내 쓰는 방식이에요. 비율이 높을수록 자산이 빨리 줄어요.</p></div>`;
  moneyHints(box);
  const upd = () => {
    const w = +$('#wantM', box).value.replace(/[^\d]/g, '') || 0, r = +$('#wantR', box).value || 4;
    plan.wantMonthly = w; plan.wantRate = r; store('ss.plans', P);
    const needToday = ((Math.max(0, w - pens) * 12) / (r / 100));
    const needThen = needToday * disc(M);
    $('#wantOut', box).innerHTML = `${pens ? `연금 ${fmtKRW(pens)}을 빼고 ` : ''}필요한 자산은 <b>${fmtKRW(needThen)}</b>(${plan.retireAge}세 통장 숫자 · 오늘 돈 ${fmtKRW(needToday)}). ${asset >= needThen ? '<span class="status-pill good">✓ 예상 자산으로 충분</span>' : `<span class="status-pill bad">! ${fmtKRW(needThen - asset)} 부족</span>`}`;
  };
  $('#wantM', box).addEventListener('input', (e) => { const v = e.target.value.replace(/[^\d]/g, ''); e.target.value = v ? (+v).toLocaleString('ko-KR') : ''; upd(); });
  $('#wantR', box).oninput = upd; upd();
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
  const path = res.lp.path;
  const owners = [...new Set((store('ss.holdings')?.accounts || []).map((a) => a.owner).filter(Boolean))];
  let body;
  if (!pts.length) {
    body = '';
  } else {
    const lastP = pts[pts.length - 1];
    const mi = Math.max(0, Math.min(path.length - 1, Math.round(lastP.m)));
    const planned = path[mi];
    const rate = planned ? lastP.v / planned : null;
    const first = pts[0];
    const yrs = (lastP.m - first.m) / 12;
    const cagr = yrs > 0.25 ? Math.pow(lastP.v / first.v, 1 / yrs) - 1 : null;
    body = `<div class="facts rp-facts"><div class="fact"><div class="lb">최근 실제 자산</div><div class="v">${fmtKRW(lastP.v)}</div><div class="cap">${lastP.date}</div></div>
      <div class="fact"><div class="lb">그때 계획 경로</div><div class="v">${fmtKRW(planned)}</div></div>
      <div class="fact"><div class="lb">계획 대비</div><div class="v">${rate ? `${(rate * 100).toFixed(1)}%` : '–'}</div><div class="cap">${rate && rate < 1 ? `${fmtKRW(planned - lastP.v)} 뒤처짐` : rate ? '계획보다 앞서 있어요' : ''}</div></div>
      <div class="fact"><div class="lb">실제 연평균 증가율</div><div class="v">${cagr == null ? '–' : fmtPct(cagr)}</div><div class="cap">적립 포함 · ${first.date}부터</div></div></div>
      ${rate && rate < 0.95 ? `<div class="rcard"><span class="st caution">! 주의</span><h4>계획 경로보다 ${((1 - rate) * 100).toFixed(1)}% 뒤처져 있어요</h4><div class="alt"><b>대안</b> 지금 자산 ${fmtKRW(lastP.v)}에서 다시 출발해 계산 <button class="btn small" type="button" id="rebase">다시 계산</button></div></div>` : ''}`;
  }
  box.innerHTML = `<div class="rp-track-head"><div><h3>계획대로 가고 있나요?</h3><p class="cap">내 자산 탭의 총액이나 직접 넣은 금액이 위 그래프에 점으로 찍히고, 계획 경로와 비교해요 · 계획 시작 ${plan.startedAt}</p></div><span class="spacer"></span>
      ${owners.length ? `<select class="input" id="trOwner" style="width:auto;min-height:34px"><option value="all">가족 전체</option>${owners.map((o) => `<option ${plan.track?.owner === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>` : ''}
      <button class="btn small" type="button" id="addActual">+ 실제 금액 기록</button></div>${body}`;
  $('#trOwner', box)?.addEventListener('change', (e) => { plan.track = { owner: e.target.value }; save(); compute(); });
  $('#addActual', box).onclick = () => {
    const s = sheet(`<h3>실제 자산 기록</h3><div class="stack"><label class="field">날짜<input class="input" type="date" id="ac_d" value="${new Date().toISOString().slice(0, 10)}"></label><label class="field">금액<div class="input-unit"><input class="input num" id="ac_v" inputmode="numeric" data-money="KRW"><span>원</span></div></label><label class="field">계획 시작일 바꾸기(선택)<input class="input" type="date" id="ac_s" value="${plan.startedAt}"></label></div><div class="actions"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" data-ok>기록</button></div>`);
    $('[data-close]', s.root).onclick = s.close;
    $('[data-ok]', s.root).onclick = () => { const v = +$('#ac_v', s.root).value.replace(/[^\d]/g, ''); if (v) plan.actuals.push({ date: $('#ac_d', s.root).value, value: v }); plan.startedAt = $('#ac_s', s.root).value || plan.startedAt; save(); s.close(); compute(); };
  };
  $('#rebase', box)?.addEventListener('click', () => { const lastP = pts[pts.length - 1]; plan.initial = Math.round(lastP.v); plan.link = { ...plan.link, initial: false }; plan.startedAt = lastP.date; save(); renderInput(); compute(); toast('지금 자산에서 다시 출발하도록 바꿨어요.'); });
}

function renderYearTable() {
  const box = $('#yearTbl', root);
  box.innerHTML = `<div class="tbl-wrap rp-income-tbl"><table class="tbl"><thead><tr><th>나이</th><th class="num">자산(그해 통장 숫자)</th><th class="num">자산(오늘 돈)</th></tr></thead><tbody>
    ${res.years.map((r) => `<tr><td>${Math.floor(r.age)}세 <span class="cap">${Math.round(r.age - plan.age)}년 뒤</span></td><td class="num">${fmtKRW(r.balance)}</td><td class="num">${fmtKRW(r.real)}</td></tr>`).join('')}</tbody></table></div>`;
}
