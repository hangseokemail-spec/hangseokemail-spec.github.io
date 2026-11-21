// 목표 탭 카드 두 장: ① 돈의 가치 저울(목표 금액 정하기) ② 실행 목표 만들기(네 가지 질문)
// 그림: GPT 디자이너 시안(scale.svg) · 문구·규칙: Opus 검토(01_opus_review.md) · 계산: core/goalcalc.js
// 2026-11-21 개편: 목표는 늘 '그때 통장 숫자'(오른쪽 접시) · 연도 대신 'N년 뒤' · 숫자로 넣기 보기 · 대안의 숫자를 직접 고치기
import { $, $$, popover, store } from '../ui/dom.js';
import { moneyHints } from '../ui/dom.js';
import { fmtKRW, fmtPct, esc, krRead } from '../ui/format.js';
import { toThen, toToday, solve, solveMonths, solveMonthsReal, scalePair, goalInputs } from '../core/goalcalc.js';

const ASKS = [['years', '걸리는 기간'], ['monthly', '매달 넣을 돈'], ['initial', '처음 목돈'], ['rate', '필요한 수익률']];
const won = (v) => (v == null || !isFinite(v) ? '' : Math.round(v).toLocaleString('ko-KR'));
const num = (v) => +String(v ?? '').replace(/[^\d.\-]/g, '') || 0;
const span = (m) => (m < 12 ? `${m}개월` : `${Math.floor(m / 12)}년${m % 12 ? ` ${m % 12}개월` : ''}`);
const pct1 = (r) => `${(r * 100).toFixed(1).replace('-', '−')}%`;
const yrsLb = (y) => (+y > 0 ? `${+y}년 뒤` : '올해');
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const SCALE_SVG = `<svg class="gs-svg" viewBox="0 0 360 170" aria-hidden="true">
  <g class="gs-stand"><path d="M180 44 206 160H154Z" fill="var(--bg-selected)" stroke="var(--border-strong)" stroke-width="1.5" stroke-linejoin="round"/><path d="M138 160h84" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/></g>
  <g class="gs-beam"><path d="M62 44h236" stroke="var(--text-2)" stroke-width="3" stroke-linecap="round"/><circle cx="180" cy="44" r="6" fill="var(--bg-surface)" stroke="var(--accent)" stroke-width="3"/></g>
  <g class="gs-pan l"><path d="M62 44 14 108M62 44 110 108" stroke="var(--border-strong)" stroke-width="1.5"/><path d="M6 108h112q-10 20-32 20H38q-22 0-32-20Z" fill="var(--bg-selected)" stroke="var(--text-2)" stroke-width="1.5"/><circle cx="62" cy="44" r="3" fill="var(--text-2)"/></g>
  <g class="gs-pan r"><path d="M298 44 250 108M298 44 346 108" stroke="var(--border-strong)" stroke-width="1.5"/><path d="M242 108h112q-10 20-32 20h-48q-22 0-32-20Z" fill="var(--bg-selected)" stroke="var(--text-2)" stroke-width="1.5"/><circle cx="298" cy="44" r="3" fill="var(--text-2)"/></g>
</svg>`;
const FLAG = '<svg class="gs-flagico" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 15V2"/><path d="M3 2h9l-2 3 2 3H3"/></svg>';

/** 예전 계획 고치기: 오늘 돈 기준 목표 → 그해 통장 숫자, 스위치 값 지우기 */
export function migratePlan(p) {
  if (p.goalBasis === 'today') { p.goalAmount = Math.round(p.goalAmount * Math.pow(1 + (+p.inflation || 0) / 100, Math.round((+p.goalYears || 0) * 12) / 12)); }
  delete p.goalBasis; delete p.showToday;
  return p;
}

/** 목표 탭 상태(계정별 저장). 없으면 예전 '목표·노후' 계획의 저울·실행 목표 값으로 만든다 */
export function loadGoal() {
  const g = store('ss.goal');
  if (g?.scale && g?.calc) return g;
  const P = store('ss.plans');
  const p = P?.list?.[P.active || 0];
  const inflation = +(p?.inflation ?? 2.5);
  let scale = p?.scale ? { ...p.scale } : null;
  if (!scale && p?.mode === 'goal') scale = { then: +p.goalAmount || 1e9, years: +p.goalYears || 20, last: 'then' };
  if (!scale) scale = { today: 3e8, years: 20, last: 'today' };
  const calc = p?.calc ? { ...p.calc } : { ask: 'monthly', initial: +(p?.initial ?? 5e7), monthly: +(p?.monthly ?? 1e6), rate: 6, years: scale.years };
  calc.link = 'scale'; delete calc.fromScale;
  const goal = { inflation, scale, calc, view: 'scale' };
  store('ss.goal', goal);
  return goal;
}

