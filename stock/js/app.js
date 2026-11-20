// 앱 시작: 데이터 목록 읽기, 탭 이동(해시), 설정, 데이터 상태
import { $, $$, sheet, settings, saveSettings, applyTheme, toast, store } from './ui/dom.js';
import { loadUniverse, loadMeta } from './core/data.js';
import { initBacktest } from './views/backtest.js';
import { initPlan } from './views/plan.js';
import { initAssets } from './views/assets.js';
import { esc } from './ui/format.js';

const TABS = ['backtest', 'plan', 'assets'];
const inited = {};

function show(tab) {
  if (!TABS.includes(tab)) tab = 'backtest';
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${tab}`));
  if (!inited[tab]) {
    inited[tab] = true;
    const el = $(`#view-${tab}`);
    if (tab === 'backtest') initBacktest(el);
    if (tab === 'plan') initPlan(el);
    if (tab === 'assets') initAssets(el);
  }
  window.dispatchEvent(new CustomEvent('tabshown', { detail: tab }));
  window.scrollTo({ top: 0 });
  // 숨겨져 있던 차트 크기 다시 맞춤
  setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
}

async function main() {
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme());
  $$('[data-tab]').forEach((b) => b.addEventListener('click', () => { location.hash = `#${b.dataset.tab}`; }));
  $$('.top-tabs [role=tab]').forEach((b, i, arr) => b.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = arr[(i + (e.key === 'ArrowRight' ? 1 : arr.length - 1)) % arr.length]; n.focus(); n.click(); }
  }));
  $('#settingsBtn').onclick = openSettings;
  $('#themeBtn').onclick = () => { const dark = document.documentElement.dataset.theme === 'dark'; saveSettings({ theme: dark ? 'light' : 'dark' }); };
  try {
    const u = await loadUniverse();
    const last = u.items.find((x) => x.k === 'SPY')?.e;
    const kr = u.items.find((x) => x.k === '069500')?.e;
    const f = (n) => (n ? `${String(n).slice(4, 6)}.${String(n).slice(6, 8)}` : '–');
    $('#dataStamp').innerHTML = `<span class="long">시세 미국 </span>${f(last)}<span class="long"> · 국내 ${f(kr)}</span> 종가`;
    $('#dataStamp').onclick = openDataStatus;
  } catch (e) {
    $('#dataStamp').textContent = '시세를 못 불러왔어요';
    toast('시세 목록을 불러오지 못했어요. 새로 고침해 주세요.');
    console.error(e);
  }
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  show(location.hash.slice(1) || 'backtest');
}

async function openDataStatus() {
  let meta = {};
  try { meta = await loadMeta(); } catch { /* 없음 */ }
  const u = await loadUniverse();
  const by = (m, t) => u.items.filter((x) => x.m === m && (!t || x.t === t)).length;
  const s = sheet(`<h3>시세 데이터베이스</h3>
    <p>미국 주식 ${by('US', 'stock')} · 미국 ETF ${by('US', 'etf')} · 국내 주식 ${by('KR', 'stock')} · 국내 ETF ${by('KR', 'etf')} · 지수·환율 ${by('IDX')}종목, 2000년부터 일별 시세와 배당 이력.</p>
    <p class="cap">마지막 갱신: ${esc(meta.updated ? new Date(meta.updated).toLocaleString('ko-KR') : '–')}${meta.incremental != null ? ` · 증분 ${meta.incremental} · 전체 ${meta.full}` : ''}${meta.failed?.length ? ` · 실패 ${meta.failed.length}종목(${esc(meta.failed.slice(0, 5).map((x) => x[0]).join(', '))})` : ''}</p>
    <p class="cap">매일 미국장·국내장 마감 뒤 자동으로 새 날짜만 붙이고, 일요일에 전체를 다시 점검해요. 목록에 없는 종목은 종목 검색창에서 ‘추가 요청’을 누르면 몇 분 안에 들어와요.</p>
    <div class="actions"><button class="btn" type="button" data-close>닫기</button></div>`);
  $('[data-close]', s.root).onclick = s.close;
}

