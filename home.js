/* 석스 가판대로 돌아가는 버튼.
   각 프로그램의 index.html 맨 끝에 한 줄만 넣으면 된다:
     <script src="https://hangseokemail-spec.github.io/home.js" defer></script>
   자리를 바꾸려면 data-pos="bottom-left | bottom-right | top-left | top-right" (기본 bottom-left),
   그 사이트의 아래쪽 단추와 겹치면 data-lift="60"처럼 그만큼(px) 올린다.
   버튼은 그림자 DOM 안에 있어서 각 사이트의 CSS와 서로 섞이지 않는다. */
(() => {
  'use strict';
  if (window.__seoksHome) return;
  window.__seoksHome = true;

  const HUB = 'https://hangseokemail-spec.github.io/';
  const script = document.currentScript;
  const pos = ((script && script.dataset.pos) || 'bottom-left').toLowerCase();
  const lift = Math.max(0, parseInt((script && script.dataset.lift) || '0', 10) || 0);

  // 가판대 자기 자신, 그리고 다른 화면 안에 끼워 넣어진 경우에는 띄우지 않는다.
  const onHub = location.hostname === 'hangseokemail-spec.github.io' && /^\/(index\.html)?$/.test(location.pathname);
  let framed = false;
  try { framed = window.top !== window.self; } catch (err) { framed = true; }
  if (onHub || framed) return;

  function mount() {
    if (document.getElementById('seoks-home-host')) return;
    const host = document.createElement('div');
    host.id = 'seoks-home-host';
    const v = pos.startsWith('top') ? 'top' : 'bottom';
    const h = pos.endsWith('right') ? 'right' : 'left';
    host.style.cssText = [
      'all:initial', 'position:fixed', 'z-index:2147483000',
      `${v}:calc(${14 + lift}px + env(safe-area-inset-${v}))`,
      `${h}:max(14px, env(safe-area-inset-${h}))`,
    ].join(';');
    const root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    root.innerHTML = `<style>
      :host{all:initial}
      a{display:flex;align-items:center;gap:8px;height:40px;padding:0 15px 0 7px;border-radius:999px;box-sizing:border-box;
        background:rgba(255,255,255,.84);-webkit-backdrop-filter:saturate(180%) blur(18px);backdrop-filter:saturate(180%) blur(18px);
        color:#1d1d1f;text-decoration:none;font:600 14px/1 "Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;
        letter-spacing:-.01em;box-shadow:0 8px 24px rgba(0,0,0,.2),0 0 0 .5px rgba(0,0,0,.12);
        transition:transform .35s cubic-bezier(.2,.8,.2,1),opacity .35s;-webkit-tap-highlight-color:transparent;cursor:pointer}
      a:hover{transform:translateY(-2px)}
      a:active{transform:scale(.96)}
      a:focus-visible{outline:3px solid rgba(0,113,227,.6);outline-offset:2px}
      .ic{width:27px;height:27px;flex:none;border-radius:8px;display:block}
      .away a{transform:translateY(${v === 'bottom' ? '' : '-'}160%);opacity:0;pointer-events:none}
      @media (prefers-reduced-motion:reduce){a{transition:none}}
      @media print{a{display:none}}
    </style>
    <div class="wrap"><a href="${HUB}" title="석스 가판대로 돌아가기" aria-label="석스 가판대로 돌아가기">
      <svg class="ic" viewBox="0 0 64 64" aria-hidden="true">
        <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9822b"/><stop offset=".38" stop-color="#e0503d"/><stop offset=".68" stop-color="#9b4fe8"/><stop offset="1" stop-color="#2f7fe8"/></linearGradient></defs>
        <rect width="64" height="64" rx="15" fill="url(#g)"/>
        <rect x="12" y="15" width="24" height="32" rx="4" fill="#fff" opacity=".55"/>
        <rect x="27" y="20" width="25" height="33" rx="4" fill="#fff"/>
        <rect x="31" y="24" width="17" height="10" rx="2" fill="#e8a33d"/>
        <circle cx="50" cy="21" r="6" fill="#0071e3" stroke="#fff" stroke-width="2.5"/>
      </svg>
      <span>가판대</span></a></div>`;
    document.body.appendChild(host);

    // 읽는 동안에는 비켜 주기: 아래로 내리면 숨고, 조금이라도 올리거나 맨 위·맨 아래에 닿으면 다시 나온다.
    const wrap = root.querySelector('.wrap');
    let lastY = window.scrollY, ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
        const away = y > lastY + 4 && y > 120 && y < max - 40;
        if (y < lastY - 4 || y <= 120 || y >= max - 40) wrap.classList.remove('away');
        else if (away) wrap.classList.add('away');
        lastY = y;
        ticking = false;
      });
    }, { passive: true });
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();
