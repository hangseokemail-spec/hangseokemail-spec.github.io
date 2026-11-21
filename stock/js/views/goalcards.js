// 목표·노후 맨 위 카드 두 장: ① 돈의 가치 저울(목표 정하기) ② 실행 목표 만들기(네 가지 질문)
// 그림: GPT 디자이너 시안(scale.svg) · 문구·규칙: Opus 검토(01_opus_review.md) · 계산: core/goalcalc.js
import { $, $$, popover } from '../ui/dom.js';
import { moneyHints } from '../ui/dom.js';
import { fmtKRW, fmtPct, esc } from '../ui/format.js';
import { toThen, toToday, solve, solveMonthsReal, singleRatePct } from '../core/goalcalc.js';

const ASKS = [['years', '걸리는 기간'], ['monthly', '매달 넣을 돈'], ['initial', '처음 목돈'], ['rate', '필요한 수익률']];
const won = (v) => (v == null || !isFinite(v) ? '' : Math.round(v).toLocaleString('ko-KR'));
const num = (v) => +String(v ?? '').replace(/[^\d.\-]/g, '') || 0;
const ymAfter = (months) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + months); return `${d.getFullYear()}년 ${d.getMonth() + 1}월`; };
const span = (m) => (m < 12 ? `${m}개월` : `${Math.floor(m / 12)}년${m % 12 ? ` ${m % 12}개월` : ''}`);
const pct1 = (r) => `${(r * 100).toFixed(1).replace('-', '−')}%`;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const SCALE_SVG = `<svg class="gs-svg" viewBox="0 0 360 170" aria-hidden="true">
  <g class="gs-stand"><path d="M180 44 206 160H154Z" fill="var(--bg-selected)" stroke="var(--border-strong)" stroke-width="1.5" stroke-linejoin="round"/><path d="M138 160h84" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/></g>
  <g class="gs-beam"><path d="M62 44h236" stroke="var(--text-2)" stroke-width="3" stroke-linecap="round"/><circle cx="180" cy="44" r="6" fill="var(--bg-surface)" stroke="var(--accent)" stroke-width="3"/></g>
  <g class="gs-pan l"><path d="M62 44 14 108M62 44 110 108" stroke="var(--border-strong)" stroke-width="1.5"/><path d="M6 108h112q-10 20-32 20H38q-22 0-32-20Z" fill="var(--bg-selected)" stroke="var(--text-2)" stroke-width="1.5"/><circle cx="62" cy="44" r="3" fill="var(--text-2)"/></g>
  <g class="gs-pan r"><path d="M298 44 250 108M298 44 346 108" stroke="var(--border-strong)" stroke-width="1.5"/><path d="M242 108h112q-10 20-32 20h-48q-22 0-32-20Z" fill="var(--bg-selected)" stroke="var(--text-2)" stroke-width="1.5"/><circle cx="298" cy="44" r="3" fill="var(--text-2)"/></g>
</svg>`;

/** 예전 계획 고치기: 오늘 돈 기준 목표 → 그해 통장 숫자, 스위치 값 지우기 */
export function migratePlan(p) {
  if (p.goalBasis === 'today') { p.goalAmount = Math.round(p.goalAmount * Math.pow(1 + (+p.inflation || 0) / 100, Math.round((+p.goalYears || 0) * 12) / 12)); }
  delete p.goalBasis; delete p.showToday;
  return p;
}
const accMonths = (p) => Math.max(0, Math.round((p.mode === 'goal' ? +p.goalYears : (+p.retireAge - +p.age)) * 12));
export function planRatePct(p) { return singleRatePct(+p.initial || 0, +p.monthly || 0, (p.accSegs || []).map((g) => ({ ...g, rate: +g.rate })), accMonths(p)); }
/** 저울·계산기 값이 없으면 계획에서 채운다(답은 저장하지 않음) */
export function ensureCards(p, res) {
  const g = p.mode === 'goal';
  const years = Math.max(1, Math.round(accMonths(p) / 12) || 10);
  const need = Math.round(res?.lp?.needAtRetire || 0);
  if (!p.calc) p.calc = { ask: 'monthly', target: g ? Math.round(+p.goalAmount || 1e8) : need || 1e8, initial: +p.initial || 0, monthly: +p.monthly || 0, rate: planRatePct(p), years, link: g ? null : 'plan', fromScale: null };
  if (!p.scale) p.scale = g ? { then: Math.round(+p.goalAmount || 1e8), years, last: 'then' } : need ? { then: need, years, last: 'then' } : { today: 1e8, years: 20, last: 'today' };
  if (!g && p.calc.link === 'plan' && need) p.calc.target = need;
}

