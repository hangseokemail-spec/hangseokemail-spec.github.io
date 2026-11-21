// 앱 시작: 데이터 목록 읽기, 탭 이동(해시), 설정, 데이터 상태
import { $, $$, sheet, settings, saveSettings, applyTheme, toast, store } from './ui/dom.js';
import { loadUniverse, loadMeta, prefetch } from './core/data.js';
import { initBacktest } from './views/backtest.js';
import { initPlan } from './views/plan.js';
import { initGoal } from './views/goal.js';
import { initAssets } from './views/assets.js';
import { initFinder } from './views/finder.js';
import { esc } from './ui/format.js';
import { login, signup, backend, setBackendOverride, pingBackend, restoreSession, logout, currentUser, exportVault, importVault } from './core/auth.js';

const TABS = ['backtest', 'finder', 'goal', 'plan', 'assets'];
const PRIVATE_TABS = new Set(['goal', 'plan', 'assets']);
const inited = {};

function show(tab) {
  if (!TABS.includes(tab)) tab = 'backtest';
  if (PRIVATE_TABS.has(tab) && !currentUser()) { sessionStorage.setItem('ss.afterLogin', tab); openLogin(true); tab = 'backtest'; if (location.hash.slice(1) !== 'backtest') history.replaceState(null, '', '#backtest'); }
  $$('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${tab}`));
  if (!inited[tab]) {
    inited[tab] = true;
    const el = $(`#view-${tab}`);
    if (tab === 'backtest') initBacktest(el);
    if (tab === 'goal') initGoal(el);
    if (tab === 'plan') initPlan(el);
    if (tab === 'assets') initAssets(el);
    if (tab === 'finder') initFinder(el);
  }
  window.dispatchEvent(new CustomEvent('tabshown', { detail: tab }));
  window.scrollTo({ top: 0 });
  // 숨겨져 있던 차트 크기 다시 맞춤
  setTimeout(() => window.dispatchEvent(new Event('resize')), 30);
}

// ------------------------------------------------------------------ 로그인
function openLogin(fromLocked = false, mode = 'login') {
  if (document.querySelector('.login-screen')) return;
  const box = document.createElement('div');
  box.className = 'login-screen';
  document.body.appendChild(box);
  document.body.classList.add('locked');
  const done = async (r) => {
    if (!r.ok) return false;
    const want = sessionStorage.getItem('ss.afterLogin'); sessionStorage.removeItem('ss.afterLogin');
    if (want) history.replaceState(null, '', `#${want}`);
    location.reload(); // 계정 데이터로 처음부터 그림
    return true;
  };
  const draw = async () => {
    const remote = !!(await backend());
    box.innerHTML = `<form class="login-card" autocomplete="on" novalidate>
      <div class="login-brand"><span class="logo"></span>Seok's Stock</div>
      <div class="seg login-tabs" role="tablist"><button type="button" data-m="login" aria-pressed="${mode === 'login'}">로그인</button><button type="button" data-m="signup" aria-pressed="${mode === 'signup'}">가입하기</button></div>
      ${mode === 'login' ? `
        <h1>${fromLocked ? '목표·노후·내 자산은 로그인해야 볼 수 있어요' : '다시 오셨네요'}</h1>
        <label class="field">아이디<input class="input" name="username" id="lg_id" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
        <label class="field">비밀번호<input class="input" name="password" id="lg_pw" type="password" autocomplete="current-password" required></label>`
      : `
        <h1>처음이세요? 세 가지만 넣으면 돼요</h1>
        <label class="field">아이디<input class="input" name="username" id="su_id" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="영문 소문자·숫자 3~20자" required></label>
        <label class="field">이메일<input class="input" name="email" id="su_em" type="email" autocomplete="email" placeholder="you@example.com" required></label>
        <label class="field">비밀번호<input class="input" name="new-password" id="su_pw" type="password" autocomplete="new-password" placeholder="6자 이상" required></label>
        <label class="field">비밀번호 확인<input class="input" id="su_pw2" type="password" autocomplete="new-password" required></label>
        <p class="cap">${remote ? '계정은 운영자 구글 드라이브의 계정 저장소에 기억돼요(비밀번호 원문은 저장하지 않아요). 다음부터는 아이디·비밀번호만 넣으면 어느 기기에서든 들어와요.' : '지금은 계정 저장소가 연결되기 전이라 이 기기에 계정을 기억해요. 연결되면 다른 기기에서도 같은 아이디로 들어올 수 있어요.'}</p>`}
      <label class="toggle"><input type="checkbox" id="lg_keep" checked> 이 기기에서 로그인 유지</label>
      <p class="login-err" id="lg_err" role="alert"></p>
      <button class="btn primary big" type="submit" id="lg_go">${mode === 'login' ? '들어가기' : '가입하고 들어가기'}</button>
      <button class="btn ghost" type="button" id="lg_guest">로그인 없이 백테스트·전략 찾기만 보기</button>
      <p class="cap login-note">개인 계획과 자산은 계정마다 암호화해서 저장해요. 운영자도 내용을 볼 수 없어요.</p>
    </form>`;
    setTimeout(() => $(mode === 'login' ? '#lg_id' : '#su_id', box)?.focus(), 30);
    $$('[data-m]', box).forEach((b) => { b.onclick = () => { mode = b.dataset.m; draw(); }; });
    $('#lg_guest', box).onclick = () => { box.remove(); document.body.classList.remove('locked'); document.body.classList.add('guest'); if (!inited.backtest) show(location.hash.slice(1) || 'backtest'); };
    $('form', box).onsubmit = async (e) => {
      e.preventDefault();
      const btn = $('#lg_go', box), err = $('#lg_err', box), label = btn.textContent;
      btn.disabled = true; btn.textContent = '확인 중…'; err.textContent = '';
      const keep = $('#lg_keep', box).checked;
      const r = mode === 'login' ? await login($('#lg_id', box).value, $('#lg_pw', box).value, keep)
        : await signup({ id: $('#su_id', box).value, email: $('#su_em', box).value, pw: $('#su_pw', box).value, pw2: $('#su_pw2', box).value, remember: keep });
      if (await done(r)) return;
      err.textContent = r.error; btn.disabled = false; btn.textContent = label;
    };
  };
  draw();
}
function renderAccount() {
  const u = currentUser();
  const b = $('#accountBtn');
  if (!b) return;
  b.textContent = u ? u.name : '로그인';
  b.onclick = () => {
    if (!u) { openLogin(); return; }
    const s = sheet(`<h3>${esc(u.name)}${u.role === 'master' ? ' <span class="status-pill">마스터</span>' : ''}</h3>
      <p class="cap">목표·노후 계획, 내 자산, 백테스트 기록은 이 계정 키로 암호화돼 이 기기에만 저장돼요. 다른 기기로 옮길 때는 설정의 ‘암호화 백업’을 쓰세요.</p>
      <div class="actions"><button class="btn" type="button" data-close>닫기</button><button class="btn primary" type="button" id="lo">로그아웃</button></div>`);
    $('[data-close]', s.root).onclick = s.close;
    $('#lo', s.root).onclick = () => logout(true);
  };
}

async function main() {
  const u = await restoreSession();
  if (!u) document.body.classList.add('guest');
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
  renderAccount();
  window.addEventListener('hashchange', () => show(location.hash.slice(1)));
  if (!u) openLogin(PRIVATE_TABS.has(location.hash.slice(1)));
  show(location.hash.slice(1) || 'backtest');
  prefetch(['SPY', 'QQQ', 'FX_USDKRW', 'BIL', 'IEF', '069500', 'SCHD', 'VOO']);
}

async function openDataStatus() {
  let meta = {};
  try { meta = await loadMeta(); } catch { /* 없음 */ }
  const u = await loadUniverse();
  const by = (m, t) => u.items.filter((x) => x.m === m && (!t || x.t === t)).length;
  const s = sheet(`<h3>시세 데이터베이스</h3>
    <p>미국 주식 ${by('US', 'stock')} · 미국 ETF ${by('US', 'etf')} · 국내 주식 ${by('KR', 'stock')} · 국내 ETF ${by('KR', 'etf')} · 지수·환율 ${by('IDX')}종목, 미국은 1985년·국내는 2000년부터(상장 이후) 일별 시세와 배당 이력.</p>
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
    <p class="cap">키는 계정 저장소에 암호화돼 이 기기에만 저장되고 Anthropic으로만 전송돼요. 공용 컴퓨터에서는 넣지 마세요. 키가 있으면 복잡한 문장 해석과 계좌 캡처 인식에 Claude를 쓰고, 없으면 기본 해석기와 기기 안 글자 인식(OCR)으로 동작해요.</p>
    <label class="field">모델<select class="input" id="s_model">${['claude-sonnet-5-5', 'claude-haiku-5-5', 'claude-opus-5-5'].map((m) => `<option ${st.model === m ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
    ${currentUser()?.role === 'master' ? `<label class="field">계정 저장소 주소(구글 Apps Script 웹 앱 URL)<input class="input" id="s_backend" placeholder="https://script.google.com/macros/s/…/exec" value="${esc(localStorage.getItem('ss.backendUrl') || '')}"></label><div class="row"><button class="btn small" type="button" id="s_ping">연결 확인</button><span class="cap" id="s_pingr"></span></div><p class="cap">이 주소가 있으면 가입한 계정과 암호화된 개인 데이터를 운영자 구글 드라이브에 기억해 어느 기기에서든 같은 아이디로 들어와요. 여기 넣은 주소는 이 기기에서만 쓰여요. 모든 기기에 적용하려면 Claude에게 주소를 알려 주세요(저장소에 반영).</p>` : ''}
    <div class="row"><button class="btn small" type="button" id="s_export">암호화 백업 내보내기</button><label class="btn small">백업 가져오기<input type="file" accept="application/json" id="s_import" hidden></label></div><p class="cap">암호화 백업은 같은 아이디·비밀번호로 로그인한 기기에서만 풀려요. 휴대폰과 PC가 같은 데이터를 쓰려면 이 파일로 옮기세요.</p>
  </div><div class="actions"><button class="btn" type="button" data-close>닫기</button><button class="btn primary" type="button" data-ok>저장</button></div>`);
  $$('.seg button', s.root).forEach((b) => b.addEventListener('click', () => { $$('button', b.parentElement).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }));
  const pressed = (id) => $(`#${id} button[aria-pressed="true"]`, s.root)?.dataset.v;
  $('[data-close]', s.root).onclick = s.close;
  $('#s_ping', s.root)?.addEventListener('click', async () => { const u = $('#s_backend', s.root).value.trim(); const o = $('#s_pingr', s.root); o.textContent = '확인 중…'; try { o.textContent = (await pingBackend(u)) ? '✓ 연결됐어요' : '응답이 이상해요(배포 설정 확인)'; } catch (e) { o.textContent = `연결 실패: ${e.message}`; } });
  $('[data-ok]', s.root).onclick = () => {
    if ($('#s_backend', s.root)) setBackendOverride($('#s_backend', s.root).value.trim());
    saveSettings({ theme: pressed('s_theme'), updown: pressed('s_updown'), currency: pressed('s_cur'), altStyle: pressed('s_alt'), bandAbs: +$('#s_band', s.root).value || 3, capSingle: +$('#s_cap1', s.root).value || 20, capProduct: +$('#s_cap2', s.root).value || 25, apiKey: $('#s_key', s.root).value.trim(), model: $('#s_model', s.root).value, feeBp: Math.round((+$('#s_fee', s.root).value || 0) * 100) });
    s.close(); toast('설정을 저장했어요.');
  };
  $('#s_export', s.root).onclick = async () => {
    if (!currentUser()) { toast('로그인하면 계정 데이터를 암호화 백업할 수 있어요.'); return; }
    const data = await exportVault();
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' })); a.download = `seoks-stock-${new Date().toISOString().slice(0, 10)}.json`; a.click();
  };
  $('#s_import', s.root).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.app !== 'seoks-stock') throw new Error('Seok\'s Stock 백업 파일이 아니에요');
      if (d.kind === 'vault') { await importVault(d); toast('암호화 백업을 가져왔어요. 화면을 새로 고칠게요.'); setTimeout(() => location.reload(), 800); return; }
      for (const k of ['holdings', 'plans', 'bt', 'snapshots']) if (d[k]) store(`ss.${k}`, d[k]);
      if (d.settings) saveSettings({ ...d.settings, apiKey: settings().apiKey });
      toast('백업을 가져왔어요. 화면을 새로 고칠게요.'); setTimeout(() => location.reload(), 800);
    } catch (err) { toast(err.message); }
  };
}

main();
