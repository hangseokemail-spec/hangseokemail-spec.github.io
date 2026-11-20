// 탭1 백테스트
import { $, $$, el, store, toast, sheet, popover, settings, announce, debounce } from '../ui/dom.js';
import { fmtMoney, fmtMoneyShort, fmtPct, fmtPp, fmtNum, fmtYm, fmtYmKo, fmtSpan, esc, dirClass, arrow } from '../ui/format.js';
import { lineChart, barChart, seriesColor, css, isMobile } from '../ui/charts.js';
import { searchAssets, assetInfo, getUniverse } from '../core/data.js';
import { runBacktest } from '../core/engine.js';
import { computeMetrics, monthlyTable, rolling, drawdown, drawdownEpisodes, assetStats } from '../core/metrics.js';
import { parseCommand, defaultBtState, newPortfolio } from '../core/nlp.js';
import { diagnose, evaluateAlt, altStrategy, story } from '../core/comment.js';
import { todayYm, ymAdd, parseYm, ymToIso, dayToYm } from '../core/dates.js';
import { aiParse, hasKey } from '../core/ai.js';

const REPO = 'hangseokemail-spec/hangseokemail-spec.github.io';
const GROUPS = { US_STOCK: '미국 대형주', KR_STOCK: '국내 대형주', US_ETF: '미국 ETF', KR_ETF: '국내 ETF' };
const METRICS = { mcap: '시가총액', mom: '모멘텀(수익률)', lowvol: '낮은 변동성' };
const REB = { none: '안 함', M: '매월 말', Q: '분기 말', S: '반기 말', A: '매년 말', band: '밴드' };
const BENCH_PRESETS = [['SPY', 'S&P 500 (SPY)'], ['QQQ', '나스닥100 (QQQ)'], ['069500', '코스피200 (KODEX 200)'], ['VT', '전세계 (VT)'], ['', '비교 안 함']];
const EXAMPLES = [
  '최근 3년간 시총 1~3위 미국 주식을 매달 말일 리밸런싱하면?',
  'QQQ 60 SCHD 40이랑 SPY 비교, 최근 10년',
  'KODEX 미국반도체 25 KODEX 미국나스닥100 25 TIGER 미국배당다우존스 25 TIME 글로벌AI인공지능액티브 25, ±3% 벗어나면 리밸런싱',
  '매달 50만원씩 VOO 적립, 2012년부터 원화로',
  '미국 대형주 12개월 모멘텀 상위 5개 매달 교체, 2010년부터',
];
export const HELP = {
  cagr: ['연환산 수익률(CAGR)', '매년 같은 비율로 불어났다고 쳤을 때의 1년 수익률이에요. 10년에 2배가 됐다면 약 연 7.2%.', '(마지막 지수 ÷ 처음 지수)^(12 ÷ 개월 수) − 1. 적립·인출의 영향을 뺀 시간가중 기준이에요.'],
  mdd: ['최대 낙폭(MDD)', '고점에서 바닥까지 가장 크게 떨어졌던 비율이에요. −30%면 1,000만원이 한때 700만원이 됐다는 뜻.', '월말 기준(포트폴리오 비주얼라이저와 같음). 지표 표에는 일별 기준도 함께 보여줘요.'],
  vol: ['변동성(표준편차)', '수익률이 평균에서 얼마나 출렁였나예요. 20%면 한 해 ±20% 안팎의 흔들림이 흔하다는 뜻.', '월간 수익률의 표본표준편차 × √12.'],
  sharpe: ['샤프 지수', '흔들림 1만큼을 견딘 대가로 예금 금리보다 얼마나 더 벌었나예요. 1 이상이면 좋은 편.', '월 초과수익(수익률 − 무위험수익률)의 평균 ÷ 표준편차 × √12. 무위험수익률은 설정값(기본 0%).'],
  sortino: ['소르티노 지수', '샤프와 같지만 떨어질 때의 흔들림만 셉니다.', '월 초과수익 평균 ÷ 하방편차 × √12.'],
  beta: ['베타', '벤치마크가 1% 움직일 때 평균적으로 몇 % 움직였나예요.', '월 초과수익 회귀의 기울기.'],
  final: ['최종 금액', '시작 금액(과 적립·인출)을 반영한 마지막 평가액이에요.', ''],
  excess: ['벤치마크 대비', '연환산 수익률의 차이예요. 플러스면 벤치마크보다 더 벌었어요.', ''],
  rolling: ['롤링 수익률', '시작일을 한 달씩 옮겨 가며 "그때 샀다면 N년 뒤 몇 %였나"를 이은 선이에요. 운 좋은 시작일에 속지 않게 해 줘요.', ''],
  band: ['밴드 리밸런싱', '날짜가 아니라 비중이 목표에서 정한 폭(예: ±3%p) 넘게 벗어났을 때만 되돌리는 방식이에요. 매일 종가로 점검해요.', ''],
};

let st = null;          // 백테스트 상태
let active = 0;         // 편집 중인 포트폴리오
let last = null;        // 마지막 결과
let stale = false;
let root = null;
let logScale = false;
let subtab = 'summary';

window.addEventListener('bt:pending', () => { if (root) consumePending(); });
function consumePending() {
  const raw = sessionStorage.getItem('ss.pendingBt');
  if (!raw) return false;
  sessionStorage.removeItem('ss.pendingBt');
  try { loadStrategyAndRun(JSON.parse(raw)); return true; } catch { return false; }
}
function fromShareLink() {
  const m = location.hash.match(/[?&]s=([^&]+)/);
  if (!m) return null;
  try { return JSON.parse(decodeURIComponent(escape(atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))))); } catch { return null; }
}
function shareLink() {
  const keep = { period: st.period, currency: st.currency, initial: st.initial, flow: st.flow, reinvest: st.reinvest, feeBp: st.feeBp, benchmark: st.benchmark, portfolios: st.portfolios };
  const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(keep)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${location.origin}${location.pathname}#backtest?s=${b64}`;
}

export function initBacktest(container) {
  root = container;
  st = store('ss.bt') || null;
  if (!st || !st.portfolios) st = exampleState();
  const shared = fromShareLink();
  if (shared) { st = { ...defaultBtState(), ...shared, meta: { said: ['assets', 'period', 'rebalance'], defaulted: [] } }; }
  root.innerHTML = `
    <div class="ask">
      <h1 class="ask-title">무엇을 시험해 볼까요?</h1>
      <div class="ask-box">
        <textarea id="askInput" class="input" rows="1" placeholder="예: 최근 3년간 시총 1~3위 미국 주식을 매달 말일 리밸런싱하면?" aria-label="조건을 말로 쓰기"></textarea>
        <button class="btn primary" id="askBtn" type="button">해석하기</button>
      </div>
      <div class="chips scroll" id="askChips">${EXAMPLES.map((e) => `<button class="chip" type="button" data-ex="${esc(e)}">${esc(e.length > 26 ? e.slice(0, 25) + '…' : e)}</button>`).join('')}</div>
      <div class="sentence" id="sentence"></div>
      <div id="sentenceNotes"></div>
    </div>
    <div class="bt-layout">
      <aside class="surface bt-input" id="btInput" aria-label="포트폴리오와 조건"></aside>
      <div class="surface result" id="btResult"></div>
    </div>`;
  const ta = $('#askInput', root);
  ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = `${Math.min(120, ta.scrollHeight)}px`; });
  ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); interpret(ta.value); } });
  $('#askBtn', root).onclick = () => interpret(ta.value);
  $$('#askChips .chip', root).forEach((b) => { b.onclick = () => { ta.value = b.dataset.ex; interpret(b.dataset.ex); }; });
  renderSentence();
  renderInput();
  renderEmpty();
  if (!consumePending() && shared) run();
}

/** 화면 기본값(엔진 기본값과 다름): 거래비용 0.1%, 밴드 월말 점검 — 설정에서 바꿀 수 있음 */
function applyUiDefaults(state, report = null) {
  const cfg = settings();
  const said = report?.said || state.meta?.said || [];
  if (!said.includes('fee') && !report?.patch) { state.feeBp = cfg.feeBp ?? 10; if (state.meta && !state.meta.defaulted.includes('fee')) state.meta.defaulted.push('fee'); }
  state.portfolios.forEach((p) => { p.band = { ...(p.band || {}), daily: p.band?.daily ?? cfg.bandDaily ?? false }; });
}

function exampleState() {
  const s = defaultBtState();
  s.portfolios[0] = { ...newPortfolio('나스닥100 60 + 배당 40'), assets: [{ key: 'QQQ', w: 60 }, { key: 'SCHD', w: 40 }] };
  s.currency = settings().currency; s.initial = s.currency === 'USD' ? 10000 : 10000000; s.benchmark = 'SPY';
  s.meta = { said: [], defaulted: ['fee'] };
  applyUiDefaults(s);
  return s;
}
function save() { store('ss.bt', st); }
function markStale() {
  save();
  if (last && !stale) { stale = true; const r = $('#btResult', root); r.classList.add('stale'); r.prepend(el(`<div class="stale-bar">조건이 바뀌었어요. 아래 결과는 이전 조건 기준이에요. <button class="btn small" type="button" id="rerun">다시 실행</button></div>`)); $('#rerun', root).onclick = run; }
  renderSentence();
}

// ------------------------------------------------------------------ 자연어
async function interpret(text, { useAI = false } = {}) {
  if (!text.trim()) return;
  let out;
  if (useAI) {
    try { out = await aiParse(text, st); } catch (e) { toast(`AI 해석 실패: ${e.message}`); return; }
  } else out = parseCommand(text, last ? st : null);
  const { state, report } = out;
  if (report.empty && !report.patch) {
    showNotes(report, text);
    return;
  }
  if (state.source === 'assets') {
    window.dispatchEvent(new CustomEvent('assets:request-strategy', { detail: { cb: (assets) => { if (assets?.length) { state.portfolios[0].assets = assets; state.portfolios[0].name = '내 포트폴리오'; state.portfolios[0].rebalance = 'band'; state.portfolios[0].band = { abs: settings().bandAbs, rel: 0, cap: settings().capProduct }; } } } }));
  }
  const prev = structuredClone(st);
  st = state;
  if (!st.meta) st.meta = { said: report.said, defaulted: report.defaulted };
  applyUiDefaults(st, report);
  active = 0;
  save();
  renderSentence();
  renderInput();
  showNotes(report, text);
  if (report.patch) toast('말한 부분만 바꿨어요.', { label: '되돌리기', fn: () => { st = prev; save(); renderSentence(); renderInput(); } });
  if (!report.empty) run();
}