/**
 * hooks: { save(), toast(msg, action), toFinder(ratePct, years), toRetire(), fromAssets(cb), onSolved(info) }
 * onSolved: { ok, s(solve 결과), target, today, months, infl } — 아래 '모이는 모습' 그래프가 씀
 */
export function renderGoalCards(box, goal, hooks) {
  const S = goal.scale, C = goal.calc;
  const infl = () => (+goal.inflation || 0) / 100;
  const pair = () => scalePair(S, infl());
  box.innerHTML = `
  <div class="goal-cards">
   <div class="goal-cond">
    <section class="gcard gscale" aria-labelledby="gsTitle">
      <div class="gtitle-row"><span class="gstep">1</span><h2 class="gtitle" id="gsTitle">목표 금액 정하기 <small>돈의 가치 저울</small></h2><button class="help" type="button" id="gsHelp" aria-label="저울 설명">?</button>
        <div class="seg gs-view" role="group" aria-label="보는 방법"><button type="button" data-view="scale" aria-pressed="${goal.view !== 'num'}">저울로 보기</button><button type="button" data-view="num" aria-pressed="${goal.view === 'num'}">숫자로 넣기</button></div></div>
      <p class="gsub">물가가 오르면 같은 돈으로 살 수 있는 게 줄어요. 한쪽에 금액을 넣으면 다른 쪽이 같은 가치로 맞춰져요.</p>
      <div class="gs-wrap">
        <div class="gs-stage" ${goal.view === 'num' ? 'hidden' : ''}>
          ${SCALE_SVG}
          <label class="gs-plate l"><span class="gs-lb">오늘 돈 <span class="gs-kr" data-kr="today"></span></span><span class="gs-in"><input class="gs-amt" data-amt="today" inputmode="numeric" aria-label="오늘 돈"><i>원</i></span></label>
          <label class="gs-plate r"><span class="gs-flag" aria-hidden="true">${FLAG}목표</span><span class="gs-lb"><span data-then-lb></span> <span class="gs-kr" data-kr="then"></span></span><span class="gs-in"><input class="gs-amt" data-amt="then" inputmode="numeric" aria-label="그때 통장 숫자"><i>원</i></span></label>
        </div>
        <div class="gs-num" ${goal.view === 'num' ? '' : 'hidden'}>
          <label class="field"><span class="gs-lb">오늘 돈 <span class="gs-kr" data-kr="today"></span></span><span class="input-unit"><input class="input num" data-amt="today" inputmode="numeric" aria-label="오늘 돈"><span>원</span></span></label>
          <span class="gs-num-eq" aria-hidden="true">=</span>
          <label class="field gs-num-then"><span class="gs-lb"><span data-then-lb></span> <span class="gs-kr" data-kr="then"></span></span><span class="input-unit"><input class="input num" data-amt="then" inputmode="numeric" aria-label="그때 통장 숫자"><span>원</span></span></label>
        </div>
        <div class="gs-stand-in">
          <label class="field"><span class="gs-lb">기간</span><span class="input-unit"><input class="input num" id="gsYears" inputmode="numeric" value="${S.years}" aria-label="기간(년)"><span>년</span></span></label>
          <label class="field"><span class="gs-lb">물가(연)</span><span class="input-unit"><input class="input num" id="gsInfl" inputmode="decimal" value="${goal.inflation}" aria-label="물가 상승률(연, %)"><span>%</span></span></label>
        </div>
      </div>
      <p class="gs-equal" id="gsEqual" aria-live="polite"></p>
      <p class="gc-err" id="gsErr" aria-live="polite"></p>
      <div class="gs-goal" id="gsGoal"></div>
    </section>
    <section class="gcard gcalc" aria-labelledby="gcTitle">
      <div class="gtitle-row"><span class="gstep">2</span><h2 class="gtitle" id="gcTitle">어떻게 모을까 <small>실행 목표 만들기</small></h2></div>
      <p class="gsub">네 가지 중 궁금한 것 하나를 고르면, 나머지 숫자로 그 답을 계산해요.</p>
      <div class="gc-ask"><span class="gs-lb">무엇이 궁금해요?</span>
        <div class="gc-asks" role="group" aria-label="무엇이 궁금해요?">${ASKS.map(([k, l]) => `<button class="gc-askbtn" type="button" data-ask="${k}" aria-pressed="${C.ask === k}">${l}</button>`).join('')}</div></div>
      <div class="gc-target">
        <label class="field"><span class="gs-lb">목표 금액 <span class="when-tag then" id="gcTargetWhen"></span> <span class="gc-linktag" id="gcLinkTag">${FLAG}저울과 연결</span></span><span class="input-unit"><input class="input num" id="gcTarget" inputmode="numeric" data-money="KRW"><span>원</span></span></label>
        <div class="gc-targetnote" id="gcTargetNote"></div>
      </div>
      <div class="gc-params" id="gcParams"></div>
      <p class="gc-cap">수익률 한 가지 · 매달 같은 금액 · 월말에 넣는다고 보고 계산해요.</p>
    </section>
   </div>
    <section class="gcard ganswer" aria-labelledby="gaTitle">
      <h2 class="sr" id="gaTitle">답</h2>
      <div class="ganswer-grid">
        <div class="gc-answer" id="gcAnswer" role="status" aria-live="polite"></div>
        <div class="gc-alts" id="gcAlts"></div>
      </div>
    </section>
  </div>`;
  const hints = () => moneyHints(box);

  // ---------------- ① 저울
  const beam = $('.gs-beam', box), panL = $('.gs-pan.l', box), panR = $('.gs-pan.r', box), plL = $('.gs-plate.l', box), plR = $('.gs-plate.r', box);
  let tiltT = null;
  const tilt = (side, up) => { // 고친 쪽 금액이 커지면 그쪽이 내려감
    if (reduced() || goal.view === 'num') return;
    const down = (side === 'today') === up; const deg = down ? -3 : 3, dy = Math.sin((deg * Math.PI) / 180) * 118;
    const k = ($('.gs-svg', box)?.clientWidth || 360) / 360;
    beam.style.transform = `rotate(${deg}deg)`; panL.style.transform = `translateY(${-dy}px)`; panR.style.transform = `translateY(${dy}px)`;
    plL.style.transform = `translate(-50%, ${-dy * k}px)`; plR.style.transform = `translate(-50%, ${dy * k}px)`;
    clearTimeout(tiltT); tiltT = setTimeout(() => { [beam, panL, panR].forEach((x) => { x.style.transform = ''; }); plL.style.transform = ''; plR.style.transform = ''; }, 250);
  };
  /** 저울 숫자·이름표·같은 가치 문장·목표 상자를 다시 칠함(지금 입력 중인 칸은 건드리지 않음) */
  function paintScale() {
    const p = pair(), y = +S.years || 0;
    $$('[data-amt]', box).forEach((x) => { if (document.activeElement !== x) x.value = won(p[x.dataset.amt]); });
    // 괄호 속 한글 읽기: 지금 넣는 쪽은 정확히, 계산된 쪽은 두 단위로
    $$('[data-kr]', box).forEach((x) => { const k = x.dataset.kr; const v = p[k]; x.textContent = v > 0 ? `(${krRead(v, 'KRW', S.last === k)})` : ''; });
    $$('[data-then-lb]', box).forEach((x) => { x.textContent = `${yrsLb(y)} 통장 숫자`; });
    plR.classList.toggle('is-goal', C.link === 'scale');
    let t;
    if (!y) t = '같은 해라 금액도 같아요.';
    else if (!infl()) t = '물가가 그대로면 금액도 그대로예요.';
    else if (infl() < 0) t = `물가가 내리면 나중 숫자가 더 작아도 같은 가치예요. 오늘 <b>${esc(fmtKRW(p.today))}</b> = ${y}년 뒤 <b>${esc(fmtKRW(p.then))}</b>`;
    else t = `오늘 <b>${esc(fmtKRW(p.today))}</b>과 ${y}년 뒤 통장에 찍힐 <b>${esc(fmtKRW(p.then))}</b>은 <b>같은 가치</b>예요.`;
    $('#gsEqual', box).innerHTML = t;
    // 목표 상자: 목표는 늘 '그때 통장 숫자'
    const G = $('#gsGoal', box);
    if (C.link === 'scale') {
      G.innerHTML = `<div class="gs-goalbox">${FLAG}<div><b>목표 = ${esc(yrsLb(y))} 통장에 찍힐 ${esc(fmtKRW(p.then))}</b><small>오늘 돈 ${esc(fmtKRW(p.today))}의 가치를 지키려면 물가가 오른 만큼 통장 숫자도 커야 해요. 그래서 목표는 오른쪽 접시의 금액으로 잡아요.</small></div><span class="gs-goalarrow" aria-hidden="true">2번에 들어감 →</span></div>`;
    } else {
      G.innerHTML = `<div class="gs-goalbox off"><div><b>지금 목표는 직접 넣은 ${esc(fmtKRW(+C.target || 0))}이에요</b><small>저울 금액과 연결이 풀려 있어요.</small></div><button class="btn primary" type="button" id="gsUse">${esc(yrsLb(y))} 통장 숫자 ${esc(fmtKRW(p.then))}을 목표로 ▶</button></div>`;
      $('#gsUse', G).onclick = () => { const before = structuredClone(C); C.link = 'scale'; afterScale(); hooks.toast('저울의 금액을 목표로 넣었어요.', { label: '되돌리기', fn: () => { Object.assign(C, before); hooks.save(); paintScale(); drawParams(); drawCalc(); } }); flash(); };
    }
  }
  const flash = () => { const card = box.querySelector('.gcalc'); card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 700); };
  /** 저울이 바뀌면: 연결된 실행 목표도 따라 바꾸고 다시 계산 */
  function afterScale() { hooks.save(); paintScale(); if (C.link === 'scale') { syncFromScale(); drawParams(); drawCalc(); } }
  function syncFromScale() { const p = pair(); C.target = Math.round(p.then); if (C.ask !== 'years') C.years = +S.years || 0; }
  $$('[data-amt]', box).forEach((x) => {
    x.addEventListener('focus', () => x.select());
    x.addEventListener('input', () => {
      const k = x.dataset.amt, prev = pair()[k];
      const v = Math.max(0, num(x.value));
      S[k] = v; S.last = k;
      x.value = x.value.trim() ? won(v) : '';
      tilt(k, v >= prev); afterScale();
    });
    x.addEventListener('blur', () => paintScale());
  });
  $('#gsYears', box).addEventListener('input', (e) => { const v = num(e.target.value); $('#gsErr', box).textContent = v < 0 || v > 100 ? '기간은 0~100년으로 넣어 주세요.' : ''; S.years = Math.max(0, Math.min(100, Math.round(v))); afterScale(); });
  $('#gsInfl', box).addEventListener('input', (e) => { const v = num(e.target.value); $('#gsErr', box).textContent = v < -2 || v > 10 ? '물가는 −2%에서 10% 사이로 넣어 주세요.' : ''; goal.inflation = Math.max(-2, Math.min(10, v)); afterScale(); });
  $$('[data-view]', box).forEach((b) => { b.onclick = () => {
    goal.view = b.dataset.view; hooks.save();
    $$('[data-view]', box).forEach((q) => q.setAttribute('aria-pressed', String(q === b)));
    $('.gs-stage', box).hidden = goal.view === 'num'; $('.gs-num', box).hidden = goal.view !== 'num';
    paintScale();
  }; });
  $('#gsHelp', box).onclick = (e) => { const p = pair(); popover(e.currentTarget, `<b>돈의 가치 저울</b><p style="margin:6px 0">왼쪽은 오늘 물가로 본 돈, 오른쪽은 나중에 통장에 실제로 찍힐 숫자예요. 물가가 해마다 ${goal.inflation}%씩 오르면 ${S.years}년 뒤엔 ${esc(fmtKRW(p.then))}이 있어야 오늘 ${esc(fmtKRW(p.today))}만큼 살 수 있어요.</p><p class="cap" style="margin:0">예) 오늘 1만원짜리 국밥 → ${esc(yrsLb(+S.years || 0))} ${Math.round(toThen(10000, +S.years || 0, infl())).toLocaleString('ko-KR')}원</p>`); };

  // ---------------- ② 실행 목표
  const fieldHtml = (k, label, val, unit, money, extra = '') => C.ask === k
    ? `<div class="field gc-q"><span class="gs-lb">${label}</span><output class="gc-qcell" aria-label="${label}: 아래에 답">?</output><span class="kr-hint"></span></div>`
    : `<label class="field"><span class="gs-lb">${label}${extra}</span><span class="input-unit"><input class="input num" data-c="${k}" inputmode="${money ? 'numeric' : 'decimal'}" ${money ? 'data-money="KRW"' : ''} value="${val}"><span>${unit}</span></span>${money ? '' : '<span class="kr-hint"></span>'}</label>`;
  function drawParams() {
    $('#gcParams', box).innerHTML = [
      fieldHtml('initial', '지금 목돈', won(C.initial), '원', true, ' <button class="linkbtn" type="button" id="gcAssets">내 자산에서</button>'),
      fieldHtml('monthly', '매달 넣을 돈', won(C.monthly), '원', true),
      fieldHtml('rate', '연수익률', C.rate, '%', false),
      fieldHtml('years', '기간', C.ask !== 'years' && C.link === 'scale' ? S.years : C.years, '년', false),
    ].join('');
    $$('[data-c]', box).forEach((x) => x.addEventListener('input', () => {
      const k = x.dataset.c, v = num(x.value);
      if (k === 'initial' || k === 'monthly') { C[k] = Math.max(0, v); x.value = x.value.trim() ? won(C[k]) : ''; }
      else if (k === 'rate') C.rate = v;
      else { C.years = Math.max(0, Math.min(100, Math.round(v))); if (C.link === 'scale') { S.years = C.years; $('#gsYears', box).value = S.years; paintScale(); syncFromScale(); } }
      hooks.save(); drawCalc(); hints();
    }));
    $('#gcAssets', box)?.addEventListener('click', (e) => { e.preventDefault(); hooks.fromAssets((total) => { C.initial = Math.round(total); hooks.save(); drawParams(); drawCalc(); }); });
    hints();
  }
  let last = null;
  function drawCalc() {
    const gi = goalInputs(goal);
    const v = gi.inp, yrs = gi.years;
    const tgt = $('#gcTarget', box);
    if (document.activeElement !== tgt) tgt.value = won(gi.target);
    $('#gcTargetWhen', box).textContent = C.ask === 'years' ? (gi.linked ? `${yrsLb(+S.years || 0)} 통장 숫자` : '그때 통장 숫자') : `${yrsLb(yrs)} 통장 숫자`;
    $('#gcLinkTag', box).hidden = !gi.linked;
    $('#gcTargetNote', box).innerHTML = gi.linked ? '' : '<button class="linkbtn" type="button" id="gcRelink">저울 금액과 다시 연결</button>';
    $('#gcRelink', box)?.addEventListener('click', () => { C.link = 'scale'; afterScale(); flash(); });
    // 입력 오류
    const err = !(v.target > 0) ? '목표 금액을 넣어 주세요.' : (C.ask !== 'years' && yrs > 100) ? '기간은 100년까지 넣을 수 있어요.' : (C.ask !== 'rate' && (+C.rate < -50 || +C.rate > 100)) ? '수익률은 −50%에서 100% 사이로 넣어 주세요.'
      : (C.ask === 'monthly' && !(v.months > 0)) ? '기간을 1년 이상 넣어 주세요.' : '';
    const A = $('#gcAnswer', box);
    if (err) { A.innerHTML = `<p class="gc-err">${esc(err)}</p>`; $('#gcAlts', box).innerHTML = ''; last = null; hooks.onSolved?.({ ok: false }); return; }
    const s = solve(C.ask, v); last = s;
    const a = s.ans;
    let head, small = '', line = '', extra = '', pill = '', ok = true;
    if (C.ask === 'years') {
      if (a.status === 'already') { head = '지금 바로 닿아요'; line = `지금 목돈 ${fmtKRW(v.initial)}이 목표 ${fmtKRW(v.target)}보다 ${fmtKRW(v.initial - v.target)} 많아요.`; }
      else if (a.status === 'ok') {
        head = `${span(a.months)} 걸려요`;
        line = `그때 통장에 ${fmtKRW(s.end)}이 모여 목표 ${fmtKRW(v.target)}을 넘어요.`;
        if (gi.linked) { const r = solveMonthsReal({ today: gi.pair.today, infl: infl(), initial: v.initial, monthlyAmt: v.monthlyAmt, rate: v.rate }); if (r && Math.abs(r.months - a.months) >= 1) extra = `오늘 돈 ${fmtKRW(gi.pair.today)}의 가치를 끝까지 지키려면(기간이 늘면 목표도 물가만큼 커짐) <b>${span(r.months)}</b> · 그때 목표 ${esc(fmtKRW(r.target))}`; }
      } else {
        ok = false; head = '100년 안에는 닿지 않아요';
        const i = (1 + v.rate) ** (1 / 12) - 1; const g = Math.pow(1 + i, 1200);
        const end100 = v.initial * g + (Math.abs(i) < 1e-12 ? v.monthlyAmt * 1200 : v.monthlyAmt * ((g - 1) / i));
        line = `100년 뒤에도 ${fmtKRW(end100)}이에요.${v.rate < 0 && v.monthlyAmt > 0 ? ` 수익률이 마이너스라 돈이 ${fmtKRW(v.monthlyAmt / Math.abs(i))} 근처에서 더 늘지 않아요.` : ''}`;
      }
    } else if (C.ask === 'monthly') {
      if (a.status === 'enough') { head = '매달 넣지 않아도 돼요'; line = `지금 목돈 ${fmtKRW(v.initial)}이 ${yrs}년 뒤 ${fmtKRW(a.fvInitial)}으로 불어나 목표 ${fmtKRW(v.target)}을 넘어요.`; }
      else { head = `매달 ${fmtKRW(s.shown)}씩 넣으면 돼요`; line = `${yrs}년 뒤 통장에 ${fmtKRW(s.end)}이 모여 목표 ${fmtKRW(v.target)}을 넘어요.`; }
    } else if (C.ask === 'initial') {
      if (!(v.months > 0)) { head = `지금 ${fmtKRW(v.target)}이 있어야 해요`; }
      else if (a.status === 'enough') { head = '처음 목돈 없이도 돼요'; line = `매달 ${fmtKRW(v.monthlyAmt)}만 ${yrs}년 넣어도 ${fmtKRW(a.fromMonthly)}이 모여요.`; }
      else { head = `처음에 ${fmtKRW(s.shown)}이 있으면 돼요`; line = `${v.monthlyAmt ? `매달 ${fmtKRW(v.monthlyAmt)}씩 ` : '예금처럼 한 번에 넣고 '}${yrs}년${v.monthlyAmt ? ' 넣으면' : ' 두면'} ${fmtKRW(s.end)}이 돼요.`; }
    } else {
      if (!(v.months > 0)) { ok = v.initial >= v.target; head = ok ? '지금 바로 닿아요' : '기간을 넣어 주세요'; line = ok ? '' : '기간이 0년이면 불릴 시간이 없어요.'; }
      else if (a.status === 'never' || a.status === 'hard') { ok = false; head = '수익률만으로는 어려워요'; line = a.status === 'hard' ? `연 ${pct1(s.shown)}가 필요해요. 연 30%가 넘는 수익률은 현실적이지 않아요.` : '연 100% 수익률로도 모자라요.'; }
      else if (a.status === 'zero' || s.shown <= 0) {
        head = a.value <= -0.5 + 1e-9 ? '수익률과 상관없이 닿아요' : `수익률이 연 ${pct1(s.shown)}여도 닿아요`;
        line = `넣는 돈만 ${fmtKRW(v.initial + v.monthlyAmt * v.months)}으로 목표 ${fmtKRW(v.target)}보다 많아요.`;
      } else {
        head = `연 ${pct1(s.shown)} 수익률이면 돼요`;
        line = `${yrs}년 동안 ${v.monthlyAmt ? `매달 ${fmtKRW(v.monthlyAmt)}씩 넣으면` : '굴리면'} ${fmtKRW(s.end)}이 모여요.`;
        if (a.status === 'stretch') pill = '<span class="status-pill caution">! 높은 수익률</span> 연 15%가 넘는 수익률을 오래 내기는 어려워요.';
      }
    }
    // 넣은 돈 vs 불어난 돈 막대(보이는 값으로 다시 계산한 금액)
    const bar = ok && s.paid > 0 && s.end > 0 && !(C.ask === 'years' && a.status === 'already') ? (() => {
      const loss = s.gain < 0; const wPaid = loss ? (s.end / s.paid) * 100 : (s.paid / s.end) * 100;
      return `<div class="gc-bar" aria-hidden="true"><i class="paid" style="flex:${Math.max(1, wPaid)}"></i><i class="${loss ? 'loss' : 'gain'}" style="flex:${Math.max(0, 100 - wPaid)}"></i></div>
        <div class="gc-barlb"><span>넣은 돈 <b>${fmtKRW(s.paid)}</b></span><span class="${loss ? 'down' : 'up'}">${loss ? '줄어든 돈' : '불어난 돈'} <b>${fmtKRW(Math.abs(s.gain))}</b></span></div>`;
    })() : '';
    A.innerHTML = `<div class="gc-head">${esc(head)} ${small ? `<span class="gc-small">${esc(small)}</span>` : ''}</div>${line ? `<p class="gc-line">${esc(line)}</p>` : ''}${pill ? `<p class="gc-warn">${pill}</p>` : ''}${extra ? `<p class="gc-real">${extra}</p>` : ''}${bar}`;
    drawAlts(s, ok, gi);
    hooks.onSolved?.({ ok, s, target: v.target, months: s.full.months, infl: infl(), today: toToday(v.target, (s.full.months || 0) / 12, infl()), ratePct: Math.round(s.full.rate * 1000) / 10 });
  }

  // ---------------- 다른 길: 숫자를 칸에 직접 써서 바로 다시 계산
  /** 바꾼 값으로 다시 풀기. patch: {years?, rate?, monthly?, initial?}(화면 단위), ask: 풀 질문 */
  function whatIf(patch, ask = C.ask) {
    const g2 = structuredClone(goal);
    Object.assign(g2.calc, Object.fromEntries(Object.entries(patch).filter(([k]) => k !== 'years')));
    if (patch.years != null) { g2.calc.years = patch.years; if (g2.calc.link === 'scale') g2.scale.years = patch.years; }
    g2.calc.ask = ask;
    const gi = goalInputs(g2);
    return { s: solve(ask, gi.inp), gi };
  }
  const yearsAt = (patch) => { // 수익률·금액을 바꿨을 때 걸리는 기간(저울과 연결돼 있으면 목표도 물가만큼 커짐)
    const r = whatIf(patch, 'years');
    if (r.gi.linked) { const m = solveMonthsReal({ today: r.gi.pair.today, infl: infl(), initial: r.gi.inp.initial, monthlyAmt: r.gi.inp.monthlyAmt, rate: r.gi.inp.rate }); return m ? m.months : null; }
    return r.s.ans.status === 'ok' ? r.s.ans.months : r.s.ans.status === 'already' ? 0 : null;
  };
  // 대안 종류 → 칸 하나(무엇을 고치나)와 결과 문장
  const ALT = {
    longer: { p: 'years', pre: '기간을', post: '년으로 늘리면', res: (v) => { const r = whatIf({ years: v }); return C.ask === 'monthly' ? (r.s.shown > 0 ? `매달 ${fmtKRW(r.s.shown)}` : '매달 넣지 않아도 돼요') : (r.s.shown > 0 ? `처음 ${fmtKRW(r.s.shown)}` : '처음 목돈 없이도 돼요'); }, set: (v) => ({ years: v }) },
    higherRate: { p: 'rate', pre: '수익률이 연', post: '%면', res: (v) => { const r = whatIf({ rate: v }); return r.s.shown > 0 ? `매달 ${fmtKRW(r.s.shown)}` : '매달 넣지 않아도 돼요'; }, set: (v) => ({ rate: v }) },
    moreInitial: { p: 'initial', pre: '처음 목돈이', post: '원이면', res: (v) => { const r = whatIf({ initial: v }); return r.s.shown > 0 ? `매달 ${fmtKRW(r.s.shown)}` : '매달 넣지 않아도 돼요'; }, set: (v) => ({ initial: v }) },
    moreMonthly: { p: 'monthly', pre: '매달', post: '원 넣으면', res: (v) => { const r = whatIf({ monthly: v }); return r.s.shown > 0 ? `처음 ${fmtKRW(r.s.shown)}` : '처음 목돈 없이도 돼요'; }, set: (v) => ({ monthly: v }) },
    monthly: { p: 'monthly', pre: '매달', post: '원이면', res: (v) => { const m = yearsAt({ monthly: v }); return m == null ? '100년 안엔 어려워요' : `${span(m)} 걸려요`; }, set: (v) => ({ monthly: v }) },
    rate: { p: 'rate', pre: '수익률이 연', post: '%면', res: (v) => { const m = yearsAt({ rate: v }); return m == null ? '100년 안엔 어려워요' : `${span(m)} 걸려요`; }, set: (v) => ({ rate: v }) },
    needMonthly: { p: 'years', pre: '', post: '년 안에 닿으려면', res: (v) => { const r = whatIf({ years: v }, 'monthly'); return r.s.shown != null ? `매달 ${fmtKRW(r.s.shown)}` : '–'; }, set: (v) => ({ years: v }), ask: 'monthly' },
    needRate: { p: 'years', pre: '', post: '년 안에 닿으려면', res: (v) => { const r = whatIf({ years: v }, 'rate'); return r.s.shown != null ? `연 ${pct1(r.s.shown)} 수익률` : '수익률만으론 어려워요'; }, set: (v) => ({ years: v }), ask: 'rate' },
    needInitial: { p: 'years', pre: '', post: '년 안에 닿으려면', res: (v) => { const r = whatIf({ years: v }, 'initial'); return r.s.shown != null ? `처음 목돈 ${fmtKRW(r.s.shown)}` : '–'; }, set: (v) => ({ years: v }), ask: 'initial' },
    yearsAtReal: { p: 'rate', pre: '수익률을 연', post: '%로 잡으면', res: (v) => { const m = yearsAt({ rate: v }); return m == null ? '100년 안엔 어려워요' : `${span(m)} 걸려요`; }, set: (v) => { const m = yearsAt({ rate: v }); return m == null ? {} : { years: Math.ceil(m / 12) }; } },
    monthlyAtReal: { p: 'rate', pre: '수익률을 연', post: '%로 잡고 기간 안에 닿으려면', res: (v) => { const r = whatIf({ rate: v }, 'monthly'); return r.s.shown != null ? `매달 ${fmtKRW(r.s.shown)}` : '–'; }, set: (v) => { const r = whatIf({ rate: v }, 'monthly'); return r.s.shown != null ? { monthly: r.s.shown } : {}; } },
  };
  const defVal = (x) => ({ years: x.months != null ? Math.round(x.months / 12) : C.years, rate: x.rate != null ? +(x.rate * 100).toFixed(1) : C.rate, initial: x.initial ?? ((+C.initial || 0) + (x.plus || 0)), monthly: x.monthly ?? C.monthly });
  function drawAlts(s, ok) {
    const box2 = $('#gcAlts', box);
    const list = s.alts.filter((x) => ALT[x.kind]);
    const zero = s.alts.find((x) => x.kind === 'zeroMonthly');
    if (!list.length && !zero) { box2.innerHTML = ''; return; }
    const title = !ok ? '이렇게 하면 닿아요' : C.ask === 'monthly' || C.ask === 'initial' ? '부담을 줄이는 길' : '다른 길';
    box2.innerHTML = `<span class="gs-lb">${title} <span class="faint">· 숫자를 바꿔 보세요</span></span>${list.map((x, i) => {
      const A2 = ALT[x.kind], p = A2.p, v = defVal(x)[p];
      const money = p === 'initial' || p === 'monthly';
      return `<div class="gc-alt" data-i="${i}">${A2.pre ? `<span>${A2.pre}</span>` : ''}<input class="gc-altin${money ? ' money' : ''}" data-altv="${i}" inputmode="${money ? 'numeric' : 'decimal'}" value="${money ? won(v) : v}" aria-label="${A2.pre || ''} ${A2.post}">${`<span>${A2.post}</span>`}<b class="gc-altres" data-altres="${i}">${esc(A2.res(+v))}</b><button class="btn small" type="button" data-altgo="${i}">이걸로</button></div>`;
    }).join('')}${zero ? '<div class="gc-alt"><span>이미 충분해요.</span><button class="btn small" type="button" id="gcZero">매달 0원으로 바꾸기</button></div>' : ''}`;
    $$('[data-altv]', box2).forEach((inp) => {
      const i = +inp.dataset.altv, A2 = ALT[list[i].kind], money = A2.p === 'initial' || A2.p === 'monthly';
      inp.addEventListener('focus', () => inp.select());
      inp.addEventListener('input', () => { const v = num(inp.value); if (money) inp.value = inp.value.trim() ? won(v) : ''; $(`[data-altres="${i}"]`, box2).textContent = A2.res(v); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') $(`[data-altgo="${i}"]`, box2).click(); });
    });
    $$('[data-altgo]', box2).forEach((b) => { b.onclick = () => {
      const i = +b.dataset.altgo, A2 = ALT[list[i].kind];
      const v = num($(`[data-altv="${i}"]`, box2).value);
      const st = A2.set(v);
      const before = { S: structuredClone(S), C: structuredClone(C) };
      if (st.monthly != null) C.monthly = Math.round(st.monthly);
      if (st.initial != null) C.initial = Math.round(st.initial);
      if (st.rate != null) C.rate = +(+st.rate).toFixed(1);
      if (st.years != null) { C.years = Math.max(0, Math.min(100, Math.round(st.years))); if (C.link === 'scale') { S.years = C.years; $('#gsYears', box).value = S.years; } }
      if (A2.ask) { C.ask = A2.ask; $$('[data-ask]', box).forEach((q) => q.setAttribute('aria-pressed', String(q.dataset.ask === C.ask))); }
      if (C.link === 'scale') syncFromScale();
      hooks.save(); paintScale(); drawParams(); drawCalc();
      hooks.toast('그 값으로 바꿨어요.', { label: '되돌리기', fn: () => { Object.assign(S, before.S); Object.assign(C, before.C); $('#gsYears', box).value = S.years; $$('[data-ask]', box).forEach((q) => q.setAttribute('aria-pressed', String(q.dataset.ask === C.ask))); hooks.save(); paintScale(); drawParams(); drawCalc(); } });
    }; });
    $('#gcZero', box2)?.addEventListener('click', () => { C.monthly = 0; hooks.save(); drawParams(); drawCalc(); });
  }

  $$('[data-ask]', box).forEach((b) => { b.onclick = () => {
    if (last?.full && b.dataset.ask !== C.ask) { // 지금 답을 칸에 남기고 질문만 바꿈
      const f = last.full;
      if (C.ask === 'years' && f.months) { C.years = Math.ceil(f.months / 12); if (C.link === 'scale') { S.years = C.years; $('#gsYears', box).value = S.years; } }
      if (C.ask === 'monthly' && last.shown != null) C.monthly = last.shown;
      if (C.ask === 'initial' && last.shown != null) C.initial = last.shown;
      if (C.ask === 'rate' && last.shown != null) C.rate = +(last.shown * 100).toFixed(1);
    }
    C.ask = b.dataset.ask;
    if (C.link === 'scale') syncFromScale();
    $$('[data-ask]', box).forEach((q) => q.setAttribute('aria-pressed', String(q === b)));
    hooks.save(); paintScale(); drawParams(); drawCalc();
  }; });
  $('#gcTarget', box).addEventListener('input', (e) => { C.target = Math.max(0, num(e.target.value)); e.target.value = e.target.value.trim() ? won(C.target) : ''; if (C.link === 'scale') { C.link = null; if (C.ask !== 'years') C.years = +S.years || C.years; } hooks.save(); paintScale(); drawCalc(); hints(); });
  if (C.link === 'scale') syncFromScale();
  paintScale(); drawParams(); drawCalc(); hints();
  return {
    refresh() { paintScale(); drawCalc(); },
    rate() { return last?.full ? Math.round(last.full.rate * 1000) / 10 : null; },
  };
}
export { fmtPct, solveMonths };
