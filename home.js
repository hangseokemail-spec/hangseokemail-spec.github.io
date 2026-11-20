/* 석스 가판대로 돌아가는 단추.
   각 프로그램의 index.html 맨 끝에 한 줄만 넣으면 된다:
     <script src="https://hangseokemail-spec.github.io/home.js" defer></script>
   처음 자리는 data-pos="bottom-left | bottom-right | top-left | top-right" (기본 bottom-left),
   그 사이트의 아래쪽 단추와 겹치면 data-lift="60"처럼 그만큼(px) 올린다.
   읽는 사람이 단추를 꾹 눌러 끌면 원하는 자리로 옮길 수 있고, 놓으면 가까운 옆 가장자리에 붙는다.
   옮긴 자리는 이 기기에 기억된다(그 사이트 자리 + 아직 옮긴 적 없는 다른 사이트의 기본 자리).
   단추는 그림자 DOM 안에 있어서 각 사이트의 CSS와 서로 섞이지 않는다. */
(() => {
  'use strict';
  if (window.__seoksHome) return;
  window.__seoksHome = true;

  const HUB = 'https://hangseokemail-spec.github.io/';
  const KEY = 'seoks-home-pos-v1';
  const HINT = 'seoks-home-hint-v1';
  const script = document.currentScript;
  const pos = ((script && script.dataset.pos) || 'bottom-left').toLowerCase();
  const lift = Math.max(0, parseInt((script && script.dataset.lift) || '0', 10) || 0);
  const EDGE = 12, MOVE = 6;

  // 가판대 자기 자신, 그리고 다른 화면 안에 끼워 넣어진 경우에는 띄우지 않는다.
  const onHub = location.hostname === 'hangseokemail-spec.github.io' && /^\/(index\.html)?$/.test(location.pathname);
  let framed = false;
  try { framed = window.top !== window.self; } catch (err) { framed = true; }
  if (onHub || framed) return;

  const site = location.hostname === 'hangseokemail-spec.github.io' ? (location.pathname.split('/')[1] || 'root') : location.host;
  const store = {
    get() {
      try { const a = JSON.parse(localStorage.getItem(KEY)) || {}; return (a.sites && a.sites[site]) || a.def || null; } catch (err) { return null; }
    },
    set(p) {
      try {
        const a = JSON.parse(localStorage.getItem(KEY)) || {};
        a.sites = a.sites || {}; a.sites[site] = p; a.def = p;
        localStorage.setItem(KEY, JSON.stringify(a));
      } catch (err) { /* 기억 못 해도 이번 화면에서는 옮겨진다 */ }
    },
  };

  function mount() {
    if (document.getElementById('seoks-home-host')) return;
    const host = document.createElement('div');
    host.id = 'seoks-home-host';
    host.style.cssText = 'all:initial;position:fixed;z-index:2147483000;left:0;top:0;visibility:hidden';
    const root = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;
    root.innerHTML = `<style>
      :host{all:initial}
      .probe{position:fixed;inset:0;visibility:hidden;pointer-events:none;
        padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
      .wrap{position:relative;transition:transform .35s cubic-bezier(.2,.8,.2,1),opacity .35s}
      a{display:flex;align-items:center;gap:8px;height:40px;padding:0 15px 0 7px;border-radius:999px;box-sizing:border-box;
        background:rgba(255,255,255,.84);-webkit-backdrop-filter:saturate(180%) blur(18px);backdrop-filter:saturate(180%) blur(18px);
        color:#1d1d1f;text-decoration:none;font:600 14px/1 "Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Apple SD Gothic Neo","Malgun Gothic","Noto Sans KR",sans-serif;
        letter-spacing:-.01em;box-shadow:0 8px 24px rgba(0,0,0,.2),0 0 0 .5px rgba(0,0,0,.12);white-space:nowrap;
        transition:transform .25s cubic-bezier(.2,.8,.2,1),box-shadow .25s;cursor:pointer;
        touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;-webkit-user-drag:none;-webkit-tap-highlight-color:transparent}
      a:hover{transform:translateY(-2px)}
      a:active{transform:scale(.96)}
      a:focus-visible{outline:3px solid rgba(0,113,227,.6);outline-offset:2px}
      .drag a{transform:scale(1.08);box-shadow:0 16px 36px rgba(0,0,0,.28),0 0 0 .5px rgba(0,0,0,.12);cursor:grabbing}
      .ic{width:27px;height:27px;flex:none;border-radius:8px;display:block;pointer-events:none}
      span{pointer-events:none}
      .away[data-side="left"]{transform:translateX(calc(-100% - 30px));opacity:0;pointer-events:none}
      .away[data-side="right"]{transform:translateX(calc(100% + 30px));opacity:0;pointer-events:none}
      .tip{position:absolute;bottom:calc(100% + 10px);padding:8px 11px;border-radius:10px;background:#1d1d1f;color:#fff;
        font:500 12.5px/1.35 "Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;
        white-space:nowrap;box-shadow:0 6px 18px rgba(0,0,0,.25);opacity:0;transform:translateY(4px);transition:opacity .3s,transform .3s;pointer-events:none}
      .tip.on{opacity:1;transform:none}
      .wrap[data-side="left"] .tip{left:0}
      .wrap[data-side="right"] .tip{right:0}
      @media (prefers-reduced-motion:reduce){.wrap,a,.tip{transition:none}}
      @media print{.wrap{display:none}}
    </style>
    <div class="probe"></div>
    <div class="wrap" data-side="left"><div class="tip">꾹 눌러 끌면 원하는 자리로 옮길 수 있어요</div>
      <a href="${HUB}" draggable="false" title="석스 가판대로 돌아가기 (끌어서 옮길 수 있어요)" aria-label="석스 가판대로 돌아가기">
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

    const wrap = root.querySelector('.wrap'), btn = root.querySelector('a'), probe = root.querySelector('.probe'), tip = root.querySelector('.tip');

    // ── 자리: 옆(left/right)과 위아래 비율(0=맨 위, 1=맨 아래)로 기억해서 화면 크기·방향이 바뀌어도 같은 느낌의 자리에 둔다.
    const safe = () => { const s = getComputedStyle(probe); return { t: parseFloat(s.paddingTop) || 0, r: parseFloat(s.paddingRight) || 0, b: parseFloat(s.paddingBottom) || 0, l: parseFloat(s.paddingLeft) || 0 }; };
    const box = () => ({ w: btn.offsetWidth || 96, h: btn.offsetHeight || 40 }); // 크기 효과(scale)와 상관없는 실제 크기
    const range = () => { const s = safe(), b = box(); const min = EDGE + s.t, max = Math.max(min, innerHeight - b.h - EDGE - s.b); return { s, b, min, max }; };
    const defaults = () => {
      const { min, max } = range();
      const side = pos.endsWith('right') ? 'right' : 'left';
      if (pos.startsWith('top')) return { side, y: 0 };
      return { side, y: max > min ? Math.max(0, (max - lift - min) / (max - min)) : 1 };
    };
    let cur = store.get() || defaults();
    const xFor = (side) => { const { s, b } = range(); return side === 'right' ? innerWidth - b.w - EDGE - s.r : EDGE + s.l; };
    function place(animate) {
      const { min, max } = range();
      const y = min + Math.min(1, Math.max(0, cur.y)) * (max - min);
      host.style.transition = animate ? 'left .3s cubic-bezier(.2,.8,.2,1), top .3s cubic-bezier(.2,.8,.2,1)' : 'none';
      host.style.left = xFor(cur.side) + 'px';
      host.style.top = y + 'px';
      wrap.dataset.side = cur.side;
    }
    place(false);
    host.style.visibility = 'visible';
    window.addEventListener('resize', () => place(false));

    // ── 끌어서 옮기기: 조금이라도(6px) 움직이면 '옮기기', 그대로 떼면 '누르기'(가판대로 이동).
    let drag = null, moved = false;
    btn.addEventListener('dragstart', (e) => e.preventDefault());
    btn.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      const r = host.getBoundingClientRect();
      drag = { id: e.pointerId, x0: e.clientX, y0: e.clientY, l0: r.left, t0: r.top };
      moved = false;
      // 손가락·마우스가 단추 밖으로 빨리 나가도 계속 따라오게 붙잡아 둔다(그대로 떼면 여전히 '누르기').
      try { btn.setPointerCapture(e.pointerId); } catch (err) { /* 무시 */ }
    });
    btn.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      if (!moved) {
        if (Math.hypot(dx, dy) < MOVE) return;
        moved = true;
        wrap.classList.add('drag'); wrap.classList.remove('away');
        host.style.transition = 'none';
        tip.classList.remove('on');
      }
      const { b } = range();
      host.style.left = Math.min(innerWidth - b.w - 4, Math.max(4, drag.l0 + dx)) + 'px';
      host.style.top = Math.min(innerHeight - b.h - 4, Math.max(4, drag.t0 + dy)) + 'px';
      e.preventDefault();
    });
    const end = (e) => {
      if (!drag || (e && e.pointerId !== drag.id)) return;
      drag = null;
      if (!moved) return;
      wrap.classList.remove('drag');
      const r = host.getBoundingClientRect(), { min, max } = range();
      cur = { side: r.left + r.width / 2 < innerWidth / 2 ? 'left' : 'right', y: max > min ? Math.min(1, Math.max(0, (r.top - min) / (max - min))) : 1 };
      place(true);
      store.set(cur);
      try { localStorage.setItem(HINT, '1'); } catch (err) { /* 무시 */ }
    };
    btn.addEventListener('pointerup', end);
    btn.addEventListener('pointercancel', end);
    // 옮기고 나서 손을 뗀 것은 '누르기'가 아니다.
    btn.addEventListener('click', (e) => { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);

    // ── 처음 한 번만: 옮길 수 있다는 말풍선
    let hinted = true;
    try { hinted = !!localStorage.getItem(HINT); } catch (err) { hinted = true; }
    if (!hinted) {
      setTimeout(() => {
        tip.classList.add('on');
        setTimeout(() => { tip.classList.remove('on'); try { localStorage.setItem(HINT, '1'); } catch (err) { /* 무시 */ } }, 4200);
      }, 900);
    }

    // ── 읽는 동안에는 비켜 주기: 아래로 내리면 옆으로 숨고, 조금이라도 올리거나 맨 위·맨 아래에 닿으면 다시 나온다.
    let lastY = window.scrollY, ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking || drag) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY, max = document.documentElement.scrollHeight - window.innerHeight;
        if (y < lastY - 4 || y <= 120 || y >= max - 40) wrap.classList.remove('away');
        else if (y > lastY + 4) wrap.classList.add('away');
        lastY = y;
        ticking = false;
      });
    }, { passive: true });
  }

  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount, { once: true });
})();