function openSettings() {
  const st = settings();
  const s = sheet(`<h3>설정</h3><div class="stack">
    <div class="field">화면 모드<div class="seg" id="s_theme">${[['dark', '어둡게'], ['light', '밝게'], ['system', '기기 설정 따름']].map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${st.theme === v}">${l}</button>`).join('')}</div></div>
    <div class="field">오름·내림 색<div class="seg" id="s_updown"><button type="button" data-v="kr" aria-pressed="${st.updown !== 'global'}">한국식(오름 빨강)</button><button type="button" data-v="global" aria-pressed="${st.updown === 'global'}">해외식(오름 초록)</button></div></div>
    <div class="field">기본 통화<div class="seg" id="s_cur"><button type="button" data-v="KRW" aria-pressed="${st.currency === 'KRW'}">원화</button><button type="button" data-v="USD" aria-pressed="${st.currency === 'USD'}">달러</button></div></div>
    <div class="field">대안 성향(위험 경고에 붙는 대안의 종류)<div class="seg" id="s_alt"><button type="button" data-v="equity" aria-pressed="${st.altStyle === 'equity'}">주식 안에서 먼저</button><button type="button" data-v="bond" aria-pressed="${st.altStyle === 'bond'}">채권도 허용</button></div></div>
    <label class="field">기본 거래비용(편도)<div class="input-unit"><input class="input num" id="s_fee" value="${(st.feeBp ?? 10) / 100}"><span>%</span></div></label>
    <div class="grid3">
      <label class="field">내 밴드 폭<div class="input-unit"><input class="input num" id="s_band" value="${st.bandAbs}"><span>%p</span></div></label>
      <label class="field">개별주 상한<div class="input-unit"><input class="input num" id="s_cap1" value="${st.capSingle}"><span>%</span></div></label>
      <label class="field">상품 상한<div class="input-unit"><input class="input num" id="s_cap2" value="${st.capProduct}"><span>%</span></div></label>
    </div>
    <label class="field">Claude API 키 (선택)<input class="input" id="s_key" type="password" autocomplete="off" placeholder="sk-ant-…" value="${esc(st.apiKey)}"></label>
    <p class="cap">키는 이 기기 브라우저에만 저장되고 Anthropic으로만 전송돼요. 백업 파일에는 넣지 않아요. 공용 컴퓨터에서는 넣지 마세요. 키가 있으면 복잡한 문장 해석과 계좌 캡처 인식에 Claude를 쓰고, 없으면 기본 해석기와 기기 안 글자 인식(OCR)으로 동작해요.</p>
    <label class="field">모델<select class="input" id="s_model">${['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'].map((m) => `<option ${st.model === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    <div class="row"><button class="btn small" type="button" id="s_export">전체 백업 내보내기</button><label class="btn small">백업 가져오기<input type="file" accept="application/json" id="s_import" hidden></label></div>
  </div><div class="actions"><button class="btn" type="button" data-close>닫기</button><button class="btn primary" type="button" data-ok>저장</button></div>`);
  $$('.seg button', s.root).forEach((b) => b.addEventListener('click', () => { $$('button', b.parentElement).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
  const pressed = (id) => $(`#${id} button[aria-pressed="true"]`, s.root)?.dataset.v;
  $('[data-close]', s.root).onclick = s.close;
  $('[data-ok]', s.root).onclick = () => {
    saveSettings({ theme: pressed('s_theme'), updown: pressed('s_updown'), currency: pressed('s_cur'), altStyle: pressed('s_alt'), bandAbs: +$('#s_band', s.root).value || 3, capSingle: +$('#s_cap1', s.root).value || 20, capProduct: +$('#s_cap2', s.root).value || 25, apiKey: $('#s_key', s.root).value.trim(), model: $('#s_model', s.root).value, feeBp: Math.round((+$('#s_fee', s.root).value || 0) * 100) });
    s.close(); toast('설정을 저장했어요.');
  };
  $('#s_export', s.root).onclick = () => {
    const data = { app: 'seoks-stock', version: 1, at: new Date().toISOString(), holdings: store('ss.holdings'), plans: store('ss.plans'), bt: store('ss.bt'), snapshots: store('ss.snapshots'), settings: { ...settings(), apiKey: '' } };
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' })); a.download = `seoks-stock-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  $('#s_import', s.root).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'seoks-stock') throw new Error('Seok\'s Stock 백업 파일이 아니에요');
      for (const k of ['holdings', 'plans', 'bt', 'snapshots']) if (d[k]) store(`ss.${k}`, d[k]);
      if (d.settings) saveSettings({ ...d.settings, apiKey: settings().apiKey });
      toast('백업을 가져왔어요. 화면을 새로 고칠게요.'); setTimeout(() => location.reload(), 800);
    } catch (err) { toast(err.message); }
  };
}

main();
