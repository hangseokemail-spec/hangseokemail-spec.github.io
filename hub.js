/* 석스 가판대 — projects.json에 적힌 프로그램마다 발행 기록을 읽어 최신 호 표지를 보여 준다.
   새 호가 나오면 각 프로그램의 목록 파일이 바뀌므로, 이 페이지는 따로 고칠 필요가 없다.
   읽음 표시는 이 기기(브라우저)의 localStorage에 "어느 호까지 눌러 봤는지"만 적어 둔다. */
(() => {
  'use strict';

  const SITE = 'https://hangseokemail-spec.github.io';
  const SAME = /(^|\.)hangseokemail-spec\.github\.io$/.test(location.hostname);
  const KST = 9 * 3600e3, H = 3600e3, DAY = 24 * H;
  const WD = '일월화수목금토';
  const REFRESH = 20 * 60e3;
  const STORE = 'seoks-hub-seen-v1';

  const abs = (p) => !p ? p : /^[a-z]+:/i.test(p) ? p : p[0] === '/' ? (SAME ? p : SITE + p) : p;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const get = (o, path) => !path ? o : String(path).split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  // "{no|pad2}"처럼 쓰면 두 자리로 채운다.
  const fill = (tpl, ctx) => tpl == null ? null : String(tpl).replace(/\{([\w.]+)(?:\|pad(\d))?\}/g, (_, k, n) => {
    const v = get(ctx, k);
    return v == null ? '' : n ? String(v).padStart(+n, '0') : v;
  });
  const getJSON = async (u) => {
    const r = await fetch(abs(u), { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status + ' ' + u);
    return r.json();
  };
  const $ = (s, el = document) => el.querySelector(s);

  /* ---------- 한국 시각 ---------- */
  const dayKey = (t) => new Date(t + KST).toISOString().slice(0, 10);
  const at = (key, hm) => Date.parse(`${key}T${hm || '00:00'}:00+09:00`);
  const wdOf = (key) => new Date(key + 'T00:00:00Z').getUTCDay();
  const hm = (t) => { const d = new Date(t + KST); return String(d.getUTCHours()).padStart(2, '0') + ':' + String(d.getUTCMinutes()).padStart(2, '0'); };
  const fmtDay = (key) => { const [, m, d] = key.split('-').map(Number); return `${m}월 ${d}일(${WD[wdOf(key)]})`; };
  const fmtWhen = (t, now) => {
    const k = dayKey(t);
    if (k === dayKey(now)) return `오늘 ${hm(t)}`;
    if (k === dayKey(now + DAY)) return `내일(${WD[wdOf(k)]}) ${hm(t)}`;
    return `${fmtDay(k)} ${hm(t)}`;
  };
  const relDay = (t, now) => {
    const n = Math.round((Date.parse(dayKey(now)) - Date.parse(dayKey(t))) / DAY);
    return n <= 0 ? '오늘' : n === 1 ? '어제' : n < 7 ? `${n}일 전` : fmtDay(dayKey(t));
  };
  const occ = (sch, now, dir) => {
    for (let i = 0; i <= 8; i++) {
      const k = dayKey(now + dir * i * DAY);
      if (!sch.days.includes(wdOf(k))) continue;
      const t = at(k, sch.time);
      if (dir < 0 ? t <= now : t > now) return t;
    }
    return null;
  };
  const cadText = (p) => {
    const s = p.schedule;
    if (!s) return p.group === 'always' ? '언제든' : '';
    const d = s.days.slice().sort((a, b) => a - b);
    if (d.length === 7) return `매일 ${s.time}`;
    if (d.length === 1) return `매주 ${WD[d[0]]} ${s.time}`;
    const run = d.every((x, i) => !i || x === d[i - 1] + 1);
    return (run ? `${WD[d[0]]}~${WD[d[d.length - 1]]}` : d.map((x) => WD[x]).join('·')) + ' ' + s.time;
  };
  const greet = (now) => {
    const h = new Date(now + KST).getUTCHours();
    return h < 5 ? '늦은 밤이에요' : h < 11 ? '좋은 아침이에요' : h < 17 ? '좋은 오후예요' : h < 22 ? '좋은 저녁이에요' : '늦은 밤이에요';
  };

  /* ---------- 프로그램별 읽는 법 ---------- */
  const ADAPTERS = {
    // 목록 JSON에서 가장 최근 호를 고른다. 대부분의 프로그램은 이것으로 충분하다.
    async index(s) {
      const raw = await getJSON(s.index);
      let list = get(raw, s.list);
      if (!Array.isArray(list)) list = [];
      const now = Date.now(), dk = s.dateKey || 'date';
      if (s.publishAt) list = list.filter((e) => !e[s.publishAt] || Date.parse(e[s.publishAt]) <= now);
      list = list.filter((e) => e && e[dk]).sort((a, b) => String(b[dk]).localeCompare(String(a[dk])) || (+b.no || 0) - (+a.no || 0));
      const e = list[0];
      if (!e) return { key: null, empty: true, count: 0 };
      const ctx = { ...e };
      // 예: "lookup": {"cat": {"list": "categories", "key": "id", "field": "category"}} → {cat.name}
      Object.entries(s.lookup || {}).forEach(([name, L]) => {
        const arr = get(raw, L.list);
        ctx[name] = Array.isArray(arr) ? arr.find((x) => x && x[L.key || 'id'] === e[L.field]) || {} : {};
      });
      if (s.detail) { try { ctx.d = await getJSON(fill(s.detail, ctx)); } catch (err) { ctx.d = {}; } }
      let title = fill(s.title, ctx) || '';
      if (s.cut && title.includes(s.cut)) title = title.split(s.cut)[0];
      const date = String(e[dk]).slice(0, 10);
      const label = fill(s.label, ctx);
      return {
        key: date + '|' + (label || ''),
        date, label, title,
        cover: s.cover ? abs(fill(s.cover, ctx)) : null,
        svg: s.svg ? get(ctx, s.svg) : null,
        chip: s.chip ? fill(s.chip, ctx) : null,
        count: list.length,
        publishedAt: s.publishAt && e[s.publishAt] ? Date.parse(e[s.publishAt]) : null,
        link: s.link ? abs(fill(s.link, ctx)) : null,
      };
    },

    // Seoks 증시 풍향계: 점수 계기판을 표지로 그린다.
    async 'seoks-wind'(s) {
      const [w, lt] = await Promise.all([getJSON(s.wind), getJSON(s.latest).catch(() => ({}))]);
      let i = w.w.length - 1;
      while (i >= 0 && (w.w[i] == null || isNaN(w.w[i]))) i--;
      if (i < 0) throw new Error('풍향계 값 없음');
      const score = +w.w[i];
      const marketDate = w.dates[i + (w.dates.length - w.w.length)];
      const zone = (w.zones || []).filter((z) => score >= z.from).pop() || {};
      let c = null;
      try { c = await getJSON(fill(s.comment, { date: lt.date || marketDate })); } catch (err) { /* 코멘트 없이도 표지는 그린다 */ }
      const wc = (c && c.wind) || {};
      const g = lt.generated && String(lt.generated).match(/(\d{4}-\d\d-\d\d)\D+(\d\d:\d\d)/);
      const [, mm, dd] = marketDate.split('-').map(Number);
      return {
        key: marketDate,
        date: g ? g[1] : marketDate,
        label: `미국 ${mm}/${dd} 마감`,
        dateText: '',
        title: wc.verdict || wc.headline || [zone.name, zone.act].filter(Boolean).join(' · '),
        publishedAt: g ? at(g[1], g[2]) : null,
        wind: { score, zone, zones: w.zones || [], spark: w.w.slice(Math.max(0, i - 59), i + 1).map(Number) },
      };
    },

    // 발행 주기가 없는 것(게임·도구): 적어 둔 그대로.
    async static(s) {
      return { key: null, label: s.label, title: s.title, cover: s.cover ? abs(s.cover) : null, icon: s.icon ? abs(s.icon) : null };
    },

    // 앞으로 만드는 프로그램용 표준: 저장소에 hub.json 하나만 두면 된다(README 참고).
    async hub(s) {
      const d = await getJSON(s.feed);
      const base = new URL(abs(s.feed), location.href);
      const rel = (u) => (u ? new URL(u, base).href : null);
      return { key: d.key || d.date, date: d.date, label: d.label, title: d.title, cover: rel(d.cover), link: rel(d.link), publishedAt: d.publishedAt ? Date.parse(d.publishedAt) : null };
    },
  };

  /* ---------- 표지 ---------- */
  const safeSVG = (str) => {
    if (!str || typeof str !== 'string') return null;
    try {
      const doc = new DOMParser().parseFromString(str, 'image/svg+xml');
      const svg = doc.documentElement;
      if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return null;
      svg.querySelectorAll('script,foreignObject,iframe').forEach((n) => n.remove());
      [svg, ...svg.querySelectorAll('*')].forEach((n) => [...n.attributes].forEach((a) => {
        if (/^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) n.removeAttribute(a.name);
      }));
      svg.removeAttribute('width'); svg.removeAttribute('height');
      svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      return document.importNode(svg, true);
    } catch (err) { return null; }
  };

  const windSVG = (W) => {
    const { score, zone, zones, spark } = W;
    const cx = 150, cy = 182, r = 98;
    const pt = (v, rr) => { const a = Math.PI * (1 - Math.max(0, Math.min(100, v)) / 100); return [cx + rr * Math.cos(a), cy - rr * Math.sin(a)]; };
    const arc = (a, b) => { const [x1, y1] = pt(a, r), [x2, y2] = pt(b, r); return `M${x1.toFixed(1)} ${y1.toFixed(1)}A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}`; };
    const segs = zones.map((z, k) => {
      const last = k === zones.length - 1;
      return `<path d="${arc(z.from + (k ? 0.8 : 0), (last ? 100 : zones[k + 1].from - 0.8))}" stroke="${esc(z.color)}" stroke-width="20" fill="none" opacity="${z === zone ? 1 : 0.38}"/>`;
    }).join('');
    const [nx, ny] = pt(score, r - 16);
    const lo = Math.min(...spark, 40) - 2, hi = Math.max(...spark, 60) + 2;
    const sx = (k) => 30 + (240 * k) / Math.max(1, spark.length - 1);
    const sy = (v) => 352 - ((v - lo) / (hi - lo)) * 46;
    const line = spark.map((v, k) => `${k ? 'L' : 'M'}${sx(k).toFixed(1)} ${sy(v).toFixed(1)}`).join('');
    const shown = Number.isInteger(score) ? score : score.toFixed(1);
    const col = esc(zone.color || '#94a3b8');
    return `<svg viewBox="0 0 300 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="풍향계 ${shown}점 ${esc(zone.name || '')}">
      <defs><linearGradient id="wbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1d3363"/><stop offset="1" stop-color="#0b1530"/></linearGradient></defs>
      <rect width="300" height="400" fill="url(#wbg)"/>
      <text x="22" y="42" fill="#fff" font-size="22" font-weight="800" letter-spacing="-.5">증시 풍향계</text>
      <text x="22" y="62" fill="#9fb3d9" font-size="12">Seoks · 심리 60 : 유동성 40</text>
      <path d="${arc(0, 100)}" stroke="#ffffff" stroke-opacity=".06" stroke-width="20" fill="none"/>
      ${segs}
      <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="8" fill="#fff"/>
      <text x="${cx}" y="${cy + 50}" fill="#fff" font-size="46" font-weight="800" text-anchor="middle" letter-spacing="-1">${shown}</text>
      <rect x="${cx - 46}" y="${cy + 62}" width="92" height="24" rx="12" fill="${col}"/>
      <text x="${cx}" y="${cy + 79}" fill="#0b1530" font-size="13" font-weight="800" text-anchor="middle">${esc([zone.name, zone.act].filter(Boolean).join(' · '))}</text>
      <text x="30" y="296" fill="#9fb3d9" font-size="11">최근 석 달</text>
      <rect x="30" y="${sy(55).toFixed(1)}" width="240" height="${(sy(45) - sy(55)).toFixed(1)}" fill="#fff" opacity=".06"/>
      <path d="${line}" stroke="#cddcff" stroke-width="1.8" fill="none" stroke-linejoin="round"/>
      <circle cx="${sx(spark.length - 1).toFixed(1)}" cy="${sy(score).toFixed(1)}" r="4" fill="${col}" stroke="#0b1530" stroke-width="1.5"/>
      <text x="22" y="384" fill="#6f84ad" font-size="10.5">45~55 무풍 · 55 위 순풍 · 45 아래 역풍</text>
    </svg>`;
  };

  const coverShowsTitle = (p) => ['overlay', 'paper', 'type'].includes(p.cover && p.cover.style);

  function buildCover(p, it) {
    const st = (p.cover && p.cover.style) || 'plain';
    const c = p.cover || {};
    const el = document.createElement('div');
    const alt = `${p.name} ${it.label || ''} 표지`.trim();
    const fallback = () => {
      el.className = 'cv cv-fb';
      el.innerHTML = `<div class="fb-kind">${esc(p.kind || '')}</div><div class="fb-name">${esc(p.name)}</div>${it.title ? `<div class="fb-title">${esc(it.title)}</div>` : ''}`;
    };
    const img = (cls) => {
      const im = document.createElement('img');
      im.className = cls; im.alt = alt; im.decoding = 'async'; im.src = it.cover;
      im.addEventListener('error', fallback, { once: true });
      return im;
    };

    if (st === 'type') {
      el.className = 'cv cv-type';
      el.innerHTML = `<div class="ty-mast">${esc(c.mast || p.name)}</div><div class="ty-q" aria-hidden="true">?</div>
        <div class="ty-body"><div class="ty-no">${esc(it.empty ? 'Q00' : it.label || '')}</div>
        ${it.chip ? `<span class="ty-chip">${esc(it.chip)}</span>` : ''}
        <div class="ty-title">${esc(it.empty ? (c.empty || '첫 질문을 기다리는 중') : it.title || '')}</div></div>
        ${c.sub ? `<div class="ty-sub">${esc(c.sub)}</div>` : ''}`;
    } else if (st === 'wind' && it.wind) {
      el.className = 'cv cv-wind';
      el.innerHTML = windSVG(it.wind);
    } else if (st === 'paper') {
      el.className = 'cv cv-paper';
      const [, m, d] = (it.date || '--').split('-');
      el.innerHTML = `<div class="pt"><span>${esc(it.label || '')}</span><span>${it.date ? `${+m}.${+d}` : ''}</span></div>
        <div class="pm">${esc(c.mast || p.name)}</div><div class="ps">${esc(c.sub || '')}</div>
        <div class="pa"></div><div class="ph">${esc(it.title || '')}</div>`;
      const svg = safeSVG(it.svg);
      if (svg) $('.pa', el).appendChild(svg);
      else if (it.cover) $('.pa', el).appendChild(img('full'));
      else $('.pa', el).remove();
    } else if (st === 'overlay' && it.cover) {
      el.className = 'cv cv-overlay';
      el.appendChild(img('full'));
      el.insertAdjacentHTML('beforeend', `<div class="top">${it.icon ? `<img class="icon" src="${esc(it.icon)}" alt="">` : ''}<div><div class="mast">${esc(c.mast || p.name)}</div>${c.sub ? `<div class="sub">${esc(c.sub)}</div>` : ''}</div></div>
        <div class="bot">${it.label && it.date ? `<div class="lab">${esc(it.label)}</div>` : ''}<div class="hd">${esc(it.title || '')}</div></div>`);
    } else if (it.cover) {
      el.className = 'cv cv-plain';
      el.appendChild(img('full'));
    } else {
      fallback();
    }
    return el;
  }

  /* ---------- 읽음 기록 (이 기기) ---------- */
  const seenAll = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (err) { return {}; } };
  const seenSave = (o) => { try { localStorage.setItem(STORE, JSON.stringify(o)); } catch (err) { /* 저장 못 하는 브라우저면 표시만 생략 */ } };
  function markSeen(ids) {
    const o = seenAll(), now = Date.now();
    ids.forEach((id) => { const it = state.items[id]; o[id] = { key: it ? it.key : null, at: now }; });
    seenSave(o);
  }

  /* ---------- 상태 ---------- */
  const pubTime = (p, it) => it.publishedAt || (it.date ? at(it.date, (p.schedule && p.schedule.time) || '00:00') : null);
  const isFresh = (p, it, now) => {
    const t = pubTime(p, it);
    if (!t || t > now) return false;
    return p.group === 'daily' ? dayKey(t) === dayKey(now) : now - t < 3 * DAY;
  };

  function statusOf(p, it, now) {
    if (it.empty) return { cls: 'idle', text: p.emptyText || '첫 호를 기다리는 중' };
    if (!p.schedule) return { cls: p.group === 'always' ? 'idle' : 'ok', text: fill(p.statusText, it) || '언제든 열려 있어요' };
    const last = occ(p.schedule, now, -1), next = occ(p.schedule, now, +1);
    const t = pubTime(p, it);
    const pubKey = t ? dayKey(t) : it.date;
    if (last && pubKey && pubKey < dayKey(last)) {
      if (now - last < 3 * H) return { cls: 'wait', text: `새 호 준비 중 · ${hm(last)} 예정` };
      return { cls: 'late', text: `예정보다 늦어지고 있어요 · 마지막 호 ${fmtDay(pubKey)}` };
    }
    return { cls: 'ok', text: next ? `다음 호 ${fmtWhen(next, now)}` : '' };
  }

  /* ---------- 화면 ---------- */
  const state = { cfg: null, items: {}, last: 0 };
  const visible = () => state.cfg.projects.filter((p) => !p.hidden);

  function cardShell(p) {
    const a = document.createElement('a');
    a.className = 'card';
    a.href = abs(p.url);
    a.id = 'p-' + p.id;
    a.dataset.id = p.id;
    a.style.setProperty('--ac', p.accent || '#86868b');
    a.innerHTML = `<div class="cvwrap"><div class="cv cv-loading"></div><i class="ud" aria-hidden="true"></i></div>
      <div class="meta">
        <div class="r0"><span class="eb"></span><span class="cad">${esc(cadText(p))}</span></div>
        <b class="name">${esc(p.name)}</b>
        <div class="r2">${esc(p.kind || '')}</div>
        <p class="ttl">${esc(p.desc || '')}</p>
        <div class="st"><i class="dot"></i><span>불러오는 중</span></div>
      </div>`;
    const mark = () => { markSeen([p.id]); paintRead(); };
    a.addEventListener('click', mark);
    a.addEventListener('auxclick', (e) => { if (e.button === 1) mark(); });
    return a;
  }

  function fillCard(p, it, now) {
    const a = document.getElementById('p-' + p.id);
    if (!a) return;
    state.items[p.id] = it;
    if (it.link) a.href = it.link;
    $('.cv', a).replaceWith(buildCover(p, it));
    const dateText = it.dateText != null ? it.dateText : it.date ? fmtDay(it.date) : '';
    $('.r2', a).textContent = it.empty ? `${p.kind || ''} · 아직 발행 전` : [it.label, dateText].filter(Boolean).join(' · ') || p.kind || '';
    const ttl = $('.ttl', a);
    if (coverShowsTitle(p) || !it.title) { ttl.textContent = p.desc || ''; ttl.classList.add('desc'); }
    else { ttl.textContent = it.title; ttl.classList.remove('desc'); }
    const s = statusOf(p, it, now);
    $('.st', a).className = 'st ' + s.cls;
    $('.st span', a).textContent = s.text;
    a.dataset.fresh = isFresh(p, it, now) ? '1' : '';
  }

  function failCard(p, err) {
    const a = document.getElementById('p-' + p.id);
    if (!a) return;
    state.items[p.id] = { key: null, failed: true };
    $('.cv', a).replaceWith(buildCover({ ...p, cover: { style: 'plain' } }, { title: p.desc }));
    $('.st', a).className = 'st err';
    $('.st span', a).textContent = '목록을 읽지 못했어요 · 눌러서 바로 가기';
    console.warn('[가판대]', p.id, err);
  }

  // 읽음/안 읽음 표시를 다시 칠한다.
  function paintRead() {
    const seen = seenAll(), now = Date.now();
    let unread = 0, first = null;
    visible().forEach((p) => {
      const a = document.getElementById('p-' + p.id), it = state.items[p.id];
      if (!a || !it) return;
      const s = seen[p.id];
      const eb = $('.eb', a);
      let cls = '', text = '';
      if (it.failed) { cls = ''; text = ''; }
      else if (!it.key) { if (s) { cls = 'seen'; text = `마지막으로 연 날 · ${relDay(s.at, now)}`; } }
      else if (s && s.key === it.key) { cls = 'seen'; text = `봤어요 · ${relDay(s.at, now)}`; }
      else { cls = 'new'; text = a.dataset.fresh ? '새로 나왔어요' : '아직 안 봤어요'; unread++; first = first || a; }
      eb.className = 'eb ' + cls;
      eb.textContent = text;
      a.classList.toggle('unread', cls === 'new');
    });
    const pill = $('#unread');
    pill.hidden = !unread;
    $('#unread-n').textContent = unread;
    pill.onclick = () => first && first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('#allread').hidden = !unread;
    $('#hero-note').innerHTML = unread
      ? `아직 안 본 새 호가 <b>${unread}개</b> 있어요.`
      : '새로 나온 건 모두 봤어요. 다음 호를 기다리는 중.';
    document.title = (unread ? `(${unread}) ` : '') + (state.cfg.title || '석스 가판대');
  }

  function layout(cfg) {
    const main = $('#main');
    main.innerHTML = '';
    const groups = cfg.groups && cfg.groups.length ? cfg.groups : [{ id: '', name: '' }];
    const used = new Set();
    const nav = $('#navlinks');
    nav.innerHTML = '';
    const addSection = (g, ps) => {
      const sec = document.createElement('section');
      sec.className = 'shelf';
      sec.id = 'g-' + (g.id || 'etc');
      sec.style.setProperty('--n', ps.length);
      sec.classList.toggle('n1', ps.length === 1);
      sec.innerHTML = g.name ? `<h2><b>${esc(g.name)}.</b> ${esc(g.tagline || '')}</h2>` : '';
      const grid = document.createElement('div');
      grid.className = 'grid';
      ps.forEach((p) => { grid.appendChild(cardShell(p)); used.add(p.id); });
      sec.appendChild(grid);
      main.appendChild(sec);
      if (g.name) nav.insertAdjacentHTML('beforeend', `<a href="#${sec.id}">${esc(g.name.replace(/ 나오는 것$/, ''))}</a>`);
    };
    groups.forEach((g) => {
      const ps = cfg.projects.filter((p) => (p.group || '') === g.id && !p.hidden);
      if (ps.length) addSection(g, ps);
    });
    const rest = cfg.projects.filter((p) => !used.has(p.id) && !p.hidden);
    if (rest.length) addSection({ id: 'etc', name: '그 밖의 것', tagline: '' }, rest);
  }

  async function refresh() {
    const now = Date.now();
    state.last = now;
    await Promise.all(visible().map(async (p) => {
      const ad = ADAPTERS[(p.source && p.source.type) || 'static'];
      try {
        if (!ad) throw new Error('모르는 형식: ' + (p.source && p.source.type));
        fillCard(p, await ad(p.source || {}), now);
      } catch (err) { failCard(p, err); }
    }));
    $('#checked').textContent = `마지막 확인 ${hm(now)}`;
    paintRead();
  }

  async function start() {
    const now = Date.now(), k = dayKey(now), [, m, d] = k.split('-').map(Number);
    try {
      state.cfg = await getJSON('projects.json');
    } catch (err) {
      $('#main').innerHTML = '<p class="oops">목록(projects.json)을 읽지 못했어요. 잠시 뒤 새로 고쳐 주세요.</p>';
      return;
    }
    const cfg = state.cfg;
    $('#eyebrow').textContent = `${m}월 ${d}일 ${WD[wdOf(k)]}요일 · ${greet(now)}${cfg.owner ? ', ' + cfg.owner : ''}`;
    if (cfg.title) { $('#brand').textContent = cfg.title; document.title = cfg.title; }
    if (cfg.headline) $('#headline').textContent = cfg.headline;
    if (cfg.subtitle) $('#subtitle').textContent = cfg.subtitle;
    layout(cfg);
    $('#allread').addEventListener('click', () => { markSeen(visible().filter((p) => state.items[p.id] && state.items[p.id].key).map((p) => p.id)); paintRead(); });
    $('#forget').addEventListener('click', (e) => { e.preventDefault(); try { localStorage.removeItem(STORE); } catch (err) { /* 무시 */ } paintRead(); });
    await refresh();
    setInterval(() => { if (!document.hidden) refresh(); }, REFRESH);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - state.last > 5 * 60e3) refresh(); });
    window.addEventListener('pageshow', (e) => { if (e.persisted) paintRead(); }); // 뒤로 가기로 돌아왔을 때
    window.addEventListener('storage', (e) => { if (e.key === STORE) paintRead(); }); // 다른 탭에서 읽었을 때
  }

  start();
})();
