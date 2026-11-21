// 탭 '리포트' — 내 자산·목표·노후·백테스트에서 정한 것을 한 장으로: 지금 → 목표 → 방법 → 결과 → 할 일
import { $, $$, store } from '../ui/dom.js';
import { fmtKRW, fmtKRWShort, fmtPct, esc } from '../ui/format.js';
import { reportData } from './plan.js';
import { requestAssetsTotal } from './goal.js';

let root = null;
const span = (m) => (m < 12 ? `${m}개월` : `${Math.floor(m / 12)}년${m % 12 ? ` ${m % 12}개월` : ''}`);
const B = (t, tone = '') => `<b${tone ? ` class="t-${tone}"` : ''}>${esc(t)}</b>`;

export function initReport(container) {
  root = container;
  render();
  window.addEventListener('tabshown', (e) => { if (e.detail === 'report' && root.isConnected) render(); });
}

function render() {
  let rd = null;
  try { rd = reportData(); } catch (e) { console.error(e); }
  let assets = 0, assetsLb = '';
  requestAssetsTotal((t, l) => { assets = t || 0; assetsLb = l || ''; });
  const bt = (store('ss.btHistory') || [])[0];
  const d = new Date();
  const head = `<div class="view-intro"><h1>자산 목표 리포트</h1><p>내 자산·목표·노후·백테스트에서 정한 것을 한 장으로 모았어요. ${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()} 기준이고, 다른 탭에서 숫자를 바꾸면 여기도 바로 바뀌어요.</p></div>`;
  if (!rd) {
    root.innerHTML = `${head}<div class="rp2-empty surface"><p>아직 정한 목표나 노후 계획이 없어요.</p><div class="row"><a class="btn primary" href="#goal">목표 정하러 가기</a><a class="btn" href="#plan">노후 계획 보기</a></div></div>`;
    return;
  }
  const { plan: p, res, goal: G, verdict: V, needRate } = rd;
  const lp = res.lp, short = res.gap < 0, depl = lp.depletionAge != null;
  const yrsToRetire = Math.max(0, p.retireAge - p.age);
  const fill = lp.needAtRetire > 0 ? lp.fvAtRetire / lp.needAtRetire : 1;
  const pens = (p.pensions || []).reduce((t, x) => t + (+x.monthly || 0), 0);

  // ---- 한눈 결론
  const ok = !short && !depl;
  const mainText = ok ? '여유로운 은퇴!' : fill >= 0.85 ? '조금만 더!' : '이대로면 부족해요';
  const mainTone = ok ? 'good' : fill >= 0.85 ? 'caution' : 'bad';
  const alts = res.alts.filter((a) => a.id !== 'expense' || short);
  const best = alts.find((a) => a.id === 'monthly');
  const line = ok
    ? `${p.retireAge}세까지 지금처럼 모으면 은퇴 뒤 생활비를 ${p.endAge}세까지 쓰고도 ${fmtKRW(lp.endBalance)}이 남아요.`
    : `${p.retireAge}세까지 지금처럼 모으면 은퇴 뒤 필요한 돈의 ${Math.round(fill * 100)}%를 채워요.${depl ? ` 이대로면 ${lp.depletionAgeYears}세에 돈이 바닥나요.` : ''}${best ? ` 매달 ${fmtKRW(best.value)}씩 모으면 채울 수 있어요.` : ''}`;

  // ---- 흐름 4칸
  const goalOk = G ? G.ratePct <= 15 : false;
  const steps = [
    { n: 1, t: '지금 가진 돈', v: assets ? fmtKRW(assets) : fmtKRW(p.initial), sub: assets ? `${esc(assetsLb || '내 자산')} 기준${Math.abs(assets - p.initial) / Math.max(1, assets) > 0.1 ? ` · 노후 계획엔 ${esc(fmtKRWShort(p.initial))}로 넣었어요` : ''}` : '노후 계획에 넣은 돈 · 내 자산 탭에 넣으면 실제 금액으로 보여요', href: '#assets' },
    G ? { n: 2, t: '목표', v: `${Math.max(1, Math.ceil(G.months / 12))}년 뒤 ${fmtKRWShort(G.target)}`, sub: `그때 통장 숫자 · 오늘 돈 ${esc(fmtKRWShort(G.today))}어치`, href: '#goal' }
      : { n: 2, t: '목표', v: '아직 없음', sub: '목표 탭에서 정하면 여기 나와요', href: '#goal' },
    G ? { n: 3, t: '모으는 방법', v: `매달 ${fmtKRWShort(G.monthly)} · 연 ${G.ratePct}%`, sub: `처음 ${esc(fmtKRWShort(G.initial))}로 시작 → ${esc(span(G.months))} 뒤 ${esc(fmtKRWShort(G.end))}`, stamp: goalOk ? ['good', '목표 달성 가능'] : ['caution', '수익률이 높아요'], href: '#goal' }
      : { n: 3, t: '모으는 방법', v: `매달 ${fmtKRWShort(p.monthly)}`, sub: `연 ${(needRate * 100).toFixed(1)}% 가정`, href: '#plan' },
    { n: 4, t: `노후(${p.retireAge}세 은퇴)`, v: `${short ? '−' : '+'}${fmtKRWShort(Math.abs(res.gap))}`, vTone: short ? 'bad' : 'good', sub: `모일 돈 ${esc(fmtKRWShort(lp.fvAtRetire))} · 필요한 돈 ${esc(fmtKRWShort(lp.needAtRetire))}<br>생활비 월 ${esc(fmtKRWShort(p.expenseToday))}(오늘 돈)${pens ? ` · 연금 ${esc(fmtKRWShort(pens))}` : ''}`, stamp: short ? ['bad', depl ? `${lp.depletionAgeYears}세에 바닥` : '은퇴 때 부족'] : ['good', '여유 있어요'], href: '#plan' },
  ];

  // ---- 채우는 길(부족할 때): 이 중 하나만
  const ACT = { monthly: (a) => ['매달 더 모으기', `월 ${fmtKRWShort(a.value)}`, `지금보다 +${fmtKRWShort(a.value - a.from)}`], rate: (a) => ['수익률 높이기', `연 ${fmtPct(needRate)}`, `지금보다 +${(a.value * 100).toFixed(1)}%p`], retire: (a) => ['은퇴 늦추기', `${a.value}세 은퇴`, `+${a.value - a.from}년`], expense: (a) => ['생활비 줄이기', `월 ${fmtKRWShort(a.value)}`, `지금 ${fmtKRWShort(a.from)}에서(오늘 돈)`] };
  const fixes = short || depl ? alts.filter((a) => ACT[a.id]).map((a) => ACT[a.id](a)) : [];
  // 목표와 필요한 돈이 어긋날 때
  const goalLow = G && G.target < lp.needAtRetire * 0.95;

  // ---- 참고: 계획대로 가고 있나 · 시험한 투자 방법
  const btLine = bt?.sum ? (() => {
    const c = bt.sum.cagr, need = needRate;
    return `<li><span class="tv-lb">시험해 본 투자 방법</span><b>${esc(bt.short)}</b><span class="cap">과거 연 ${fmtPct(c)} · 최대 낙폭 ${fmtPct(bt.sum.mdd)}</span><span class="stamp sm ${c >= need ? 'good' : 'caution'}">${c >= need ? `필요한 연 ${fmtPct(need)}을 넘음` : `필요한 연 ${fmtPct(need)}보다 낮음`}</span></li>`;
  })() : `<li><span class="tv-lb">시험해 본 투자 방법</span><b>아직 없음</b><span class="cap">백테스트를 한 번 돌리면 필요한 수익률과 비교해 드려요</span></li>`;
  const trackLine = `<li><span class="tv-lb">계획대로 가고 있나요?</span><span class="stamp sm ${V.main.cls}">${esc(V.main.text)}</span><span class="cap">${esc(V.cap)}</span></li>`;

  root.innerHTML = `${head}
    <section class="rp2-verdict surface">
      <div class="rp2-vmain"><span class="stamp ${mainTone} slam">${mainText}</span><p>${esc(line)}</p></div>
      <div class="rp2-meter" aria-label="필요한 돈을 채운 정도 ${Math.round(fill * 100)}%"><div class="rp2-meter-bar"><i class="${ok ? 'good' : mainTone}" style="width:${Math.min(100, fill * 100)}%"></i></div>
        <div class="rp2-meter-lb"><span>${p.retireAge}세에 모일 돈 ${B(fmtKRWShort(lp.fvAtRetire))}</span><span>필요한 돈 ${B(fmtKRWShort(lp.needAtRetire))}</span></div></div>
    </section>
    <ol class="rp2-steps">${steps.map((s) => `<li><a class="rp2-step" href="${s.href}"><span class="gstep">${s.n}</span><span class="rp2-t">${esc(s.t)}</span><b class="rp2-v${s.vTone ? ` t-${s.vTone}` : ''}">${esc(s.v)}</b><span class="cap">${s.sub}</span>${s.stamp ? `<span class="stamp sm ${s.stamp[0]}">${esc(s.stamp[1])}</span>` : ''}<span class="rp2-go">고치기 →</span></a></li>`).join('')}</ol>
    ${fixes.length ? `<section class="rp2-fix surface"><h2>목표를 채우려면 <small>이 중 하나만 하면 돼요</small></h2><div class="rp2-fixes">${fixes.map(([t, v, c]) => `<a class="rp2-fixcard" href="#plan"><span class="rp2-t">${esc(t)}</span><b>${esc(v)}</b><span class="cap">${esc(c)}</span></a>`).join('')}</div>
      ${goalLow ? `<p class="cap rp2-note">목표(${esc(fmtKRWShort(G.target))})가 은퇴 뒤 필요한 돈(${esc(fmtKRWShort(lp.needAtRetire))})보다 작아요. 노후 탭의 ‘필요한 돈을 목표로’를 누르면 목표를 맞춰요.</p>` : ''}</section>`
    : `<section class="rp2-fix surface ok"><h2>지금 계획이면 충분해요</h2><p class="cap">${goalLow ? `다만 목표(${esc(fmtKRWShort(G.target))})는 은퇴 뒤 필요한 돈보다 작게 잡혀 있어요.` : '수익률이 계획보다 낮은 해도 있으니, 계획대로 가고 있는지 가끔 기록해 보세요.'}</p></section>`}
    <section class="rp2-more surface"><h2>함께 보면 좋은 것</h2><ul class="rp2-list">${trackLine}${btLine}</ul></section>
    <div class="rp2-links"><a class="btn" href="#goal">목표 고치기</a><a class="btn" href="#plan">노후 계획 고치기</a><a class="btn" href="#finder">연 ${fmtPct(needRate)} 내는 투자 규칙 찾기</a></div>`;
  $$('.rp2-links a[href="#finder"]', root).forEach((a) => { a.onclick = (e) => { e.preventDefault(); const pre = { targetCagr: +(needRate * 100).toFixed(1), years: [5, 10, 15, 20].reduce((x, y) => (Math.abs(y - yrsToRetire) < Math.abs(x - yrsToRetire) ? y : x), 15) }; sessionStorage.setItem('ss.finderPrefill', JSON.stringify(pre)); location.hash = '#finder'; window.dispatchEvent(new CustomEvent('finder:prefill', { detail: pre })); }; });
  void $;
}