function showNotes(report, text) {
  const box = $('#sentenceNotes', root);
  const items = [];
  (report.warnings || []).forEach((w) => items.push(`<div class="sentence-note">⚠ ${esc(w)}</div>`));
  const d = (report.defaulted || []).filter((x) => !x.startsWith('generic'));
  if (d.length && !report.patch) items.push(`<div class="sentence-note info">점선은 말하지 않아서 기본값으로 정한 부분이에요. 눌러서 바꿀 수 있어요.</div>`);
  if (st.period?.note) items.push(`<div class="sentence-note info">${esc(st.period.note)}</div>`);
  if (hasKey() && text && (report.empty || (report.warnings || []).length)) items.push(`<div class="sentence-note info"><button class="btn small" type="button" id="aiRetry">AI로 다시 해석</button> 입력한 문장만 Anthropic API로 보내요(보유 자산은 보내지 않아요).</div>`);
  box.innerHTML = items.join('');
  $('#aiRetry', box)?.addEventListener('click', () => interpret(text, { useAI: true }));
}

// ------------------------------------------------------------------ 조건 문장 바
function slot(name, text, cls = '') {
  const said = st.meta?.said || [], def = st.meta?.defaulted || [];
  const assumed = def.includes(name) || (!said.length && !def.length ? false : !said.includes(name) && ['period', 'rebalance', 'initial', 'currency', 'benchmark', 'market', 'weighting', 'topN'].includes(name) && def.includes(name));
  return `<button class="slot ${assumed ? 'assumed' : ''} ${cls}" type="button" data-slot="${name}">${esc(text)}</button>`;
}
function periodText() {
  const p = st.period || {};
  if (p.preset === 'max') return '데이터가 있는 전체 기간';
  if (p.preset) { const n = parseInt(p.preset, 10); return p.preset.endsWith('m') ? `최근 ${n}개월` : `최근 ${n}년`; }
  if (p.start && p.end) return `${p.start.replace('-', '.')} ~ ${p.end.replace('-', '.')}`;
  if (p.start) return `${p.start.replace('-', '.')}부터 지금까지`;
  return '최근 10년';
}
function pfText(pf) {
  if (pf.kind === 'rank') {
    const r = pf.rank;
    const range = r.from > 1 ? `${r.from}~${r.top}위` : r.top === 1 ? '1위' : `상위 ${r.top}개`;
    return `${GROUPS[r.group]} ${METRICS[r.metric]} ${range}${r.metric === 'mom' ? `(${r.lookback}개월${r.skip ? `, 최근 ${r.skip}개월 제외` : ''})` : ''}`;
  }
  if (!pf.assets.length) return '종목을 골라 주세요';
  return pf.assets.map((a) => `${short(a.key)} ${trimNum(a.w)}`).join(' · ');
}
const trimNum = (w) => String(+(+w).toFixed(1));
const short = (k) => { const n = assetInfo(k)?.n || k; return /^[0-9A-Z]{6}$/.test(k) && /\d/.test(k) ? n : (assetInfo(k)?.m === 'US' ? k : n); };
function flowText() {
  const f = st.flow;
  if (!f || f.type === 'none') return '적립·인출 없음';
  const fq = { M: '매달', Q: '분기마다', A: '매년' }[f.freq];
  if (f.type === 'withdrawPct') return `${fq} 평가액의 ${f.pct}% 인출`;
  return `${fq} ${fmtMoney(f.amount, st.currency)} ${f.type === 'contribute' ? '적립' : '인출'}${f.growth ? `(매년 ${f.growth}% 증액)` : ''}`;
}
function renderSentence() {
  const box = $('#sentence', root);
  if (!box) return;
  const pfs = st.portfolios;
  const pfPart = pfs.map((pf, i) => `${pfs.length > 1 ? `<span class="faint">P${i + 1}</span> ` : ''}${slot(pf.kind === 'rank' ? 'rank' : 'assets', pfText(pf), `pf-${i}`)}`).join(pfs.length > 1 ? ' 와 ' : '');
  const pf0 = pfs[0];
  const weighting = pf0.kind === 'rank' ? ` 종목을 ${slot('weighting', { equal: '같은 비중', mcap: '시총 비중', invvol: '변동성 반비례 비중' }[pf0.rank.weighting])}으로 담고` : '을 담고';
  const reb = pfs.length > 1 && new Set(pfs.map((p) => p.rebalance)).size > 1 ? '포트폴리오별로' : rebText(pf0);
  box.innerHTML = `${slot('period', periodText())} 동안 ${pfPart}${weighting} ${slot('rebalance', reb)} 리밸런싱 · 시작 ${slot('initial', fmtMoney(st.initial, st.currency))} · ${slot('currency', st.currency === 'KRW' ? '원화 기준' : '달러 기준')} · ${slot('flow', flowText())} · 거래비용 ${slot('fee', st.feeBp ? `${(st.feeBp / 100).toFixed(2).replace(/0$/, '')}%` : '없음')} · 비교 ${slot('benchmark', st.benchmark ? benchLabel(st.benchmark) : '없음')}${st.portfolios.some((p) => p.kind === 'rank') ? ' <span class="status-pill caution" title="과거 시가총액·후보 목록이 추정이에요">추정</span>' : ''}`;
  $$('.slot', box).forEach((b) => { b.onclick = () => editSlot(b.dataset.slot, b); });
}
function rebText(pf) { return pf.rebalance === 'band' ? `비중이 ±${pf.band.abs || pf.band.rel}${pf.band.abs ? '%p' : '%'} 벗어날 때` : REB[pf.rebalance] + (pf.rebMonth && pf.rebalance === 'A' ? `(${pf.rebMonth}월)` : ''); }
const benchLabel = (k) => (BENCH_PRESETS.find((b) => b[0] === k)?.[1] || `${assetInfo(k)?.n || k}`);

function editSlot(name, anchor) {
  const markSaid = () => { st.meta = st.meta || { said: [], defaulted: [] }; st.meta.defaulted = (st.meta.defaulted || []).filter((x) => x !== name); if (!st.meta.said.includes(name)) st.meta.said.push(name); };
  if (['assets', 'rank', 'weighting', 'market', 'topN'].includes(name)) {
    const idx = +([...anchor.classList].find((c) => c.startsWith('pf-'))?.slice(3) || 0);
    active = idx; renderInput();
    $('#btInput', root).scrollIntoView({ behavior: 'smooth', block: 'start' });
    markSaid();
    return;
  }
  const forms = {
    period: () => periodForm(),
    rebalance: () => `<label class="field">리밸런싱 (모든 포트폴리오)${rebControls(st.portfolios[0], 'all')}</label>`,
    initial: () => `<label class="field">시작 금액<div class="input-unit"><input class="input num" id="f_initial" inputmode="numeric" value="${st.initial}"><span>${st.currency === 'KRW' ? '원' : '$'}</span></div></label>`,
    currency: () => `<div class="field">기준 통화<div class="seg" id="f_cur"><button type="button" data-v="KRW" aria-pressed="${st.currency === 'KRW'}">원화</button><button type="button" data-v="USD" aria-pressed="${st.currency === 'USD'}">달러</button></div><p class="cap">원화 기준이면 미국 자산은 그날 환율로 바꿔 계산해요(환율 변화가 수익에 들어가요).</p></div>`,
    flow: () => flowForm(),
    benchmark: () => benchForm(),
    fee: () => `<label class="field">거래비용(편도)<div class="input-unit"><input class="input num" id="f_fee" inputmode="decimal" value="${(st.feeBp || 0) / 100}"><span>%</span></div></label><div class="chips"><button class="chip" type="button" data-feev="0">비용 0 (포트폴리오 비주얼라이저와 맞추기)</button><button class="chip" type="button" data-feev="0.1">0.1%</button><button class="chip" type="button" data-feev="0.25">0.25%</button></div><p class="cap">사고팔 때마다 거래 금액의 이 비율만큼 빠져요. 자주 갈아타는 전략일수록 영향이 커요.</p>`,
  };
  const sh = sheet(`<h3>조건 바꾸기</h3><div class="stack" id="slotForm">${forms[name]()}</div><div class="actions"><button class="btn" type="button" data-close>취소</button><button class="btn primary" type="button" data-ok>적용</button></div>`);
  wireForms(sh.root);
  $$('[data-feev]', sh.root).forEach((b) => { b.onclick = () => { $('#f_fee', sh.root).value = b.dataset.feev; }; });
  $('[data-close]', sh.root).onclick = sh.close;
  $('[data-ok]', sh.root).onclick = () => { readForms(sh.root); markSaid(); sh.close(); renderSentence(); renderInput(); markStale(); };
}