/**
 * hooks: { save(), setInflation(pct), apply(vals), toFinder(ratePct, years), fromAssets(cb), planNums() → {target, years, initial, monthly, rate, events, growth, saveStop} }
 * 반환: { syncTarget(v) } — 노후 모드에서 필요 자금이 바뀌면 목표를 따라 고침
 */
export function renderGoalCards(box, plan, hooks) {
  const S = plan.scale, C = plan.calc, g = plan.mode === 'goal';
  const infl = () => (+plan.inflation || 0) / 100;
  const yr0 = new Date().getFullYear();
  const pair = () => { // 마지막에 손댄 접시를 기준으로 다른 쪽 계산
    const y = +S.years || 0;
    if (S.last === 'then') return { then: +S.then || 0, today: toToday(+S.then || 0, y, infl()) };
    return { today: +S.today || 0, then: toThen(+S.today || 0, y, infl()) };
  };
  const P0 = pair();
  box.innerHTML = `
  <div class="goal-cards">
    <section class="gcard gscale" aria-labelledby="gsTitle">
      <div class="gtitle-row"><h2 class="gtitle" id="gsTitle">돈의 가치 저울</h2><button class="help" type="button" id="gsHelp" aria-label="저울 설명">?</button></div>
      <p class="gsub">물가가 오르면 같은 돈으로 살 수 있는 게 줄어요. 양쪽이 같은 가치가 되게 맞춰 드려요.</p>
      <div class="gs-wrap">
        <div class="gs-stage">
          ${SCALE_SVG}
          <label class="gs-plate l"><span class="gs-lb">오늘 돈</span><input class="gs-amt" id="gsToday" inputmode="numeric" value="${esc(fmtKRW(P0.today))}" aria-label="오늘 돈 고치기"></label>
          <label class="gs-plate r"><span class="gs-lb" id="gsThenLb">${yr0 + (+S.years || 0)}년 통장 숫자</span><input class="gs-amt" id="gsThen" inputmode="numeric" value="${esc(fmtKRW(P0.then))}" aria-label="그해 통장 숫자 고치기"></label>
        </div>
        <div class="gs-stand-in">
          <label class="field"><span class="gs-lb">기간</span><span class="input-unit"><input class="input num" id="gsYears" inputmode="numeric" value="${S.years}" aria-label="기간(년)"><span>년</span></span></label>
          <label class="field"><span class="gs-lb">물가(연)</span><span class="input-unit"><input class="input num" id="gsInfl" inputmode="decimal" value="${plan.inflation}" aria-label="물가 상승률(연, %)"><span>%</span></span></label>
        </div>
      </div>
      <p class="gs-equal" id="gsEqual" aria-live="polite"></p>
      <p class="gc-err" id="gsErr" aria-live="polite"></p>
      <div class="gactions"><button class="btn primary" type="button" id="gsUse">이 금액을 목표로 ▶</button><button class="btn ghost small" type="button" id="gsFromPlan">계획 숫자 불러오기</button></div>
    </section>
    <section class="gcard gcalc" aria-labelledby="gcTitle">
      <h2 class="gtitle" id="gcTitle">실행 목표 만들기</h2>
      <div class="gc-ask"><span class="gs-lb">무엇이 궁금해요?</span>
        <div class="gc-asks" role="group" aria-label="무엇이 궁금해요?">${ASKS.map(([k, l]) => `<button class="gc-askbtn" type="button" data-ask="${k}" aria-pressed="${C.ask === k}">${l}</button>`).join('')}</div></div>
      <label class="field gc-target"><span class="gs-lb">${g ? '목표 금액' : '은퇴 때 필요 자금'} <span class="faint" id="gcTargetCap"></span></span><span class="input-unit"><input class="input num" id="gcTarget" inputmode="numeric" data-money="KRW" value="${won(C.target)}"><span>원</span></span></label>
      <div class="gc-targetnote" id="gcTargetNote"></div>
      <div class="gc-params" id="gcParams"></div>
      <div class="gc-answer" id="gcAnswer" role="status" aria-live="polite"></div>
      <div class="gc-alts" id="gcAlts"></div>
      <p class="gc-cap" id="gcCap"></p>
      <div class="gactions"><button class="btn primary" type="button" id="gcApply">이 값으로 아래 계획 바꾸기</button><button class="btn" type="button" id="gcFinder">투자 규칙 찾기 →</button></div>
      <div class="gc-diff" id="gcDiff"></div>
    </section>
  </div>`;
  moneyHints(box);
  const hints = () => moneyHints(box);

  // ---------------- ① 저울
  const beam = $('.gs-beam', box), panL = $('.gs-pan.l', box), panR = $('.gs-pan.r', box), plL = $('.gs-plate.l', box), plR = $('.gs-plate.r', box);
  let tiltT = null;
  const tilt = (side, up) => { // 고친 쪽 금액이 커지면 그쪽이 내려감
    if (reduced()) return;
    const down = (side === 'l') === up; const deg = down ? -3 : 3, dy = Math.sin((deg * Math.PI) / 180) * 118;
    const k = ($('.gs-svg', box)?.clientWidth || 360) / 360;
    beam.style.transform = `rotate(${deg}deg)`; panL.style.transform = `translateY(${-dy}px)`; panR.style.transform = `translateY(${dy}px)`;
    plL.style.transform = `translate(-50%, ${-dy * k}px)`; plR.style.transform = `translate(-50%, ${dy * k}px)`;
    clearTimeout(tiltT); tiltT = setTimeout(() => { [beam, panL, panR].forEach((x) => { x.style.transform = ''; }); plL.style.transform = ''; plR.style.transform = ''; }, 250);
  };
  const equal = () => {
    const p = pair(), y = +S.years || 0, Y = yr0 + y;
    $('#gsThenLb', box).textContent = `${Y}년 통장 숫자`;
    let t;
    if (!y) t = '같은 해라 금액도 같아요.';
    else if (!infl()) t = '물가가 그대로면 금액도 그대로예요.';
    else if (infl() < 0) t = `물가가 내리면 그해 숫자가 더 작아도 같은 가치예요. 오늘 <b>${esc(fmtKRW(p.today))}</b> = ${Y}년 <b>${esc(fmtKRW(p.then))}</b>`;
    else t = `오늘 <b>${esc(fmtKRW(p.today))}</b>과 ${Y}년 통장에 찍힐 <b>${esc(fmtKRW(p.then))}</b>은 <b>같은 가치</b>예요.`;
    $('#gsEqual', box).innerHTML = t;
  };
  const putVal = (id, v) => { const x = $(id, box); if (document.activeElement !== x) x.value = fmtKRW(v); };
  ['#gsToday', '#gsThen'].forEach((id) => { const x = $(id, box); x.addEventListener('focus', () => { const p = pair(); x.value = won(id === '#gsToday' ? p.today : p.then); x.select(); }); x.addEventListener('blur', () => { const p = pair(); x.value = fmtKRW(id === '#gsToday' ? p.today : p.then); }); });
  $('#gsToday', box).addEventListener('input', (e) => { const prev = pair().today; S.today = Math.max(0, num(e.target.value)); S.last = 'today'; e.target.value = e.target.value.trim() ? won(S.today) : ''; putVal('#gsThen', pair().then); tilt('l', S.today >= prev); equal(); hints(); hooks.save(); });
  $('#gsThen', box).addEventListener('input', (e) => { const prev = pair().then; S.then = Math.max(0, num(e.target.value)); S.last = 'then'; e.target.value = e.target.value.trim() ? won(S.then) : ''; putVal('#gsToday', pair().today); tilt('r', S.then >= prev); equal(); hints(); hooks.save(); });
  const keep = () => { const p = pair(); putVal('#gsToday', p.today); putVal('#gsThen', p.then); equal(); hints(); hooks.save(); };
  $('#gsYears', box).addEventListener('input', (e) => { const v = num(e.target.value); $('#gsErr', box).textContent = v < 0 || v > 100 ? '기간은 0~100년으로 넣어 주세요.' : ''; S.years = Math.max(0, Math.min(100, Math.round(v))); keep(); });
  $('#gsInfl', box).addEventListener('input', (e) => { const v = num(e.target.value); $('#gsErr', box).textContent = v < -2 || v > 10 ? '물가는 −2%에서 10% 사이로 넣어 주세요.' : ''; hooks.setInflation(Math.max(-2, Math.min(10, v))); keep(); });
  $('#gsHelp', box).onclick = (e) => { const p = pair(); popover(e.currentTarget, `<b>돈의 가치 저울</b><p style="margin:6px 0">왼쪽은 오늘 물가로 본 돈, 오른쪽은 그해 통장에 실제로 찍힐 숫자예요. 물가가 해마다 ${plan.inflation}%씩 오르면 ${S.years}년 뒤엔 ${esc(fmtKRW(p.then))}이 있어야 오늘 ${esc(fmtKRW(p.today))}만큼 살 수 있어요.</p><p class="cap" style="margin:0">예) 오늘 1만원짜리 국밥 → ${yr0 + (+S.years || 0)}년 ${Math.round(toThen(10000, +S.years || 0, infl())).toLocaleString('ko-KR')}원</p>`); };
  $('#gsUse', box).onclick = () => {
    const p = pair();
    const before = structuredClone(C);
    C.target = Math.round(p.then); if (C.ask !== 'years') C.years = +S.years || C.years;
    C.fromScale = { today: Math.round(p.today), years: +S.years || 0 }; C.link = null;
    $('#gcTarget', box).value = won(C.target);
    hooks.save(); drawParams(); drawCalc(); hints();
    hooks.toast(`실행 목표에 ${fmtKRW(C.target)}${C.ask !== 'years' ? `, ${S.years}년` : ''}을 넣었어요.`, { label: '되돌리기', fn: () => { Object.assign(C, before); $('#gcTarget', box).value = won(C.target); hooks.save(); drawParams(); drawCalc(); } });
    const card = box.querySelector('.gcalc'); card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 700);
  };
  $('#gsFromPlan', box).onclick = () => { const n = hooks.planNums(); S.then = Math.round(n.target); S.years = Math.round(n.years); S.last = 'then'; $('#gsYears', box).value = S.years; keep(); };
  equal();

  // ---------------- ② 실행 목표
  const fieldHtml = (k, label, val, unit, money, extra = '') => C.ask === k
    ? `<div class="field gc-q"><span class="gs-lb">${label}</span><output class="gc-qcell" aria-label="${label}: 아래에 답">?</output></div>`
    : `<label class="field"><span class="gs-lb">${label}${extra}</span><span class="input-unit"><input class="input num" data-c="${k}" inputmode="${money ? 'numeric' : 'decimal'}" ${money ? 'data-money="KRW"' : ''} value="${val}"><span>${unit}</span></span></label>`;
  function drawParams() {
    $('#gcParams', box).innerHTML = [
      fieldHtml('initial', '지금 목돈', won(C.initial), '원', true, ' <button class="linkbtn" type="button" id="gcAssets">내 자산에서</button>'),
      fieldHtml('monthly', '매달 넣을 돈', won(C.monthly), '원', true),
      fieldHtml('rate', '연수익률', C.rate, '%', false),
      fieldHtml('years', g ? '기간' : '은퇴까지', C.years, '년', false),
    ].join('');
    $$('[data-c]', box).forEach((x) => x.addEventListener('input', () => {
      const k = x.dataset.c, v = num(x.value);
      if (k === 'initial' || k === 'monthly') { C[k] = Math.max(0, v); x.value = x.value.trim() ? won(C[k]) : ''; }
      else if (k === 'rate') C.rate = v;
      else C.years = Math.round(v);
      hooks.save(); drawCalc(); hints();
    }));
    $('#gcAssets', box)?.addEventListener('click', (e) => { e.preventDefault(); hooks.fromAssets((total) => { C.initial = Math.round(total); hooks.save(); drawParams(); drawCalc(); }); });
    hints();
  }
  const inp = () => ({ target: +C.target || 0, initial: +C.initial || 0, monthlyAmt: +C.monthly || 0, rate: (+C.rate || 0) / 100, months: Math.round((+C.years || 0) * 12), refMonths: Math.round(((C.fromScale?.years) || (C.ask === 'years' ? hooks.planNums().years : +C.years) || 20) * 12) });
  let last = null;
  function drawCalc() {
    const cap = $('#gcTargetCap', box), note = $('#gcTargetNote', box);
    cap.textContent = g ? '(통장 숫자)' : C.link === 'plan' ? `(자세한 계획에서 계산 · ${yr0 + (+C.years || 0)}년 통장 숫자 · 고치면 연결이 풀려요)` : '(통장 숫자)';
    note.innerHTML = !g && C.link !== 'plan' ? '<button class="linkbtn" type="button" id="gcRelink">필요 자금 다시 가져오기</button>' : C.fromScale && C.ask !== 'years' && C.fromScale.years !== +C.years ? `저울에서 가져온 목표는 ${yr0 + C.fromScale.years}년 기준이에요. <button class="linkbtn" type="button" id="gcFit">목표도 ${C.years}년에 맞추기 → ${esc(fmtKRW(toThen(C.fromScale.today, +C.years || 0, infl())))}</button>` : '';
    $('#gcRelink', box)?.addEventListener('click', () => { C.link = 'plan'; C.fromScale = null; C.target = Math.round(hooks.planNums().target); $('#gcTarget', box).value = won(C.target); hooks.save(); drawCalc(); hints(); });
    $('#gcFit', box)?.addEventListener('click', () => { C.target = Math.round(toThen(C.fromScale.today, +C.years || 0, infl())); C.fromScale = { ...C.fromScale, years: +C.years }; $('#gcTarget', box).value = won(C.target); hooks.save(); drawCalc(); hints(); });
    // 입력 오류
    const v = inp();
    const err = !(v.target > 0) ? '목표 금액을 넣어 주세요.' : (C.ask !== 'years' && (+C.years > 100)) ? '기간은 100년까지 넣을 수 있어요.' : (C.ask !== 'rate' && (+C.rate < -50 || +C.rate > 100)) ? '수익률은 −50%에서 100% 사이로 넣어 주세요.'
      : (C.ask !== 'years' && C.ask !== 'initial' && !(v.months > 0) && C.ask === 'monthly') ? '기간을 1년 이상 넣어 주세요.' : '';
    const A = $('#gcAnswer', box);
    if (err) { A.innerHTML = `<p class="gc-err">${esc(err)}</p>`; $('#gcAlts', box).innerHTML = ''; $('#gcApply', box).disabled = true; $('#gcFinder', box).hidden = true; last = null; caption(); diff(); return; }
    const s = solve(C.ask, v); last = s;
    const a = s.ans, f = s.full;
    let head, small = '', line = '', extra = '', pill = '', ok = true;
    if (C.ask === 'years') {
      if (a.status === 'already') { head = '지금 바로 닿아요'; line = `지금 목돈 ${fmtKRW(v.initial)}이 목표 ${fmtKRW(v.target)}보다 ${fmtKRW(v.initial - v.target)} 많아요.`; }
      else if (a.status === 'ok') {
        head = `${span(a.months)} 걸려요`; small = `(${ymAfter(a.months)})`;
        line = `그때 통장에 ${fmtKRW(s.end)}이 모여 목표 ${fmtKRW(v.target)}을 넘어요. 이 목표는 ${yr0 + Math.round(a.months / 12)}년엔 오늘 돈 ${fmtKRW(toToday(v.target, a.months / 12, infl()))}어치예요.`;
        if (C.fromScale) { const r = solveMonthsReal({ today: C.fromScale.today, infl: infl(), initial: v.initial, monthlyAmt: v.monthlyAmt, rate: v.rate }); if (r) extra = `오늘 돈 ${fmtKRW(C.fromScale.today)} 가치를 지키려면(물가만큼 목표도 키우면) <b>${span(r.months)}</b>(${ymAfter(r.months)}) · 그때 목표 ${esc(fmtKRW(r.target))}`; }
      } else {
        ok = false; head = '100년 안에는 닿지 않아요';
        const end100 = v.initial * Math.pow(1 + ((1 + v.rate) ** (1 / 12) - 1), 1200) + (Math.abs(v.rate) < 1e-9 ? v.monthlyAmt * 1200 : v.monthlyAmt * ((Math.pow((1 + v.rate) ** (1 / 12), 1200) - 1) / ((1 + v.rate) ** (1 / 12) - 1)));
        line = `100년 뒤에도 ${fmtKRW(end100)}이에요.${v.rate < 0 && v.monthlyAmt > 0 ? ` 수익률이 마이너스라 돈이 ${fmtKRW(v.monthlyAmt / Math.abs((1 + v.rate) ** (1 / 12) - 1))} 근처에서 더 늘지 않아요.` : ''}`;
      }
    } else if (C.ask === 'monthly') {
      if (a.status === 'enough') { head = '매달 넣지 않아도 돼요'; line = `지금 목돈 ${fmtKRW(v.initial)}이 ${C.years}년 뒤 ${fmtKRW(a.fvInitial)}으로 불어나 목표 ${fmtKRW(v.target)}을 넘어요.`; }
      else {
        head = `매달 ${fmtKRW(s.shown)}씩 넣으면 돼요`;
        line = `${C.years}년 뒤(${ymAfter(v.months)}) ${fmtKRW(s.end)}이 모여 목표 ${fmtKRW(v.target)}을 넘어요.`;
        const pm = +hooks.planNums().monthly || 0; if (pm > 0 && s.shown > pm) line += ` 지금 계획(월 ${fmtKRW(pm)})보다 ${fmtKRW(s.shown - pm)} 더예요.`;
      }
    } else if (C.ask === 'initial') {
      if (!(v.months > 0)) { head = `지금 ${fmtKRW(v.target)}이 있어야 해요`; }
      else if (a.status === 'enough') { head = '처음 목돈 없이도 돼요'; line = `매달 ${fmtKRW(v.monthlyAmt)}만 ${C.years}년 넣어도 ${fmtKRW(a.fromMonthly)}이 모여요.`; }
      else {
        head = `처음에 ${fmtKRW(s.shown)}이 있으면 돼요`;
        line = `${v.monthlyAmt ? `매달 ${fmtKRW(v.monthlyAmt)}씩 ` : '예금처럼 한 번에 넣고 '}${C.years}년${v.monthlyAmt ? ' 넣으면' : ' 두면'} ${fmtKRW(s.end)}이 돼요.`;
        const have = +hooks.planNums().initial || 0; if (have > 0) line += have >= s.shown ? ` 지금 모아 둔 돈 ${fmtKRW(have)}이면 이미 충분해요.` : ` 지금 모아 둔 돈보다 ${fmtKRW(s.shown - have)} 더 필요해요.`;
      }
    } else {
      if (!(v.months > 0)) { ok = v.initial >= v.target; head = ok ? '지금 바로 닿아요' : '기간을 넣어 주세요'; line = ok ? '' : '기간이 0년이면 불릴 시간이 없어요.'; }
      else if (a.status === 'never' || (a.status === 'hard')) { ok = false; head = '수익률만으로는 어려워요'; line = a.status === 'hard' ? `연 ${pct1(s.shown)}가 필요해요. 연 30%가 넘는 수익률은 현실적이지 않아요.` : '연 100% 수익률로도 모자라요.'; }
      else if (a.status === 'zero' || s.shown <= 0) {
        head = a.value <= -0.5 + 1e-9 ? '수익률과 상관없이 닿아요' : `수익률이 연 ${pct1(s.shown)}여도 닿아요`;
        line = `넣는 돈만 ${fmtKRW(v.initial + v.monthlyAmt * v.months)}으로 목표 ${fmtKRW(v.target)}보다 많아요.`;
      } else {
        head = `연 ${pct1(s.shown)} 수익률이면 돼요`;
        line = `${C.years}년 동안 ${v.monthlyAmt ? `매달 ${fmtKRW(v.monthlyAmt)}씩 넣으면` : '굴리면'} ${fmtKRW(s.end)}이 모여요.`;
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
    // 다른 길: 칸 하나만 바꾼 값 · 누르면 그 값으로
    const T = (x) => ({
      monthly: () => `매달 ${fmtKRW(x.monthly)}이면 ${span(x.months)}`,
      rate: () => `연 ${pct1(x.rate)}면 ${span(x.months)}`,
      needMonthly: () => `${span(x.months)} 안에 닿으려면 매달 ${fmtKRW(x.monthly)}`,
      needRate: () => `${span(x.months)} 안에 닿으려면 연 ${pct1(x.rate)} 수익률`,
      needInitial: () => `${span(x.months)} 안에 닿으려면 처음 목돈 ${fmtKRW(x.initial)}`,
      longer: () => (C.ask === 'monthly' ? `기간을 ${span(x.months)}으로 늘리면 매달 ${x.monthly > 0 ? fmtKRW(x.monthly) : '넣지 않아도 돼요'}` : `기간을 ${span(x.months)}으로 늘리면 ${x.initial > 0 ? `처음 ${fmtKRW(x.initial)}` : '처음 목돈 없이도 돼요'}`),
      higherRate: () => `수익률이 연 ${pct1(x.rate)}면 매달 ${fmtKRW(x.monthly)}`,
      moreInitial: () => `처음 목돈이 ${fmtKRW(x.plus)} 더 있으면 매달 ${fmtKRW(x.monthly)}`,
      moreMonthly: () => `매달 ${fmtKRW(x.monthly)}이면 처음 ${x.initial > 0 ? fmtKRW(x.initial) : '목돈 없이도 돼요'}`,
      zeroMonthly: () => '매달 0원으로 바꾸기',
      yearsAtReal: () => `연 ${pct1(x.rate)}로 잡으면 ${span(x.months)} 걸려요`,
      monthlyAtReal: () => `연 ${pct1(x.rate)}로 ${span(x.months)} 안에 닿으려면 매달 ${fmtKRW(x.monthly)}`,
    }[x.kind] || (() => ''))();
    const altTitle = !ok ? '이렇게 하면 닿아요' : C.ask === 'monthly' || C.ask === 'initial' ? '부담을 줄이는 길' : '다른 길';
    $('#gcAlts', box).innerHTML = s.alts.length ? `<span class="gs-lb">${altTitle}</span>${s.alts.map((x, i) => `<button class="chip" type="button" data-alt="${i}">${esc(T(x))}</button>`).join('')}` : '';
    $$('[data-alt]', box).forEach((b) => { b.onclick = () => {
      const x = s.alts[+b.dataset.alt]; const st = x.set || {};
      if (st.monthly != null) C.monthly = Math.round(st.monthly);
      if (st.initial != null) C.initial = Math.round(st.initial);
      if (st.rate != null) C.rate = +(st.rate * 100).toFixed(1);
      if (st.years != null) C.years = Math.round(st.years);
      if (x.ask) { C.ask = x.ask; $$('[data-ask]', box).forEach((q) => q.setAttribute('aria-pressed', String(q.dataset.ask === C.ask))); }
      hooks.save(); drawParams(); drawCalc();
    }; });
    // 버튼
    const r = f.rate;
    const fb = $('#gcFinder', box);
    fb.hidden = !(ok && r > 0); fb.disabled = r > 0.3; fb.title = r > 0.3 ? '너무 높아 찾기 어려워요' : '';
    fb.textContent = `연 ${pct1(r)} 내는 투자 규칙 찾기 →`;
    $('#gcApply', box).disabled = !ok;
    caption(); diff();
  }
  function caption() {
    const n = hooks.planNums(); const bits = [];
    if (n.events) bits.push(`목돈 ${n.events}건`);
    if (n.growth) bits.push(`적립액 매년 ${n.growth}% 증가`);
    let t = '수익률 한 가지 · 매달 같은 금액 · 월말에 넣는다고 보고 계산해요.';
    if (bits.length) t += ` 아래 계획의 ${bits.join(' · ')}는 넣지 않았어요.`;
    if (n.saveStop) t += ` 적립을 ${n.saveStop}세에 멈추는 설정은 넣지 않았어요.`;
    $('#gcCap', box).textContent = t;
  }
  function diff() { // 아래 계획과 다르면 알려 줌
    const n = hooks.planNums(), d = $('#gcDiff', box);
    const same = Math.round(+C.initial) === Math.round(n.initial) && Math.round(+C.monthly) === Math.round(n.monthly) && Math.abs(+C.rate - n.rate) < 0.05 && (C.ask === 'years' || Math.round(+C.years) === Math.round(n.years)) && (!g || Math.abs(+C.target - n.target) < 1);
    d.innerHTML = same ? '' : '<span class="cap">아래 계획과 달라요</span> <button class="linkbtn" type="button" id="gcFromPlan">아래 계획에서 가져오기</button>';
    $('#gcFromPlan', box)?.addEventListener('click', () => { Object.assign(C, { initial: Math.round(n.initial), monthly: Math.round(n.monthly), rate: n.rate, years: Math.round(n.years), target: Math.round(n.target) }); if (!g) C.link = 'plan'; C.fromScale = null; $('#gcTarget', box).value = won(C.target); hooks.save(); drawParams(); drawCalc(); hints(); });
  }
  $$('[data-ask]', box).forEach((b) => { b.onclick = () => {
    if (last?.full && b.dataset.ask !== C.ask) { // 지금 답을 칸에 남기고 질문만 바꿈
      const f = last.full;
      if (C.ask === 'years' && f.months) C.years = Math.ceil(f.months / 12);
      if (C.ask === 'monthly' && last.shown != null) C.monthly = last.shown;
      if (C.ask === 'initial' && last.shown != null) C.initial = last.shown;
      if (C.ask === 'rate' && last.shown != null) C.rate = +(last.shown * 100).toFixed(1);
    }
    C.ask = b.dataset.ask;
    $$('[data-ask]', box).forEach((q) => q.setAttribute('aria-pressed', String(q === b)));
    hooks.save(); drawParams(); drawCalc();
  }; });
  $('#gcTarget', box).addEventListener('input', (e) => { C.target = Math.max(0, num(e.target.value)); e.target.value = e.target.value.trim() ? won(C.target) : ''; C.link = null; C.fromScale = null; hooks.save(); drawCalc(); hints(); });
  $('#gcApply', box).onclick = () => { if (!last) return; const f = last.full; hooks.apply({ ask: C.ask, target: f.target, months: f.months, initial: f.initial, monthly: f.monthlyAmt, ratePct: +(f.rate * 100).toFixed(1) }); };
  $('#gcFinder', box).onclick = () => { if (last?.full) hooks.toFinder(+(last.full.rate * 100).toFixed(1), last.full.months / 12); };
  drawParams(); drawCalc();
  return {
    syncTarget(v) { if (C.link !== 'plan' || !(v > 0)) return; C.target = Math.round(v); const x = $('#gcTarget', box); if (x && document.activeElement !== x) x.value = won(C.target); drawCalc(); hints(); },
    refresh() { drawCalc(); },
  };
}
export { fmtPct };