function periodForm() {
  const p = st.period || {};
  const presets = [['1y', '1년'], ['3y', '3년'], ['5y', '5년'], ['10y', '10년'], ['20y', '20년'], ['max', '최대']];
  return `<div class="field">기간<div class="chips" id="f_preset">${presets.map(([v, l]) => `<button class="chip" type="button" data-v="${v}" aria-pressed="${p.preset === v}">${l}</button>`).join('')}</div></div>
    <div class="grid2 months"><label class="field">시작 달<input class="input" type="month" id="f_start" value="${p.start || ''}" min="2000-02"></label><label class="field">끝 달(비우면 최근)<input class="input" type="month" id="f_end" value="${p.end || ''}"></label></div>`;
}
function flowForm() {
  const f = st.flow || { type: 'none', amount: 0, freq: 'M', growth: 0, pct: 4 };
  return `<label class="field">적립·인출<select class="input" id="f_ftype">${[['none', '없음'], ['contribute', '정액 적립'], ['withdraw', '정액 인출'], ['withdrawPct', '정률 인출(평가액의 %)']].map(([v, l]) => `<option value="${v}" ${f.type === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    <div class="grid2"><label class="field">금액<div class="input-unit"><input class="input num" id="f_famt" inputmode="numeric" value="${f.amount || 0}"><span>${st.currency === 'KRW' ? '원' : '$'}</span></div></label>
    <label class="field">주기<select class="input" id="f_ffreq">${[['M', '매달'], ['Q', '분기마다'], ['A', '매년']].map(([v, l]) => `<option value="${v}" ${f.freq === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
    <div class="grid2"><label class="field">정률 인출 %(연)<div class="input-unit"><input class="input num" id="f_fpct" inputmode="decimal" value="${f.pct ?? 4}"><span>%</span></div></label>
    <label class="field">매년 증액<div class="input-unit"><input class="input num" id="f_fgrow" inputmode="decimal" value="${f.growth || 0}"><span>%</span></div></label></div>`;
}
function benchForm() {
  return `<div class="field">비교 대상(벤치마크)<div class="chips" id="f_bench">${BENCH_PRESETS.map(([k, l]) => `<button class="chip" type="button" data-v="${k}" aria-pressed="${(st.benchmark || '') === k}">${l}</button>`).join('')}</div></div>
    <label class="field">직접 고르기<div class="search"><input class="input" id="f_bsearch" placeholder="이름이나 티커" autocomplete="off"><ul class="search-list" hidden></ul></div></label>
    <p class="cap">배당을 포함한 ETF로 비교해요. 지수(S&P 500 지수 등)는 배당이 빠져 있어 불리하게 보여요.</p>`;
}
function rebControls(pf, scope) {
  const b = pf.band || { abs: 5, rel: 0 };
  return `<div class="seg" data-reb="${scope}">${Object.entries(REB).filter(([k]) => pf.kind !== 'rank' || (k !== 'band' && k !== 'none')).map(([k, l]) => `<button type="button" data-v="${k}" aria-pressed="${pf.rebalance === k}">${l.replace(' 말', '')}</button>`).join('')}</div>
    <div class="grid3 band-fields" ${pf.rebalance === 'band' ? '' : 'hidden'} style="margin-top:8px">
      <label class="field">절대 폭<div class="input-unit"><input class="input num" data-band="abs" inputmode="decimal" value="${b.abs || ''}"><span>%p</span></div></label>
      <label class="field">상대 폭<div class="input-unit"><input class="input num" data-band="rel" inputmode="decimal" value="${b.rel || ''}"><span>%</span></div></label>
      <label class="field">상한<div class="input-unit"><input class="input num" data-band="cap" inputmode="decimal" value="${b.cap || ''}"><span>%</span></div></label>
      <label class="toggle" style="grid-column:1/-1"><input type="checkbox" data-band-daily ${b.daily ? 'checked' : ''}> 매일 종가로 점검(끄면 월말에만 점검)</label>
    </div>`;
}
function wireForms(r) {
  $$('.seg button, .chips button[data-v]', r).forEach((b) => b.addEventListener('click', () => {
    const grp = b.parentElement;
    $$('button', grp).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    if (grp.dataset.reb) { const bf = grp.parentElement.querySelector('.band-fields'); if (bf) bf.hidden = b.dataset.v !== 'band'; }
    if (grp.id === 'f_preset') { $('#f_start', r).value = ''; $('#f_end', r).value = ''; }
  }));
  const bs = $('#f_bsearch', r);
  if (bs) attachSearch(bs, (it) => { st.benchmark = it.k; $$('#f_bench button', r).forEach((x) => x.setAttribute('aria-pressed', 'false')); bs.value = it.n; bs.dataset.key = it.k; });
}
function readForms(r) {
  const pressed = (sel) => $(`${sel} button[aria-pressed="true"]`, r)?.dataset.v;
  if ($('#f_preset', r)) {
    const s = $('#f_start', r).value, e = $('#f_end', r).value;
    st.period = s ? { preset: null, start: s, end: e || null } : { preset: pressed('#f_preset') || '10y', start: null, end: null };
  }
  const reb = $('[data-reb="all"]', r);
  if (reb) {
    const v = pressed('[data-reb="all"]');
    const band = {}; $$('[data-band]', r).forEach((x) => { band[x.dataset.band] = +x.value || 0; }); band.daily = !!$('[data-band-daily]', r)?.checked;
    st.portfolios.forEach((p) => { if (p.kind === 'rank' && (v === 'band' || v === 'none')) return; p.rebalance = v; if (v === 'band') p.band = band; });
  }
  if ($('#f_initial', r)) st.initial = +$('#f_initial', r).value.replace(/[^\d.]/g, '') || st.initial;
  if ($('#f_cur', r)) { const c = pressed('#f_cur'); if (c && c !== st.currency) { st.currency = c; } }
  if ($('#f_ftype', r)) st.flow = { type: $('#f_ftype', r).value, amount: +$('#f_famt', r).value.replace(/[^\d.]/g, '') || 0, freq: $('#f_ffreq', r).value, pct: +$('#f_fpct', r).value || 4, growth: +$('#f_fgrow', r).value || 0 };
  if ($('#f_fee', r)) st.feeBp = Math.round((+$('#f_fee', r).value || 0) * 100);
  if ($('#f_bench', r)) { const v = pressed('#f_bench'); const bs = $('#f_bsearch', r); st.benchmark = bs?.dataset.key || (v ?? st.benchmark) || null; if (v === '') st.benchmark = null; }
}

// ------------------------------------------------------------------ 입력 패널
function renderInput() {
  const box = $('#btInput', root);
  const pf = st.portfolios[active] || st.portfolios[0];
  box.innerHTML = `
    <div class="pf-tabs" role="tablist">
      ${st.portfolios.map((p, i) => `<button class="pf-tab" role="tab" type="button" data-i="${i}" aria-selected="${i === active}"><span class="dot" style="background:${seriesColor(i)}"></span>P${i + 1}</button>`).join('')}
      ${st.portfolios.length < 3 ? '<button class="pf-tab" type="button" id="addPf">+ 비교 추가</button>' : ''}
    </div>
    <input class="pf-name" id="pfName" value="${esc(pf.name)}" aria-label="포트폴리오 이름">
    <div class="seg" id="pfKind" style="margin-bottom:12px"><button type="button" data-v="static" aria-pressed="${pf.kind === 'static'}">직접 고르기</button><button type="button" data-v="rank" aria-pressed="${pf.kind === 'rank'}">규칙으로 고르기</button></div>
    <div id="pfEditor"></div>
    <div class="field" style="margin-top:14px"><span class="row" style="justify-content:space-between">리밸런싱 <button class="help" type="button" data-help="band">?</button></span>${rebControls(pf, 'pf')}</div>
    <details class="more" ${matchMedia('(min-width:1025px)').matches ? 'open' : ''}>
      <summary>조건 세부</summary>
      <div class="cond">
        ${periodForm()}
        <div class="row" style="align-items:flex-end"><label class="field" style="flex:1;min-width:150px">시작 금액<div class="input-unit"><input class="input num" id="c_initial" inputmode="numeric" value="${st.initial}"><span>${st.currency === 'KRW' ? '원' : '$'}</span></div></label>
          <div class="field">기준 통화<div class="seg" id="c_cur"><button type="button" data-v="KRW" aria-pressed="${st.currency === 'KRW'}">원화</button><button type="button" data-v="USD" aria-pressed="${st.currency === 'USD'}">달러</button></div></div></div>
        ${flowForm()}
        <div class="grid2"><label class="toggle"><input type="checkbox" id="c_reinvest" ${st.reinvest !== false ? 'checked' : ''}> 배당 재투자</label>
          <label class="field">거래비용(편도)<div class="input-unit"><input class="input num" id="c_fee" inputmode="decimal" value="${(st.feeBp || 0) / 100}"><span>%</span></div></label></div>
        <button class="chip" type="button" id="fee0" style="justify-self:start">비용 0 (포트폴리오 비주얼라이저와 맞추기)</button>
        ${benchForm()}
      </div>
    </details>
    ${pf.kind === 'static' && st.portfolios.length > 1 ? '<button class="btn ghost small" type="button" id="rmPf">이 포트폴리오 비교에서 빼기</button>' : ''}
    <div class="run-bar"><button class="btn primary big" type="button" id="runBtn">백테스트 실행</button><div class="progress" hidden><i></i></div></div>`;
  $$('.pf-tab[data-i]', box).forEach((b) => { b.onclick = () => { active = +b.dataset.i; renderInput(); }; });
  $('#addPf', box)?.addEventListener('click', () => { const p = newPortfolio(`포트폴리오 ${st.portfolios.length + 1}`); p.assets = structuredClone(pf.assets); p.kind = pf.kind; p.rank = structuredClone(pf.rank); st.portfolios.push(p); active = st.portfolios.length - 1; renderInput(); markStale(); });
  $('#rmPf', box)?.addEventListener('click', () => { st.portfolios.splice(active, 1); active = 0; renderInput(); markStale(); });
  $('#pfName', box).onchange = (e) => { pf.name = e.target.value || `포트폴리오 ${active + 1}`; markStale(); };
  $$('#pfKind button', box).forEach((b) => { b.onclick = () => { pf.kind = b.dataset.v; if (pf.kind === 'rank' && ['band', 'none'].includes(pf.rebalance)) pf.rebalance = 'M'; renderInput(); markStale(); }; });
  $$('[data-help]', box).forEach((b) => { b.onclick = () => helpPop(b, b.dataset.help); });
  wireForms(box);
  // 리밸런싱(이 포트폴리오)
  $$('[data-reb="pf"] button', box).forEach((b) => b.addEventListener('click', () => { pf.rebalance = b.dataset.v; markStale(); }));
  $$('[data-band]', box).forEach((x) => { x.onchange = () => { pf.band = { ...(pf.band || {}), [x.dataset.band]: +x.value || 0 }; markStale(); }; });
  $$('[data-band-daily]', box).forEach((x) => { x.onchange = () => { pf.band = { ...(pf.band || {}), daily: x.checked }; markStale(); }; });
  // 조건 세부 → 즉시 반영
  const sync = () => {
    readForms($('.cond', box));
    st.initial = +$('#c_initial', box).value.replace(/[^\d.]/g, '') || st.initial;
    const cur = $('#c_cur button[aria-pressed="true"]', box)?.dataset.v; if (cur) st.currency = cur;
    st.reinvest = $('#c_reinvest', box).checked;
    st.feeBp = Math.round((+$('#c_fee', box).value || 0) * 100);
    markStale();
  };
  $$('.cond input, .cond select', box).forEach((x) => x.addEventListener('change', sync));
  $('#fee0', box).onclick = () => { $('#c_fee', box).value = 0; st.meta = st.meta || { said: [], defaulted: [] }; st.meta.defaulted = (st.meta.defaulted || []).filter((x) => x !== 'fee'); sync(); };
  $$('.cond button', box).forEach((x) => x.addEventListener('click', () => setTimeout(sync, 0)));
  renderEditor(pf);
  $('#runBtn', box).onclick = run;
}

function renderEditor(pf) {
  const box = $('#pfEditor', root);
  if (pf.kind === 'rank') {
    const r = pf.rank;
    box.innerHTML = `<div class="stack">
      <div class="grid2"><label class="field">고를 곳<select class="input" id="r_group">${Object.entries(GROUPS).map(([k, l]) => `<option value="${k}" ${r.group === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field">순위 기준<select class="input" id="r_metric">${Object.entries(METRICS).map(([k, l]) => `<option value="${k}" ${r.metric === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="grid3"><label class="field">몇 위부터<input class="input num" id="r_from" type="number" min="1" value="${r.from || 1}"></label><label class="field">몇 위까지<input class="input num" id="r_top" type="number" min="1" max="30" value="${r.top}"></label>
      <label class="field">비중<select class="input" id="r_w"><option value="equal" ${r.weighting === 'equal' ? 'selected' : ''}>같게</option><option value="mcap" ${r.weighting === 'mcap' ? 'selected' : ''}>시총 비례</option><option value="invvol" ${r.weighting === 'invvol' ? 'selected' : ''}>변동성 반비례</option></select></label></div>
      <div class="grid3" ${r.metric === 'mcap' ? 'hidden' : ''}><label class="field">살펴볼 기간<div class="input-unit"><input class="input num" id="r_lb" type="number" min="2" value="${r.lookback}"><span>개월</span></div></label>
        <label class="field" ${r.metric !== 'mom' ? 'hidden' : ''}>최근 제외<div class="input-unit"><input class="input num" id="r_skip" type="number" min="0" value="${r.skip || 0}"><span>개월</span></div></label>
        <label class="field">한 종목 최대<div class="input-unit"><input class="input num" id="r_max" value="${r.maxW || ''}"><span>%</span></div></label></div>
      <label class="field">빼고 고를 종목(티커·코드, 쉼표로)<input class="input" id="r_ex" value="${esc((r.exclude || []).join(', '))}" placeholder="예: NVDA, TSLA"></label>
      <p class="cap">리밸런싱 때마다 그 시점에 알 수 있던 정보로만 다시 골라요. 후보는 지금 수집 목록에 있는 종목이라 과거에 사라진 종목은 빠져 있어요(생존 편향).</p></div>`;
    const upd = () => {
      Object.assign(r, { group: $('#r_group', box).value, metric: $('#r_metric', box).value, from: +$('#r_from', box).value || 1, top: Math.max(+$('#r_top', box).value || 3, +$('#r_from', box).value || 1), weighting: $('#r_w', box).value, lookback: +$('#r_lb', box)?.value || 12, skip: +$('#r_skip', box)?.value || 0, maxW: +$('#r_max', box)?.value || null, exclude: $('#r_ex', box).value.split(/[,\s]+/).map((x) => x.trim().toUpperCase()).filter(Boolean) });
      markStale();
    };
    $$('input, select', box).forEach((x) => x.addEventListener('change', () => { upd(); if (x.id === 'r_metric') renderEditor(pf); }));
    return;
  }
  const sum = pf.assets.reduce((t, a) => t + +a.w, 0);
  box.innerHTML = `
    <div class="search"><input class="input" id="addAsset" placeholder="종목 추가: 이름·티커·종목코드" autocomplete="off" role="combobox" aria-expanded="false" aria-autocomplete="list"><ul class="search-list" role="listbox" hidden></ul></div>
    <div class="asset-rows">${pf.assets.map((a, i) => {
      const it = assetInfo(a.key);
      return `<div class="asset-row"><div class="nm"><b>${esc(it?.n || a.key)}</b><span>${esc(a.key)} · ${it ? kindLabel(it) : '<span class="up">DB에 없음</span>'}</span></div>
        <div class="input-unit w-input"><input class="input num" data-wi="${i}" inputmode="decimal" value="${trimNum(a.w)}" aria-label="${esc(it?.n || a.key)} 비중"><span>%</span></div>
        <button class="x-btn" type="button" data-rm="${i}" aria-label="빼기">×</button>
        <div class="bar"><i style="width:${Math.min(100, a.w)}%;background:${seriesColor(active)}"></i></div></div>`;
    }).join('') || '<p class="cap">위 검색창에서 종목을 추가하세요. "애플", "QQQ", "삼성전자", "390390"처럼 써도 돼요.</p>'}</div>
    <div class="sum-line">${Math.abs(sum - 100) < 0.01 ? `<span class="ok">✓ 합계 100%</span>` : `<span class="bad">합계 ${trimNum(sum)}% · ${trimNum(Math.abs(100 - sum))}%p ${sum < 100 ? '남았어요' : '넘쳐요'}</span>`}
      <span style="flex:1"></span>${pf.assets.length > 1 ? '<button class="btn small" type="button" id="eqW">같은 비중으로</button>' : ''}${Math.abs(sum - 100) > 0.01 && sum > 0 ? '<button class="btn small" type="button" id="normW">100%로 맞추기</button>' : ''}</div>`;
  attachSearch($('#addAsset', box), (it) => { if (!pf.assets.some((a) => a.key === it.k)) { const left = Math.max(0, 100 - pf.assets.reduce((t, a) => t + +a.w, 0)); pf.assets.push({ key: it.k, w: left || 10 }); } renderEditor(pf); markStale(); $('#addAsset', root)?.focus(); }, true);
  $$('[data-wi]', box).forEach((x) => { x.onchange = () => { pf.assets[+x.dataset.wi].w = +x.value || 0; renderEditor(pf); markStale(); }; });
  $$('[data-rm]', box).forEach((x) => { x.onclick = () => { pf.assets.splice(+x.dataset.rm, 1); renderEditor(pf); markStale(); }; });
  $('#eqW', box)?.addEventListener('click', () => { pf.assets.forEach((a) => { a.w = +(100 / pf.assets.length).toFixed(2); }); renderEditor(pf); markStale(); });
  $('#normW', box)?.addEventListener('click', () => { pf.assets.forEach((a) => { a.w = +(a.w * 100 / sum).toFixed(2); }); renderEditor(pf); markStale(); });
}
export function kindLabel(it) { return it.m === 'US' ? (it.t === 'etf' ? '미국 ETF' : it.t === 'fund' ? '미국 펀드' : '미국 주식') : it.m === 'KR' ? (it.t === 'etf' ? '국내상장 ETF' : '국내 주식') : it.g; }

/** 검색 자동완성(ARIA combobox). allowRequest: DB에 없는 종목 추가 요청 링크 */
export function attachSearch(input, onPick, allowRequest = false) {
  const list = input.parentElement.querySelector('.search-list');
  let items = [], sel = -1;
  const close = () => { list.hidden = true; input.setAttribute('aria-expanded', 'false'); };
  const show = () => {
    const q = input.value.trim();
    items = q ? searchAssets(q, 10, (it) => it.m !== 'IDX' || /^IDX_/.test(it.k)) : [];
    if (!q) { close(); return; }
    const hl = (s) => { const i = s.toLowerCase().indexOf(q.toLowerCase()); return i < 0 ? esc(s) : `${esc(s.slice(0, i))}<b>${esc(s.slice(i, i + q.length))}</b>${esc(s.slice(i + q.length))}`; };
    list.innerHTML = items.map((it, i) => `<li role="option" data-i="${i}" aria-selected="${i === sel}">${hl(it.n)} <span class="faint">${esc(it.k)}</span><span class="t">${kindLabel(it)}</span></li>`).join('')
      + (allowRequest && /^[A-Za-z]{1,5}(-[AB])?$|^\d{6}$|^[0-9A-Z]{6}$/.test(q) && !items.some((x) => x.k.toUpperCase() === q.toUpperCase()) ? `<li data-req="${esc(q.toUpperCase())}">‘${esc(q.toUpperCase())}’은 아직 DB에 없어요 · <b>추가 요청</b></li>` : '')
      + (!items.length && !allowRequest ? '<li class="faint">찾는 종목이 없어요</li>' : '');
    list.hidden = false; input.setAttribute('aria-expanded', 'true');
    $$('li[data-i]', list).forEach((li) => { li.onmousedown = (e) => { e.preventDefault(); pick(+li.dataset.i); }; });
    $('li[data-req]', list)?.addEventListener('mousedown', (e) => { e.preventDefault(); requestTicker(e.currentTarget.dataset.req); close(); });
  };
  const pick = (i) => { const it = items[i]; if (!it) return; input.value = ''; close(); onPick(it); };
  input.addEventListener('input', () => { sel = -1; show(); });
  input.addEventListener('keydown', (e) => {
    if (list.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(items.length - 1, sel + 1); show(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); show(); }
    else if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); pick(Math.max(0, sel)); }
    else if (e.key === 'Escape') close();
  });
  input.addEventListener('blur', () => setTimeout(close, 150));
}

export function requestTicker(t) {
  const url = `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(`[종목 추가] ${t}`)}&body=${encodeURIComponent(`${t}\n\n(Seok's Stock 앱에서 보낸 요청이에요. 이슈를 만들면 1~3분 안에 DB에 추가되고 이 이슈에 결과가 달려요.)`)}`;
  const s = sheet(`<h3>‘${esc(t)}’ 추가 요청</h3><p>버튼을 누르면 GitHub에 요청서가 열려요. <b>[Submit new issue]</b>만 누르면 자동 수집이 이 종목을 처음부터 받아 DB에 넣고, 몇 분 뒤 앱을 새로 고치면 쓸 수 있어요.</p><p class="cap">저장소 주인 계정으로 로그인한 상태여야 처리돼요. 미국은 티커(예: PLTR), 국내는 6자리 코드(예: 005930)로 적어 주세요.</p><div class="actions"><button class="btn" type="button" data-close>닫기</button><a class="btn primary" href="${url}" target="_blank" rel="noopener">GitHub에서 요청하기</a></div>`);
  $('[data-close]', s.root).onclick = s.close;
}

export function helpPop(anchor, key) {
  const h = HELP[key]; if (!h) return;
  popover(anchor, `<b>${esc(h[0])}</b><p style="margin:6px 0">${esc(h[1])}</p>${h[2] ? `<p class="cap" style="margin:0">어떻게 계산했나: ${esc(h[2])}</p>` : ''}`);
}

// ------------------------------------------------------------------ 실행
function periodRange() {
  const p = st.period || { preset: '10y' };
  const endFromData = (() => { const u = getUniverse(); const e = u?.items.find((x) => x.k === 'SPY')?.e; const ym = e ? Math.floor(e / 100) : todayYm(); return ym >= todayYm() ? ymAdd(todayYm(), -1) : ym; })();
  let end = p.end ? parseYm(p.end) : endFromData;
  let start = null;
  if (p.preset === 'max') start = 200002;
  else if (p.preset) { const n = parseInt(p.preset, 10); start = ymAdd(end, -(p.preset.endsWith('m') ? n : n * 12) + 1); }
  else if (p.start) start = parseYm(p.start);
  else start = ymAdd(end, -119);
  return { start: ymToIso(start), end: ymToIso(end) };
}
function toEngine(pf) {
  const { start, end } = periodRange();
  const f = st.flow || { type: 'none' };
  const amount = f.type === 'contribute' ? +f.amount : f.type === 'withdraw' ? -f.amount : 0;
  return {
    name: pf.name, kind: pf.kind, assets: pf.assets.filter((a) => +a.w > 0), rank: pf.rank, start, end, rebalance: pf.rebalance, band: pf.band, rebMonth: pf.rebMonth,
    initial: +st.initial, flow: { type: f.type, amount, freq: f.freq || 'M', growth: +f.growth || 0, pct: +f.pct || 0 }, currency: st.currency, reinvest: st.reinvest !== false, feeBp: +st.feeBp || 0,
  };
}

async function run() {
  const btn = $('#runBtn', root), prog = $('.progress', root);
  for (const pf of st.portfolios) {
    if (pf.kind === 'static' && !pf.assets.some((a) => +a.w > 0)) { toast(`${pf.name}에 종목을 넣어 주세요.`); return; }
    const missing = pf.kind === 'static' ? pf.assets.filter((a) => !assetInfo(a.key)) : [];
    if (missing.length) { toast(`${missing.map((a) => a.key).join(', ')}은 아직 DB에 없어요. 검색창에서 추가 요청할 수 있어요.`); return; }
  }
  btn.disabled = true; prog.hidden = false;
  const setP = (d, t, label) => { btn.textContent = `시세 받는 중 ${d}/${t}${label ? ` · ${label}` : ''}`; prog.firstChild.style.width = `${(d / Math.max(1, t)) * 100}%`; };
  try {
    const runs = [];
    for (let i = 0; i < st.portfolios.length; i++) {
      const strat = toEngine(st.portfolios[i]);
      const res = await runBacktest(strat, { onProgress: (d, t) => setP(d, t, `P${i + 1}`) });
      runs.push({ i, strat, res });
    }
    btn.textContent = '계산 중…';
    // 모든 포트폴리오를 같은 기간으로 맞춤(가장 늦은 시작 ~ 가장 이른 끝)
    const s0 = Math.max(...runs.map((r) => r.res.startYm)), e0 = Math.min(...runs.map((r) => r.res.endYm));
    for (const r of runs) if (r.res.startYm !== s0 || r.res.endYm !== e0) { r.strat = { ...r.strat, start: ymToIso(s0), end: ymToIso(e0) }; r.res = await runBacktest(r.strat); }
    let bench = null;
    if (st.benchmark && assetInfo(st.benchmark)) {
      const bs = { ...toEngine({ ...newPortfolio('벤치마크'), assets: [{ key: st.benchmark, w: 100 }], rebalance: 'none' }), start: ymToIso(s0), end: ymToIso(e0) };
      try { const bres = await runBacktest(bs); if (bres.startYm === s0) bench = { key: st.benchmark, strat: bs, res: bres, m: computeMetrics(bres, null, 0) }; } catch { bench = null; }
    }
    runs.forEach((r) => { r.m = computeMetrics(r.res, bench?.res || null, 0); });
    last = { runs, bench, st: structuredClone(st) };
    stale = false;
    renderResults();
    announce(`백테스트 완료. 연 ${fmtPct(runs[0].m.cagr)}, 최대 낙폭 ${fmtPct(runs[0].m.mdd)}`);
    if (isMobile()) $('#btResult', root).scrollIntoView({ behavior: 'smooth' });
  } catch (e) {
    console.error(e);
    toast(e.message || '계산하지 못했어요.');
  } finally {
    btn.disabled = false; btn.textContent = '다시 실행'; prog.hidden = true;
  }
}
export function loadStrategyAndRun(state) { st = { ...defaultBtState(), ...state, meta: { said: ['assets'], defaulted: [] } }; active = 0; save(); renderSentence(); renderInput(); run(); }

// ------------------------------------------------------------------ 결과
function renderEmpty() {
  $('#btResult', root).innerHTML = `<div class="empty"><p>위에 조건을 말로 쓰거나, 왼쪽에서 종목을 고른 뒤 실행하세요.</p>
    <button class="btn primary" type="button" id="exRun">예시로 바로 보기</button><p class="cap" style="margin-top:10px">나스닥100 60% + 미국 배당 40%, 최근 10년, S&P 500과 비교</p></div>`;
  $('#exRun', root).onclick = () => { st = exampleState(); st.meta = { said: [], defaulted: [] }; active = 0; renderSentence(); renderInput(); run(); };
}

const money = (v) => fmtMoney(v, last.st.currency);
const label = (k) => assetInfo(k)?.n || k;

function renderResults() {
  const { runs, bench } = last;
  const R = $('#btResult', root);
  R.classList.remove('stale');
  const r0 = runs[0], m0 = r0.m;
  const kpi = (lb, help, val, cmp, others = '') => `<div class="kpi"><div class="lb">${lb}${help ? ` <button class="help" type="button" data-help="${help}">?</button>` : ''}</div><div class="v">${val}</div><div class="cmp">${cmp}</div>${others}</div>`;
  const more = (fn) => (runs.length > 1 ? `<div class="more">${runs.slice(1).map((r) => `<span><i style="background:${seriesColor(r.i)}"></i>${fn(r.m)}</span>`).join('')}</div>` : '');
  const notes = [...new Set(runs.flatMap((r) => r.res.notes))];
  R.innerHTML = `
    <div class="result-head"><p class="result-title">${esc($('#sentence', root)?.innerText || '')}</p>${notes.length ? `<ul class="notes">${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}</div>
    <div class="kpis">
      ${kpi('연환산 수익률', 'cagr', `<span class="${dirClass(m0.cagr)}">${fmtPct(m0.cagr)}</span>`, bench ? `${esc(shortBench(bench.key))} ${fmtPct(bench.m.cagr)}` : fmtSpan(m0.months), more((m) => fmtPct(m.cagr)))}
      ${kpi('최종 금액', 'final', money(m0.final), `누적 ${fmtPct(m0.totalReturn, 1, true)}`, more((m) => fmtMoneyShort(m.final, last.st.currency)))}
      ${kpi('최대 낙폭', 'mdd', fmtPct(m0.mdd), bench ? `${esc(shortBench(bench.key))} ${fmtPct(bench.m.mdd)}` : fmtYm(m0.mddAt), more((m) => fmtPct(m.mdd)))}
      ${kpi('변동성', 'vol', fmtPct(m0.vol), bench ? `${esc(shortBench(bench.key))} ${fmtPct(bench.m.vol)}` : '연 기준', more((m) => fmtPct(m.vol)))}
      ${kpi('샤프 지수', 'sharpe', fmtNum(m0.sharpe), bench ? `${esc(shortBench(bench.key))} ${fmtNum(bench.m.sharpe)}` : '', more((m) => fmtNum(m.sharpe)))}
      ${kpi('벤치마크 대비', 'excess', bench ? `<span class="${dirClass(m0.excessCagr)}">${fmtPp(m0.excessCagr)}</span>` : '–', bench ? `베타 ${fmtNum(m0.beta)}` : '비교 대상 없음', bench ? more((m) => fmtPp(m.excessCagr)) : '')}
    </div>
    <div class="row" style="padding:8px 16px 0;justify-content:space-between">${runs.some((r) => r.strat.kind === 'rank') ? '<span class="cap"><span class="status-pill caution">추정</span> 지금 DB에 있는 종목 안에서만 순위를 매겨요. 과거에 컸다가 사라진 종목이 빠져 있어 실제보다 좋게 나올 수 있어요.</span>' : '<span></span>'}
      <div class="seg" id="resCur"><button type="button" data-v="KRW" aria-pressed="${last.st.currency === 'KRW'}">원화로 보기</button><button type="button" data-v="USD" aria-pressed="${last.st.currency === 'USD'}">달러로 보기</button></div></div>
    <div class="story">${story(r0, bench, money, label).map((s) => `<p style="margin:0 0 6px">${s}</p>`).join('')}</div>
    <div class="chart-tools"><div class="legend" id="growthLegend"></div><span style="flex:1"></span>
      <div class="seg"><button type="button" data-scale="lin" aria-pressed="${!logScale}">선형</button><button type="button" data-scale="log" aria-pressed="${logScale}">로그</button></div>
      <button class="btn small ghost" type="button" id="growthTbl">표로 보기</button></div>
    <div class="readout" id="growthReadout"></div>
    <div class="chart-box"><div class="chart" id="growthChart" role="img" aria-label="성장 곡선"></div><div class="chart" id="ddBand" style="height:90px" role="img" aria-label="낙폭 띠"></div><div id="growthTable" hidden></div></div>
    <div class="section"><div class="section-title">진단과 대안 <span class="cap">문제마다 같은 기간으로 다시 계산한 대안을 함께 보여줘요</span></div><div class="cards" id="diagCards"><p class="cap">계산 중…</p></div>
      <div class="row" style="margin-top:16px"><button class="btn" type="button" id="toPlan">목표·노후로 수익률 보내기</button><button class="btn ghost" type="button" id="share">링크 복사</button><button class="btn ghost" type="button" id="csv">CSV 내보내기</button></div></div>
    <nav class="subtabs" role="tablist" id="subtabs"></nav>
    <div class="subpanel" id="subpanel"></div>`;
  $$('[data-help]', R).forEach((b) => { b.onclick = () => helpPop(b, b.dataset.help); });
  drawGrowth();
  $$('[data-scale]', R).forEach((b) => { b.onclick = () => { logScale = b.dataset.scale === 'log'; $$('[data-scale]', R).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); drawGrowth(); }; });
  $$('#resCur button', R).forEach((b) => { b.onclick = () => { if (b.dataset.v === st.currency) return; const k = st.currency === 'KRW' ? 1 : 1; void k; const fx = assetInfo('FX_USDKRW')?.p || 1400; st.initial = b.dataset.v === 'USD' ? Math.round(st.initial / fx) : Math.round(st.initial * fx / 10000) * 10000; if (st.flow?.amount) st.flow.amount = b.dataset.v === 'USD' ? Math.round(st.flow.amount / fx) : Math.round(st.flow.amount * fx / 10000) * 10000; st.currency = b.dataset.v; save(); renderSentence(); renderInput(); run(); }; });
  $('#toPlan', R).onclick = () => sendToPlan();
  $('#csv', R).onclick = () => exportCsv();
  $('#share', R).onclick = async () => { const url = shareLink(); try { await navigator.clipboard.writeText(url); toast('조건이 담긴 링크를 복사했어요(보유 자산은 담기지 않아요).'); } catch { prompt('이 링크를 복사하세요', url); } };
  renderDiagnosis();
  $('#growthTbl', R).onclick = (e) => { const t = $('#growthTable', R); t.hidden = !t.hidden; e.target.textContent = t.hidden ? '표로 보기' : '차트만 보기'; if (!t.hidden) t.innerHTML = growthTable(); };
  const hasRank = runs.some((r) => r.res.rankHistory);
  const tabs = [...(hasRank ? [['holdings', '보유 변화']] : []), ['annual', '연도별'], ['monthly', '월별'], ['dd', '낙폭'], ['rolling', '롤링'], ['assets', '자산'], ['metrics', '지표'], ['data', '데이터와 가정']];
  if (!tabs.some((t) => t[0] === subtab) || (hasRank && subtab === 'annual' && !last._visited)) subtab = tabs[0][0];
  last._visited = true;
  $('#subtabs', R).innerHTML = tabs.map(([k, l]) => `<button role="tab" type="button" data-k="${k}" aria-selected="${k === subtab}">${l}</button>`).join('');
  $$('#subtabs button', R).forEach((b) => { b.onclick = () => { subtab = b.dataset.k; $$('#subtabs button', R).forEach((x) => x.setAttribute('aria-selected', String(x === b))); b.scrollIntoView({ inline: 'center', block: 'nearest' }); renderSub(); }; });
  renderSub();
}
function shortBench(k) { return BENCH_PRESETS.find((b) => b[0] === k)?.[1].split(' (')[0] || k; }

function seriesList() {
  const { runs, bench } = last;
  const list = runs.map((r) => ({ name: r.strat.name, res: r.res, m: r.m, color: seriesColor(r.i) }));
  if (bench) list.push({ name: shortBench(bench.key), res: bench.res, m: bench.m, color: seriesColor('bm'), bm: true });
  return list;
}
let hidden = new Set();
function drawGrowth() {
  const list = seriesList();
  const leg = $('#growthLegend', root);
  leg.innerHTML = list.map((s, i) => `<button type="button" data-i="${i}" aria-pressed="${!hidden.has(i)}"><i style="background:${s.color}"></i>${esc(s.name)}</button>`).join('');
  $$('button', leg).forEach((b) => { b.onclick = () => { const i = +b.dataset.i; hidden.has(i) ? hidden.delete(i) : hidden.add(i); drawGrowth(); }; });
  const series = list.map((s, i) => hidden.has(i) ? null : ({
    name: s.name, color: s.color, width: s.bm ? 1.5 : 2, z: s.bm ? 1 : 3,
    data: Array.from(s.res.days, (d, j) => [d * 864e5, s.res.value[j]]),
    endLabel: (p) => `${s.name.length > 10 ? s.name.slice(0, 9) + '…' : s.name} ${fmtMoneyShort(p.value[1], last.st.currency)}`,
  })).filter(Boolean);
  const r0 = list[0].res;
  if (r0.flows && r0.flows.some((f) => f)) series.push({ name: '넣은 돈', color: css('--text-3'), dashed: true, width: 1.5, step: 'end', data: Array.from(r0.days, (d, j) => [d * 864e5, r0.invested[j]]) });
  lineChart($('#growthChart', root), { series, log: logScale, yFmt: (v, axis) => (axis ? fmtMoneyShort(v, last.st.currency) : money(v)), readout: isMobile() ? $('#growthReadout', root) : null });
  // 같은 가로축의 얇은 낙폭 띠
  const ddSeries = list.map((s2, i) => (hidden.has(i) ? null : { name: `${s2.name} 낙폭`, color: s2.color, area: !s2.bm, areaOpacity: 0.12, width: s2.bm ? 1 : 1.5, data: (() => { const dd = drawdown(Array.from(s2.res.twr)).dd; return Array.from(s2.res.days, (d, j) => [d * 864e5, dd[j]]); })() })).filter(Boolean);
  lineChart($('#ddBand', root), { series: ddSeries, yFmt: (v, ax) => fmtPct(v, 0), yMax: 0, grid: { top: 4, bottom: 4, right: series.some((x) => x.endLabel) && !isMobile() ? 96 : 16 } });
}
function growthTable() {
  const list = seriesList();
  const years = list[0].m.years.map((y) => y.year);
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>연말</th>${list.map((s) => `<th class="num">${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${years.map((y, i) => `<tr><td>${y}</td>${list.map((s) => `<td class="num">${money(s.m.years[i]?.endValue)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function renderSub() {
  const P = $('#subpanel', root);
  const list = seriesList();
  const { runs, bench } = last;
  if (subtab === 'data') {
    P.innerHTML = dataPanel();
  } else if (subtab === 'annual') {
    const years = [...new Set(list.flatMap((s) => s.m.years.map((y) => y.year)))].sort();
    P.innerHTML = `<div class="readout" id="annReadout"></div><div class="chart" id="annChart"></div>
      <div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th>연도</th>${list.map((s) => `<th class="num">${esc(s.name)}</th>`).join('')}</tr></thead><tbody>${years.map((y) => `<tr><td>${y}${list[0].m.years.find((x) => x.year === y && !x.full) ? ' <span class="cap">(일부)</span>' : ''}</td>${list.map((s) => { const v = s.m.years.find((x) => x.year === y)?.r; return `<td class="num ${dirClass(v)}">${v == null ? '–' : fmtPct(v, 1, true)}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
    barChart($('#annChart', P), { cats: years.map(String), series: list.map((s) => ({ name: s.name, color: s.color, data: years.map((y) => s.m.years.find((x) => x.year === y)?.r ?? null) })), yFmt: (v, ax) => fmtPct(v, ax ? 0 : 1, !ax), horizontal: isMobile() && years.length > 6, readout: isMobile() ? $('#annReadout', P) : null });
    if (isMobile() && years.length > 6) $('#annChart', P).style.height = `${Math.max(300, years.length * 34 * Math.min(2, list.length))}px`;
  } else if (subtab === 'monthly') {
    let pick = 0;
    const draw = () => {
      const s = list[pick];
      const tbl = monthlyTable(s.res);
      const yrs = Object.keys(tbl).sort();
      const color = (v) => { if (v == null) return ''; const a = Math.abs(v); const st2 = a >= 0.06 ? 3 : a >= 0.03 ? 2 : a >= 0.01 ? 1 : 0; if (!st2) return `background:${css('--div-0')}`; return `background:${css(`--div-${v > 0 ? 'p' : 'n'}${st2}`)};color:${st2 === 3 ? '#fff' : css('--text-1')}`; };
      P.innerHTML = `<div class="chips" style="margin-bottom:12px">${list.map((x, i) => `<button class="chip" type="button" data-p="${i}" aria-pressed="${i === pick}"><span class="dot" style="background:${x.color}"></span>${esc(x.name)}</button>`).join('')}</div>
        <div class="tbl-wrap"><table class="tbl heat"><thead><tr><th>연도</th>${Array.from({ length: 12 }, (_, i) => `<th>${i + 1}월</th>`).join('')}<th>연간</th></tr></thead><tbody>
        ${yrs.map((y) => { const yr = s.m.years.find((x) => x.year === +y)?.r; return `<tr><th>${y}</th>${tbl[y].map((v) => `<td style="${color(v)}" title="${v == null ? '' : fmtPct(v, 2, true)}">${v == null ? '' : (v * 100).toFixed(1)}</td>`).join('')}<td class="yr" style="${color(yr / 3)}">${yr == null ? '' : (yr * 100).toFixed(1)}</td></tr>`; }).join('')}</tbody></table></div>
        <p class="cap">칸 숫자는 %예요. 빨강은 오른 달, 파랑은 내린 달(설정에서 바꿀 수 있어요).</p>`;
      $$('[data-p]', P).forEach((b) => { b.onclick = () => { pick = +b.dataset.p; draw(); }; });
    };
    draw();
  } else if (subtab === 'dd') {
    const eps = drawdownEpisodes(Array.from(runs[0].res.twr), Array.from(runs[0].res.days), 5);
    P.innerHTML = `<div class="readout" id="ddReadout"></div><div class="chart short" id="ddChart"></div>
      <div class="section-title" style="margin-top:16px">${esc(runs[0].strat.name)}의 큰 낙폭 5번</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>순위</th><th>고점</th><th>바닥</th><th>회복</th><th class="num">깊이</th><th class="num">하락 기간</th><th class="num">회복 기간</th></tr></thead><tbody>
      ${eps.map((e, i) => `<tr><td>${i + 1}</td><td>${iso(e.startL)}</td><td>${iso(e.troughL)}</td><td>${e.endL == null ? '<span class="cap">아직 회복 전</span>' : iso(e.endL)}</td><td class="num">${fmtPct(e.depth)}</td><td class="num">${days(e.troughL - e.startL)}</td><td class="num">${e.endL == null ? '–' : days(e.endL - e.troughL)}</td></tr>`).join('')}</tbody></table></div>
      <p class="cap">일별 기준이에요(요약의 최대 낙폭은 월말 기준). 낙폭 = 그때까지의 최고점 대비 하락률.</p>`;
    lineChart($('#ddChart', P), { series: list.map((s) => { const dd = drawdown(Array.from(s.res.twr)).dd; return { name: s.name, color: s.color, area: !s.bm, areaOpacity: 0.1, width: s.bm ? 1.5 : 2, data: Array.from(s.res.days, (d, j) => [d * 864e5, dd[j]]) }; }), yFmt: (v, ax) => fmtPct(v, ax ? 0 : 1), yMax: 0, readout: isMobile() ? $('#ddReadout', P) : null });
  } else if (subtab === 'rolling') {
    let win = 36;
    const draw = () => {
      const rows = list.map((s) => ({ s, r: rolling(s.res, win) }));
      const stat = (a) => { const v = a.map((x) => x.r).sort((x, y) => x - y); return v.length ? [v[0], v[Math.floor(v.length / 2)], v[v.length - 1], v.filter((x) => x < 0).length / v.length] : null; };
      P.innerHTML = `<div class="row" style="margin-bottom:8px"><div class="chips">${[[12, '1년'], [36, '3년'], [60, '5년'], [120, '10년']].map(([w, l]) => `<button class="chip" type="button" data-w="${w}" aria-pressed="${w === win}">${l}</button>`).join('')}</div><button class="help" type="button" data-help="rolling">?</button></div>
        <div class="readout" id="rollReadout"></div><div class="chart short" id="rollChart"></div>
        <div class="tbl-wrap" style="margin-top:12px"><table class="tbl"><thead><tr><th></th><th class="num">가장 나빴을 때</th><th class="num">중간</th><th class="num">가장 좋았을 때</th><th class="num">손실이었던 비율</th></tr></thead><tbody>
        ${rows.map(({ s, r }) => { const x = stat(r); return `<tr><td class="name">${esc(s.name)}</td>${x ? `<td class="num">${fmtPct(x[0])}</td><td class="num">${fmtPct(x[1])}</td><td class="num">${fmtPct(x[2])}</td><td class="num">${fmtPct(x[3], 0)}</td>` : '<td colspan="4" class="cap">기간이 짧아요</td>'}</tr>`; }).join('')}</tbody></table></div>
        <p class="cap">${win >= 12 ? '연환산' : ''} 수익률. 어느 달에 시작했든 ${win / 12}년 들고 있었다면 얻었을 수익의 분포예요.</p>`;
      $$('[data-w]', P).forEach((b) => { b.onclick = () => { win = +b.dataset.w; draw(); }; });
      $$('[data-help]', P).forEach((b) => { b.onclick = () => helpPop(b, b.dataset.help); });
      const toMs = (ym) => Date.UTC(Math.floor(ym / 100), ym % 100 - 1, 28);
      lineChart($('#rollChart', P), { series: rows.map(({ s, r }) => ({ name: s.name, color: s.color, width: s.bm ? 1.5 : 2, data: r.map((x) => [toMs(x.ym), x.r]) })), yFmt: (v, ax) => fmtPct(v, ax ? 0 : 1), readout: isMobile() ? $('#rollReadout', P) : null });
    };
    draw();
  } else if (subtab === 'assets') {
    const r0 = runs[0];
    const as = assetStats(r0.res);
    P.innerHTML = `<div class="section-title">${esc(r0.strat.name)} 자산별 성과 <span class="cap">같은 기간·${last.st.currency === 'KRW' ? '원화' : '달러'} 기준</span></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>종목</th><th class="num">목표 비중</th><th class="num">연환산</th><th class="num">변동성</th><th class="num">최대 낙폭</th><th class="num">수익 기여</th><th class="num">위험 기여</th></tr></thead><tbody>
      ${as.stats.map((x) => `<tr><td class="name">${esc(label(x.key))}<span class="sub">${esc(x.key)}</span></td><td class="num">${fmtPct(x.weightTarget)}</td><td class="num ${dirClass(x.cagr)}">${fmtPct(x.cagr)}</td><td class="num">${fmtPct(x.vol)}</td><td class="num">${fmtPct(x.mdd)}</td><td class="num ${dirClass(x.contrib)}">${fmtPp(x.contrib)}</td><td class="num">${fmtPct(x.riskContrib)}</td></tr>`).join('')}</tbody></table></div>
      <p class="cap">수익 기여 = 매일의 (전날 비중 × 그날 수익률)을 더한 값(근사). 위험 기여 = 목표 비중으로 계산한 변동성 중 그 종목 몫.</p>
      <div class="section-title" style="margin-top:20px">끝날 때 비중</div>${weightsTable(r0)}
      ${as.stats.length > 1 && as.stats.length <= 15 ? `<div class="section-title" style="margin-top:20px">상관관계 <span class="cap">1에 가까울수록 같이 움직여요</span></div><div class="tbl-wrap"><table class="tbl heat"><thead><tr><th></th>${as.stats.map((x) => `<th>${esc(x.key)}</th>`).join('')}</tr></thead><tbody>${as.corr.map((row, i) => `<tr><th>${esc(as.stats[i].key)}</th>${row.map((c) => `<td style="background:color-mix(in srgb, var(--series-3) ${Math.round(Math.max(0, c) * 55)}%, var(--bg-surface))">${c.toFixed(2)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : ''}`;
  } else if (subtab === 'holdings') {
    const r = runs.find((x) => x.res.rankHistory);
    const h = r.res.rankHistory;
    P.innerHTML = `<div class="section-title">${esc(r.strat.name)} — 그때 무엇을 들고 있었나</div>
      <div class="tbl-wrap"><table class="tbl pick-tbl"><thead><tr><th>다시 고른 달</th><th>담은 종목(비중)</th><th>바뀐 것</th></tr></thead><tbody>
      ${h.map((x, i) => { const prev = new Set((h[i - 1]?.picks || []).map((p) => p.key)); const cur = new Set(x.picks.map((p) => p.key)); const inn = [...cur].filter((k) => !prev.has(k)), out = [...prev].filter((k) => !cur.has(k)); return `<tr><td>${fmtYm(x.ym)}</td><td>${x.picks.map((p) => `${esc(label(p.key))} ${fmtPct(p.w, 0)}`).join(', ')}</td><td>${i === 0 ? '<span class="cap">시작</span>' : `${inn.map((k) => `<span class="up">+${esc(label(k))}</span>`).join(' ')} ${out.map((k) => `<span class="down">−${esc(label(k))}</span>`).join(' ')}`}</td></tr>`; }).reverse().join('')}</tbody></table></div>`;
  } else if (subtab === 'metrics') {
    const rows = [
      ['연환산 수익률(CAGR)', (m) => fmtPct(m.cagr, 2), 'cagr'], ['누적 수익률', (m) => fmtPct(m.totalReturn, 1)], ['최종 금액', (m) => money(m.final)],
      ['변동성(연)', (m) => fmtPct(m.vol, 2), 'vol'], ['하방편차(연)', (m) => fmtPct(m.downside, 2)], ['최대 낙폭(월말)', (m) => fmtPct(m.mdd, 2), 'mdd'], ['최대 낙폭(일별)', (m) => fmtPct(m.mddDaily, 2)],
      ['샤프 지수', (m) => fmtNum(m.sharpe), 'sharpe'], ['소르티노 지수', (m) => fmtNum(m.sortino), 'sortino'], ['칼마 비율(최근 3년)', (m) => fmtNum(m.calmar)],
      ['가장 좋았던 해', (m) => (m.best ? `${m.best.year} ${fmtPct(m.best.r, 1, true)}` : '–')], ['가장 나빴던 해', (m) => (m.worst ? `${m.worst.year} ${fmtPct(m.worst.r, 1, true)}` : '–')],
      ['가장 좋았던 달', (m) => fmtPct(m.bestMonth, 1, true)], ['가장 나빴던 달', (m) => fmtPct(m.worstMonth, 1, true)], ['오른 달 비율', (m) => fmtPct(m.posRatio, 0)],
      ['베타', (m) => fmtNum(m.beta), 'beta'], ['알파(연)', (m) => fmtPct(m.alpha, 2)], ['상관계수', (m) => fmtNum(m.corr)], ['R²', (m) => fmtNum(m.r2)], ['추적오차', (m) => fmtPct(m.trackingError, 2)], ['정보비율', (m) => fmtNum(m.infoRatio)],
      ['상승장 포착률', (m) => fmtPct(m.upCapture, 0)], ['하락장 포착률', (m) => fmtPct(m.downCapture, 0)], ['금액가중수익률(IRR)', (m) => (m.irr == null ? '–' : fmtPct(m.irr, 2))],
    ];
    const m = runs[0].m;
    P.innerHTML = `<div class="facts">
        <div class="fact"><div class="lb">기간</div><div class="v">${fmtYm(m.start)} ~ ${fmtYm(m.end)}</div><div class="cap">${fmtSpan(m.months)}</div></div>
        <div class="fact"><div class="lb">리밸런싱</div><div class="v">${runs[0].res.trades}번</div><div class="cap">연평균 회전율 ${fmtPct(runs[0].res.turnover / Math.max(1, m.months / 12), 0)}</div></div>
        <div class="fact"><div class="lb">거래비용 합계</div><div class="v">${money(runs[0].res.feeTotal || 0)}</div><div class="cap">편도 ${((last.st.feeBp || 0) / 100).toFixed(2)}%</div></div>
        ${m.irr != null ? `<div class="fact"><div class="lb">금액가중수익률(IRR)</div><div class="v">${fmtPct(m.irr)}</div><div class="cap">적립·인출 시점 반영</div></div>` : ''}</div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>지표</th>${list.map((s) => `<th class="num"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${s.color};margin-right:4px"></span>${esc(s.name)}</th>`).join('')}</tr></thead><tbody>
      ${rows.map(([n, f, h]) => `<tr><td>${n}${h ? ` <button class="help" type="button" data-help="${h}">?</button>` : ''}</td>${list.map((s) => `<td class="num">${s.bm && /베타|알파|상관|R²|추적|정보|포착/.test(n) ? '–' : f(s.m)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
      <p class="cap">무위험수익률 0% 기준. 베타·알파·상관은 벤치마크(${bench ? esc(shortBench(bench.key)) : '없음'}) 대비 월간 수익률로 계산했어요.</p>`;
    $$('[data-help]', P).forEach((b) => { b.onclick = () => helpPop(b, b.dataset.help); });
  }
}
function dataPanel() {
  const { runs } = last;
  const keys = [...new Set(runs.flatMap((r) => r.res.keys))];
  const rows = keys.map((k) => assetInfo(k)).filter(Boolean);
  const rank = runs.some((r) => r.strat.kind === 'rank');
  return `<div class="section-title">사용한 데이터</div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>종목</th><th>시세 시작</th><th>마지막</th><th>출처</th></tr></thead><tbody>${rows.slice(0, 40).map((it) => `<tr><td class="name">${esc(it.n)}<span class="sub">${esc(it.k)}</span></td><td>${String(it.s).replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')}</td><td>${String(it.e).replace(/(\d{4})(\d{2})(\d{2})/, '$1.$2.$3')}</td><td>${it.nodiv ? '네이버(배당 미반영)' : '야후(배당 재투자)'}</td></tr>`).join('')}</tbody></table></div>${rows.length > 40 ? `<p class="cap">외 ${rows.length - 40}종목</p>` : ''}
    <div class="section-title" style="margin-top:20px">계산 가정</div>
    <ul class="notes" style="font-size:14px">
      <li>총수익(배당 재투자): 배당락일 수익 = 종가 ÷ (전일 종가 − 분배금). 야후 수정주가와 같은 방식이에요.</li>
      <li>지표는 월말 값 기준(포트폴리오 비주얼라이저와 같음). 진행 중인 이번 달은 빼요.</li>
      <li>첫 매수에는 비용을 물리지 않고, 리밸런싱 때마다 거래 금액 × 비용률을 빼요.</li>
      <li>적립은 월말에 목표 비중대로 사고, 인출은 그때 비중대로 팔아요.</li>
      <li>원화 기준이면 미국 자산은 같은 날짜의 원/달러 환율(야후 KRW=X)을 곱해요. 국내·미국 휴장일은 직전 값을 써요.</li>
      <li>여러 자산의 시작일이 다르면 가장 늦게 시작한 자산의 다음 달부터 계산해요.</li>
      ${rank ? '<li><b>순위 전략</b>: 리밸런싱 달의 월말 값으로 순위를 매기고 그 날 종가에 사요. 시가총액 = 분할만 반영한 종가 × 그 시점 상장주식수(미국은 최근 몇 년 분기·연 기록, 그 전은 가장 이른 기록으로 고정, 국내는 현재 주식수). 후보는 지금 DB 목록이라 과거에 사라진 종목이 빠져 있어요(생존 편향).</li>' : ''}
    </ul>`;
}
const iso = (d) => new Date(d * 864e5).toISOString().slice(0, 10).replace(/-/g, '.');
const days = (n) => (n >= 60 ? `${Math.round(n / 30.4)}개월` : `${n}일`);

function weightsTable(r) {
  const w = r.res.finalWeights.map((x, j) => ({ key: r.res.keys[j], w: x })).filter((x) => x.w > 0.0005).sort((a, b) => b.w - a.w);
  return `<div class="tbl-wrap"><table class="tbl"><tbody>${w.map((x) => `<tr><td class="name">${esc(label(x.key))}<span class="sub">${esc(x.key)}</span></td><td style="width:45%"><div style="height:6px;background:var(--bg-sunken);border-radius:3px"><div style="height:6px;width:${Math.min(100, x.w * 100)}%;background:${seriesColor(r.i)};border-radius:3px"></div></div></td><td class="num">${fmtPct(x.w)}</td></tr>`).join('')}</tbody></table></div>`;
}

async function renderDiagnosis() {
  const box = $('#diagCards', root);
  const { runs, bench } = last;
  const r0 = runs[0];
  const cards = diagnose(r0, bench, { altStyle: settings().altStyle, fmtMoney: money });
  if (!cards.length) { box.innerHTML = `<div class="rcard"><span class="st good">양호</span><h4>큰 경고는 없어요</h4><p class="why">최대 낙폭 ${fmtPct(r0.m.mdd)}, 변동성 ${fmtPct(r0.m.vol)}${bench ? `, ${esc(shortBench(bench.key))} 대비 ${fmtPp(r0.m.excessCagr)}` : ''}.</p></div>`; return; }
  box.innerHTML = cards.map((c, ci) => `<div class="rcard" data-ci="${ci}"><span class="st ${c.level}">${{ warning: '⚠ 경고', caution: '! 주의', info: 'ⓘ 참고' }[c.level]}</span><h4>${esc(c.title)}</h4><p class="why">${esc(c.why)}</p><div class="alts"><p class="cap">대안을 다시 계산하는 중…</p></div></div>`).join('');
  const gen = last;
  for (let ci = 0; ci < cards.length; ci++) {
    const c = cards[ci];
    const evaluated = [];
    for (const alt of c.alts) {
      try { evaluated.push({ alt, out: await evaluateAlt(r0, alt, bench) }); } catch (e) { console.warn(e); }
      if (gen !== last) return;
    }
    const cardEl = $(`.rcard[data-ci="${ci}"] .alts`, root);
    if (!cardEl) return;
    if (!evaluated.length) { cardEl.closest('.rcard').remove(); continue; }
    cardEl.innerHTML = evaluated.map(({ alt, out }, ai) => {
      const a = r0.m, b = out.m;
      const lbl = alt.kind === 'solveWithdraw' ? `인출을 ${alt.kind ? money(out.withdraw) : ''}로 줄이면` : alt.label;
      return `<div class="alt"><b>대안 ${String.fromCharCode(65 + ai)}</b> ${esc(lbl)}${out.approx ? ' <span class="cap">(월간 혼합 근사)</span>' : ''}</div>
        ${dumbbell([['연환산 수익률', a.cagr, b.cagr, true], ['최대 낙폭', a.mdd, b.mdd, true], ['변동성', a.vol, b.vol, false]])}
        ${out.strat && alt.kind !== 'extend' ? `<div class="row" style="margin-bottom:12px"><button class="btn small" type="button" data-alt="${ci}-${ai}">이 대안으로 비교</button></div>` : ''}`;
    }).join('') + '<p class="cap">같은 과거 기간에 맞춰 계산한 대안이라 미래에도 같은 효과를 보장하지는 않아요.</p>';
    evaluated.forEach(({ out }, ai) => {
      $(`[data-alt="${ci}-${ai}"]`, cardEl)?.addEventListener('click', () => addAltPortfolio(out.strat, evaluated[ai].alt.label));
    });
  }
}
function dumbbell(rows) {
  return `<div class="dumb">${rows.map(([n, a, b]) => {
    const lo = Math.min(a, b, 0), hi = Math.max(a, b, 0.0001); const pos = (v) => ((v - lo) / (hi - lo || 1)) * 100;
    return `<span class="lb">${n}</span><span class="vals"><span>${fmtPct(a)}</span><span class="track"><i class="ln" style="left:${Math.min(pos(a), pos(b))}%;width:${Math.abs(pos(a) - pos(b))}%"></i><i class="a" style="left:${pos(a)}%"></i><i class="b" style="left:${pos(b)}%"></i></span><b>${fmtPct(b)}</b></span>`;
  }).join('')}</div>`;
}
function addAltPortfolio(strat, name) {
  const p = newPortfolio(name.slice(0, 24));
  Object.assign(p, { kind: strat.kind, assets: strat.assets || [], rank: strat.rank || p.rank, rebalance: strat.rebalance, band: strat.band || p.band });
  if (st.portfolios.length >= 3) st.portfolios[2] = p; else st.portfolios.push(p);
  active = st.portfolios.length - 1;
  if (strat.feeBp != null) st.feeBp = strat.feeBp;
  save(); renderSentence(); renderInput(); run();
}

function sendToPlan() {
  const r0 = last.runs[0];
  const roll = rolling(r0.res, 60).map((x) => x.r).sort((a, b) => a - b);
  const p25 = roll.length ? roll[Math.floor(roll.length * 0.25)] : null;
  const s = sheet(`<h3>목표·노후 계산에 쓸 수익률</h3><p class="cap">${esc(r0.strat.name)} · ${fmtYm(r0.m.start)}~${fmtYm(r0.m.end)}</p>
    <div class="stack">
      <button class="alt-chip" type="button" data-r="${r0.m.cagr}"><b>연 ${fmtPct(r0.m.cagr)}</b>이 기간 연환산 수익률 그대로</button>
      ${p25 != null ? `<button class="alt-chip" type="button" data-r="${p25}"><b>연 ${fmtPct(p25)}</b>보수적: 5년 롤링 수익률 하위 25%</button>` : ''}
      <button class="alt-chip" type="button" data-r="${r0.m.cagr * 0.7}"><b>연 ${fmtPct(r0.m.cagr * 0.7)}</b>연환산 수익률의 70%</button>
    </div>
    ${r0.m.months < 60 || r0.m.cagr > 0.15 ? `<p class="sentence-note">⚠ ${r0.m.months < 60 ? '5년이 안 되는 기간의 수익률이에요.' : `연 ${fmtPct(r0.m.cagr)}은 장기 가정으로 쓰기엔 높아요.`} 보수적인 값을 권해요.</p>` : ''}
    <div class="actions"><button class="btn" type="button" data-close>닫기</button></div>`);
  $('[data-close]', s.root).onclick = s.close;
  $$('[data-r]', s.root).forEach((b) => { b.onclick = () => { window.dispatchEvent(new CustomEvent('plan:set-rate', { detail: { rate: +b.dataset.r * 100, source: r0.strat.name } })); s.close(); location.hash = '#plan'; }; });
}

function exportCsv() {
  const list = seriesList();
  const r0 = list[0].res;
  const lines = [['날짜', ...list.map((s) => s.name)].join(',')];
  const maps = list.map((s) => new Map(Array.from(s.res.days, (d, j) => [d, s.res.value[j]])));
  for (const d of r0.days) lines.push([new Date(d * 864e5).toISOString().slice(0, 10), ...maps.map((m) => (m.get(d) ?? '').toString())].join(','));
  const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'seoks-stock-backtest.csv'; a.click();
}

export function currentState() { return st; }
void debounce; void dayToYm; void altStrategy; void arrow; void fmtYmKo;
