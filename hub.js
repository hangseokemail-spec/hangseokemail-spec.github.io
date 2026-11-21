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
  const TABSTORE = 'seoks-hub-tab-v1';

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
  // 여러 후보 중 처음으로 값이 있는 것
  const pick = (t, ctx) => (Array.isArray(t) ? t : [t]).map((x) => fill(x, ctx)).find((v) => v && String(v).trim()) || '';
  // 앞에서 n문장만 (0이면 전부). 5.12% 같은 소수점은 문장 끝으로 보지 않는다.
  const sentences = (t, n) => {
    t = String(t || '').replace(/\s+/g, ' ').trim();
    if (!n) return t;
    const ends = []; const re = /[.!?](?=\s|$)/g; let m;
    while ((m = re.exec(t))) ends.push(m.index + 1);
    if (!ends.length) return t;
    if (n > 0) return t.slice(0, ends[Math.min(n, ends.length) - 1]);
    const k = ends.length + n; // 뒤에서 |n|문장
    return k <= 0 ? t : t.slice(ends[k - 1]).trim();
  };
  async function summaryOf(s, ctx) {
    let t = s.summary ? pick(s.summary, ctx) : '';
    if (!t && s.summaryHtml) {
      try {
        const r = await fetch(abs(fill(s.summaryHtml.url, ctx)), { cache: 'no-cache' });
        const doc = new DOMParser().parseFromString(await r.text(), 'text/html');
        const el = doc.querySelector(s.summaryHtml.selector);
        t = el ? el.textContent : '';
      } catch (err) { t = ''; }
    }
    if (s.summaryAfter && t.includes(s.summaryAfter)) t = t.split(s.summaryAfter).slice(1).join(s.summaryAfter);
    return sentences(t, s.sentences == null ? 1 : s.sentences);
  }

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
  // usMarket: true 인 일정은 전날(미국 날짜)이 주말·휴장이면 그 한국 아침은 쉰다(Seok's Paper·풍향계).
  const usClosed = (k) => {
    const us = dayKey(Date.parse(k + 'T12:00:00Z') - DAY);
    return [0, 6].includes(wdOf(us)) || ((state.cfg && state.cfg.usMarketClosed) || []).includes(us);
  };
  const occ = (sch, now, dir) => {
    for (let i = 0; i <= 12; i++) {
      const k = dayKey(now + dir * i * DAY);
      if (!sch.days.includes(wdOf(k))) continue;
      if (sch.usMarket && usClosed(k)) continue;
      const t = at(k, sch.time);
      if (dir < 0 ? t <= now : t > now) return t;
    }
    return null;
  };
  const nextQuarterEnd = (period) => {
    const [y, m] = period.split('-').map(Number);
    const nm = m + 3, ny = y + (nm > 12 ? 1 : 0), mm = ((nm - 1) % 12) + 1;
    const last = new Date(Date.UTC(ny, mm, 0)).getUTCDate();
    return `${ny}-${String(mm).padStart(2, '0')}-${last}`;
  };
  const cadText = (p) => {
    const s = p.schedule;
    if (s && s.every === 'quarter') return '분기마다';
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
      let title = pick(s.title, ctx);
      if (s.cut && title.includes(s.cut)) title = title.split(s.cut)[0];
      const summary = await summaryOf(s, ctx);
      const date = String(e[dk]).slice(0, 10);
      const label = fill(s.label, ctx);
      return {
        key: date + '|' + (label || ''),
        date, label, title, summary,
        cover: s.cover ? abs(fill(s.cover, ctx)) : null,
        svg: s.svg ? get(ctx, s.svg) : null,
        chip: s.chip ? fill(s.chip, ctx) : null,
        count: list.length,
        publishedAt: s.publishAt && e[s.publishAt] ? Date.parse(e[s.publishAt]) : null,
        link: s.link ? abs(fill(s.link, ctx)) : null,
        // 종이 표지에 그림이 없을 때 그림 자리에 까는 글(부제·본문·아래 줄). 없으면 안 쓴다.
        deck: s.deck ? fill(s.deck, ctx) : null,
        body: s.body ? fill(s.body, ctx) : null,
        foot: s.foot ? fill(s.foot, ctx) : null,
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
        summary: (c && c.summary) || '',
        publishedAt: g ? at(g[1], g[2]) : null,
        wind: { score, zone, zones: w.zones || [], spark: w.w.slice(Math.max(0, i - 59), i + 1).map(Number) },
      };
    },

    // 구루 13F: 가장 최근 공시 분기와 그 분기에 많이 산·판 종목(ETF 제외, 사이트와 같은 순위).
    async guru13f(s) {
      const [st, ko] = await Promise.all([getJSON(s.stats), getJSON(s.names).catch(() => [])]);
      const info = st.find((x) => x.sec === 'info') || {};
      const q = st.filter((x) => x.sec === 'quarter').pop() || {};
      const period = info.latest || q.p;
      if (!period) throw new Error('분기 정보 없음');
      const KO = {}; (Array.isArray(ko) ? ko : []).forEach((x) => { if (x && x.k) KO[x.k] = x.ko; });
      const row = (r) => ({ t: r[0], n: KO[r[0]] || '', v: +r[3], c: +r[4] });
      const buys = (q.buy10 || []).slice(0, 4).map(row), sells = (q.sell10 || []).slice(0, 3).map(row);
      const [y, mo] = period.split('-').map(Number), qn = Math.ceil(mo / 3);
      const pub = Date.parse(period + 'T00:00:00+09:00') + (s.lagDays || 45) * DAY; // 13F 공시 기한
      const px = info.price_asof ? info.price_asof.split('-').map(Number) : null;
      const nm = (x) => (x ? x.n || x.t : '');
      return {
        key: period, period, date: dayKey(pub), publishedAt: pub,
        label: `${y}년 ${qn}분기`,
        dateText: px ? `주가 ${px[1]}/${px[2]} 기준` : '',
        title: buys[0] && sells[0] ? `가장 많이 산 ${nm(buys[0])}, 가장 많이 판 ${nm(sells[0])}` : '',
        guru: { buys, sells, n: info.gurus_n || 0, qlabel: `${y}년 ${qn}분기` },
      };
    },

    // Seok's Stock: 호가 없는 도구. 그 앱의 시세 파일로 대표 백테스트(기준 종목, 시작일부터 배당 재투자)를 계산해 표지에 쓴다.
    async stock(s) {
      const meta = await getJSON(s.meta);
      const upd = meta.updated ? Date.parse(meta.updated) : null;
      let bt = null;
      try {
        const o = await getJSON(fill(s.px, { k: s.bench }));
        const ymd = (v) => { const t = String(v).replace(/-/g, ''); return Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8)); };
        const n = o.c.length, day = new Array(n);
        day[0] = ymd(o.d0);
        for (let i = 1; i < n; i++) day[i] = day[i - 1] + o.dd[i - 1] * DAY;
        const div = new Float64Array(n), pos = new Map(day.map((d, i) => [d, i]));
        (o.dv || []).forEach(([d, a]) => { const i = pos.get(ymd(d)); if (i !== undefined) div[i] += a; });
        const tr = new Float64Array(n); tr[0] = o.c[0];
        for (let i = 1; i < n; i++) { const b = o.c[i - 1] > div[i] ? o.c[i - 1] - div[i] : o.c[i - 1]; tr[i] = tr[i - 1] * o.c[i] / b; }
        const st = Math.max(0, day.findIndex((d) => d >= ymd(s.start || o.d0)));
        const step = Math.max(1, Math.floor((n - st) / 90)), pts = [];
        for (let i = st; i < n; i += step) pts.push([day[i], tr[i] / tr[st]]);
        pts.push([day[n - 1], tr[n - 1] / tr[st]]);
        bt = { x: tr[n - 1] / tr[st], from: day[st], to: day[n - 1], pts };
      } catch (err) { bt = null; }
      const y0 = bt ? new Date(bt.from).getUTCFullYear() : '';
      const times = bt ? (bt.x >= 10 ? Math.round(bt.x) : bt.x.toFixed(1)) : '';
      return {
        key: null,
        label: meta.fetched ? `종목 ${meta.fetched}개` : '',
        dateText: upd ? `시세 ${fmtDay(dayKey(upd))} 갱신` : '',
        title: bt ? `${y0}년 ${s.benchName || s.bench}에 넣은 돈은 지금 ${times}배` : '',
        summary: s.summary || '',
        stock: bt ? { ...bt, times, bench: s.bench, benchName: s.benchName || s.bench } : null,
        status: upd ? (Date.now() - upd > 4 * DAY
          ? { cls: 'late', text: `시세 갱신이 늦어지고 있어요 · 마지막 ${fmtDay(dayKey(upd))}` }
          : { cls: 'ok', text: `시세 ${fmtWhen(upd, Date.now())} 갱신 · 매일 자동` }) : null,
      };
    },

    // 발행 주기가 없는 것(게임·도구): 적어 둔 그대로.
    async static(s) {
      return { key: null, label: s.label, title: s.title, summary: s.summary || '', cover: s.cover ? abs(s.cover) : null, icon: s.icon ? abs(s.icon) : null };
    },

    // 앞으로 만드는 프로그램용 표준: 저장소에 hub.json 하나만 두면 된다(README 참고).
    async hub(s) {
      const d = await getJSON(s.feed);
      const base = new URL(abs(s.feed), location.href);
      const rel = (u) => (u ? new URL(u, base).href : null);
      return { key: d.key || d.date, date: d.date, label: d.label, title: d.title, summary: d.summary || '', cover: rel(d.cover), link: rel(d.link), publishedAt: d.publishedAt ? Date.parse(d.publishedAt) : null };
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

  // 구구탑: 99층 탑을 오르는 모험 이야기 표지. 열린 층은 불이 켜지고, 그 위는 구름 속에 잠겨 있다.
  const towerSVG = (c) => {
    const total = c.total || 99, reached = Math.max(1, c.reached || 1), F = c.floors || [];
    const hs = [32, 30, 28, 23, 19, 16, 13, 11, 9];
    const stars = [[24,22,1.2],[58,46,.9],[92,18,1.1],[214,26,1],[252,52,1.3],[276,18,.8],[40,96,.8],[268,104,1],[18,150,1],[284,160,.9],[70,130,.7],[236,138,.7]];
    const P = [];
    let y = 364, w = 140, here = null;
    hs.forEach((h, i) => {
      const k = i + 1, top = y - h, x = 150 - w / 2, lit = k <= reached;
      const f = F.find((o) => o.n === k) || {};
      const body = lit ? (f.color || '#ffd54a') : '#5d4c9c';
      P.push(`<rect x="${x}" y="${top}" width="${w}" height="${h - 2}" rx="3" fill="${esc(body)}" stroke="#24174d" stroke-width="2"${lit ? '' : ' opacity=".8"'}/>`);
      P.push(`<rect x="${x - 4}" y="${top - 3}" width="${w + 8}" height="5" rx="2" fill="${lit ? '#fff1c1' : '#7f70bd'}" stroke="#24174d" stroke-width="1.4"/>`);
      const nw = Math.max(1, Math.round(w / 30)), ww = Math.max(3, h * 0.3);
      for (let j = 0; j < nw; j++) {
        const wx = x + (w / nw) * (j + 0.5) - ww / 2;
        P.push(`<rect x="${wx.toFixed(1)}" y="${(top + h * 0.28).toFixed(1)}" width="${ww.toFixed(1)}" height="${(ww * 1.25).toFixed(1)}" rx="1.5" fill="${lit ? '#fff8cf' : '#33276a'}"${lit ? ' filter="url(#tg)"' : ''}/>`);
      }
      if (k === reached + 1) P.push(`<text x="150" y="${(top + h * 0.78).toFixed(1)}" fill="#e9e2ff" font-size="${Math.round(h * 0.7)}" font-weight="900" text-anchor="middle" opacity=".85">?</text>`);
      if (k === reached) here = { top, right: x + w, f, k };
      y = top - 3; w -= k < 3 ? 12 : 13;
    });
    const spireBase = y;
    const flag = here ? `<line x1="${here.right - 6}" y1="${here.top - 2}" x2="${here.right - 6}" y2="${here.top - 24}" stroke="#24174d" stroke-width="2"/>
      <path d="M${here.right - 6} ${here.top - 24}l16 5-16 5z" fill="#ff5d73" stroke="#24174d" stroke-width="1.2"/>
      <g transform="translate(${Math.min(here.right + 10, 176)},${here.top - 64})">
        <path d="M0 0h112a8 8 0 0 1 8 8v22a8 8 0 0 1-8 8H24l-12 10 2-10H8a8 8 0 0 1-8-8V8a8 8 0 0 1 8-8z" fill="#fff" stroke="#24174d" stroke-width="1.6"/>
        <text x="10" y="16" fill="#ff5d73" font-size="10.5" font-weight="800">지금 여기!</text>
        <text x="10" y="31" fill="#24174d" font-size="10.5" font-weight="700">${esc(here.k + '층 ' + (here.f.short || here.f.name || ''))}</text>
      </g>` : '';
    return `<svg viewBox="0 0 300 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(c.title || '')} ${total}층 중 ${reached}층까지">
      <defs>
        <linearGradient id="tsky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#170f3d"/><stop offset=".45" stop-color="#4a2fa0"/><stop offset=".78" stop-color="#b65fd2"/><stop offset="1" stop-color="#ffa3c2"/></linearGradient>
        <linearGradient id="tgold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6c4"/><stop offset="1" stop-color="#ffc23d"/></linearGradient>
        <radialGradient id="thalo"><stop offset="0" stop-color="#fff3b0" stop-opacity=".9"/><stop offset="1" stop-color="#fff3b0" stop-opacity="0"/></radialGradient>
        <filter id="tg" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="1.6" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      <rect width="300" height="400" fill="url(#tsky)"/>
      ${stars.map(([x, yy, r]) => `<circle cx="${x}" cy="${yy}" r="${r}" fill="#fff" opacity=".85"/>`).join('')}
      <path d="M252 70a16 16 0 1 0 12 26a13 13 0 1 1-12-26z" fill="#fff4c9" opacity=".9"/>
      <text x="150" y="36" fill="#ffe7a3" font-size="11.5" font-weight="700" text-anchor="middle" letter-spacing="2">${esc(c.kicker || '')}</text>
      <text x="150" y="84" fill="url(#tgold)" stroke="#2a1a5e" stroke-width="6" paint-order="stroke" stroke-linejoin="round" font-size="50" font-weight="900" text-anchor="middle" letter-spacing="-1">${esc(c.title || '')}</text>
      <circle cx="150" cy="${spireBase - 40}" r="26" fill="url(#thalo)"/>
      <path d="M144 ${spireBase} L150 ${spireBase - 30} L156 ${spireBase} Z" fill="#7f70bd" stroke="#24174d" stroke-width="1.4"/>
      <path d="M150 ${spireBase - 52}l4.4 9 9.9 1.4-7.2 7 1.7 9.8-8.8-4.6-8.8 4.6 1.7-9.8-7.2-7 9.9-1.4z" fill="#ffd84a" stroke="#24174d" stroke-width="1.5" filter="url(#tg)"/>
      <text x="150" y="${spireBase - 37}" fill="#24174d" font-size="7.5" font-weight="900" text-anchor="middle">${total}</text>
      ${P.join('')}
      <g fill="#fff" opacity=".55"><ellipse cx="96" cy="${spireBase + 54}" rx="46" ry="9"/><ellipse cx="206" cy="${spireBase + 62}" rx="52" ry="10"/><ellipse cx="150" cy="${spireBase + 70}" rx="40" ry="7"/></g>
      ${flag}
      <g fill="#fff"><ellipse cx="40" cy="372" rx="58" ry="20"/><ellipse cx="128" cy="380" rx="64" ry="20"/><ellipse cx="224" cy="374" rx="70" ry="22"/><ellipse cx="292" cy="382" rx="40" ry="18"/><rect x="0" y="380" width="300" height="20"/></g>
      <g transform="translate(150 380)">
        <path d="M-104 -11h208l-8 11 8 11h-208l8-11z" fill="#3a2477" stroke="#ffd84a" stroke-width="1.5"/>
        <text y="4.5" fill="#fff" font-size="12" font-weight="800" text-anchor="middle">${total}층 중 ${reached}층까지 열렸어요</text>
      </g>
    </svg>`;
  };

  // 구루 13F 표지: 이번 분기에 많이 산 종목(빨강)과 많이 판 종목(파랑)을 막대로.
  const guruSVG = (G, c) => {
    const all = [...G.buys, ...G.sells].map((r) => Math.abs(r.v));
    const max = Math.max(1, ...all);
    const eok = (v) => { const a = Math.abs(v) / 1e8; return (v < 0 ? '−' : '+') + (a >= 10 ? Math.round(a) : a.toFixed(1)) + '억'; };
    const rows = (list, y0, col) => list.map((r, i) => {
      const y = y0 + i * 30, w = Math.max(6, (Math.abs(r.v) / max) * 112);
      return `<text x="22" y="${y + 12}" fill="#0b0b0b" font-size="13" font-weight="800">${esc(r.t)}</text>
        <text x="22" y="${y + 25}" fill="#898781" font-size="9.5">${esc(r.n)}</text>
        <rect x="112" y="${y + 4}" width="${w.toFixed(1)}" height="13" rx="3" fill="${col}"/>
        <text x="${(116 + w).toFixed(1)}" y="${y + 14.5}" fill="${col}" font-size="11" font-weight="800">${eok(r.v)}</text>
        <text x="280" y="${y + 14.5}" fill="#898781" font-size="10.5" text-anchor="end">${r.c}곳</text>`;
    }).join('');
    const yb = 120, ys = yb + G.buys.length * 30 + 30;
    return `<svg viewBox="0 0 300 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(G.qlabel)} 구루 13F">
      <rect width="300" height="400" fill="#fbfaf6"/>
      <rect x="0" y="0" width="300" height="6" fill="#0b0b0b"/>
      <text x="22" y="36" fill="#c42f2e" font-size="11" font-weight="800" letter-spacing="1.5">${esc(c.kicker || '13F TRACKER')}</text>
      <text x="22" y="66" fill="#0b0b0b" font-size="27" font-weight="900" letter-spacing="-1">${esc(c.mast || '')}</text>
      <text x="22" y="88" fill="#52514e" font-size="12" font-weight="600">${esc(G.qlabel)} · 구루 ${G.n}곳</text>
      <line x1="22" y1="100" x2="278" y2="100" stroke="#0b0b0b" stroke-width="1.2"/>
      <text x="22" y="${yb - 4}" fill="#c42f2e" font-size="11" font-weight="800">▲ 많이 산 종목</text>
      ${rows(G.buys, yb + 2, '#e34948')}
      <text x="22" y="${ys - 4}" fill="#2a78d6" font-size="11" font-weight="800">▼ 많이 판 종목</text>
      ${rows(G.sells, ys + 2, '#2a78d6')}
      <text x="22" y="388" fill="#898781" font-size="9.5">금액 = 구루들이 사고판 합계(달러) · N곳 = 사고판 구루 수 · ETF 제외</text>
    </svg>`;
  };

  // Seok's Stock 표지: 앱처럼 어두운 바탕에 대표 백테스트(배당 재투자) 곡선, 로그 눈금.
  const stockSVG = (B) => {
    const X0 = 24, X1 = 276, Y0 = 344, Y1 = 196;
    const lv = B.pts.map(([, v]) => Math.log(v)), lo = Math.min(0, ...lv), hi = Math.max(...lv);
    const t0 = B.pts[0][0], t1 = B.pts[B.pts.length - 1][0];
    const sx = (t) => X0 + (X1 - X0) * (t - t0) / Math.max(1, t1 - t0);
    const sy = (v) => Y0 - (Y0 - Y1) * (Math.log(v) - lo) / Math.max(1e-9, hi - lo);
    const line = B.pts.map(([t, v], i) => `${i ? 'L' : 'M'}${sx(t).toFixed(1)} ${sy(v).toFixed(1)}`).join('');
    const area = `${line}L${X1} ${Y0}L${X0} ${Y0}Z`;
    const yA = new Date(t0).getUTCFullYear(), yB = new Date(t1).getUTCFullYear();
    const ticks = [];
    for (let y = Math.ceil(yA / 10) * 10; y < yB; y += 10) ticks.push(y);
    const tk = ticks.map((y) => { const x = sx(Date.UTC(y, 0, 1)); return `<line x1="${x.toFixed(1)}" y1="${Y1 - 6}" x2="${x.toFixed(1)}" y2="${Y0}" stroke="#ffffff" stroke-opacity=".07"/><text x="${x.toFixed(1)}" y="${Y0 + 16}" fill="#7d8a8c" font-size="10" text-anchor="middle">${y}</text>`; }).join('');
    const ex = sx(t1), ey = sy(B.pts[B.pts.length - 1][1]);
    return `<svg viewBox="0 0 300 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${esc(B.benchName)} ${yA}년부터 ${B.times}배">
      <defs><linearGradient id="sbg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#14201f"/><stop offset="1" stop-color="#0b1112"/></linearGradient>
        <linearGradient id="sar" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#19c3a6" stop-opacity=".45"/><stop offset="1" stop-color="#19c3a6" stop-opacity="0"/></linearGradient></defs>
      <rect width="300" height="400" fill="url(#sbg)"/>
      <rect x="22" y="26" width="26" height="26" rx="7" fill="#00756b"/>
      <path d="M28 44l5-6 4 3 6-8" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="56" y="45" fill="#fff" font-size="19" font-weight="800" letter-spacing="-.4">Seok's Stock</text>
      <text x="22" y="74" fill="#8fa3a5" font-size="11.5">백테스트 · 목표·노후 · 내 자산</text>
      <text x="22" y="122" fill="#9fb5b6" font-size="12">${yA}년 1월 ${esc(B.benchName)}에 넣은 돈은</text>
      <text x="22" y="168" fill="#2ee0bf" font-size="44" font-weight="900" letter-spacing="-1.5">${esc(B.times)}배</text>
      <text x="${22 + String(B.times).length * 25 + 40}" y="168" fill="#9fb5b6" font-size="12">${yB}년 지금</text>
      ${tk}
      <path d="${area}" fill="url(#sar)"/>
      <path d="${line}" stroke="#2ee0bf" stroke-width="2" fill="none" stroke-linejoin="round"/>
      <circle cx="${ex.toFixed(1)}" cy="${ey.toFixed(1)}" r="4" fill="#2ee0bf" stroke="#0b1112" stroke-width="2"/>
      <text x="22" y="384" fill="#5f6e70" font-size="9.5">배당 재투자 · 달러 기준 · 과거 성과는 미래를 보장하지 않아요</text>
    </svg>`;
  };

  const coverShowsTitle = (p) => ['overlay', 'paper', 'type', 'tower', 'guru', 'stock'].includes(p.cover && p.cover.style);

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

    if (st === 'stock' && it.stock) {
      el.className = 'cv cv-wind';
      el.innerHTML = stockSVG(it.stock);
    } else if (st === 'guru' && it.guru) {
      el.className = 'cv cv-wind';
      el.innerHTML = guruSVG(it.guru, c);
    } else if (st === 'tower') {
      el.className = 'cv cv-wind';
      el.innerHTML = towerSVG(c);
    } else if (st === 'type') {
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
        <div class="pm"${c.mastSize ? ` style="font-size:${+c.mastSize}cqw"` : ''}>${esc(c.mast || p.name)}</div><div class="ps">${esc(c.sub || '')}</div>
        <div class="pa"></div><div class="ph">${esc(it.title || '')}</div>`;
      const svg = safeSVG(it.svg);
      if (svg) $('.pa', el).appendChild(svg);
      else if (it.cover) $('.pa', el).appendChild(img('full'));
      else {
        // 그림이 없는 종이 표지(예: SEOKONOMY): 큰 제목 → 부제 → 두 단 본문 → 아래 줄로 지면처럼 채운다.
        $('.pa', el).remove();
        el.classList.add('cv-paper-text');
        if (p.accent) el.style.setProperty('--pacc', p.accent);
        el.insertAdjacentHTML('beforeend', `${it.deck ? `<div class="pd">${esc(it.deck)}</div>` : ''}
          ${it.body ? `<div class="pb">${esc(it.body)}</div>` : '<div class="pb"></div>'}
          ${it.foot ? `<div class="pf">${esc(it.foot)}</div>` : ''}`);
      }
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
    if (p.group === 'daily') return dayKey(t) === dayKey(now);
    return now - t < (p.schedule && p.schedule.every === 'quarter' ? 14 : 3) * DAY;
  };

  function statusOf(p, it, now) {
    if (it.empty) return { cls: 'idle', text: p.emptyText || '첫 호를 기다리는 중' };
    if (it.status) return it.status;
    if (!p.schedule) return { cls: p.group === 'always' ? 'idle' : 'ok', text: fill(p.statusText, it) || '언제든 열려 있어요' };
    if (p.schedule.every === 'quarter' && it.period) {
      const nq = nextQuarterEnd(it.period), due = Date.parse(nq + 'T00:00:00+09:00') + (p.schedule.lagDays || 45) * DAY;
      const [ny, nm] = nq.split('-').map(Number);
      if (now > due + 10 * DAY) return { cls: 'late', text: `예정보다 늦어지고 있어요 · ${ny}년 ${Math.ceil(nm / 3)}분기 공시` };
      const dk = dayKey(due), yr = dk.slice(0, 4) !== dayKey(now).slice(0, 4) ? dk.slice(0, 4) + '년 ' : '';
      return { cls: 'ok', text: `다음 공시 ${yr}${fmtDay(dk)} 무렵` };
    }
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
        <p class="hl" hidden></p>
        <p class="sm">${esc(p.desc || '')}</p>
        <i class="gap"></i>
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
    const hl = $('.hl', a), sm = $('.sm', a);
    hl.textContent = it.title || '';
    hl.hidden = !it.title;
    hl.classList.toggle('dup', coverShowsTitle(p)); // 표지에 이미 제목이 있으면 큰 화면에선 숨김
    const curated = ((state.summaries || {})[p.id] || {})[it.key];
    sm.textContent = curated || it.summary || ((it.empty || !it.title) ? p.desc || '' : '');
    sm.hidden = !sm.textContent;
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
    $('.hl', a).hidden = true;
    $('.sm', a).textContent = p.desc || '';
    $('.sm', a).hidden = false;
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
    pill.onclick = () => showTab('new', true);
    state.unread = unread;
    paintTabs();
    document.title = (unread ? `(${unread}) ` : '') + (state.cfg.title || '석스 가판대');
  }

  // 모든 카드를 가장 큰 카드 높이에 맞춘다(글은 자르지 않고, 남는 자리는 상태 줄 위로).
  // 탭의 카드가 한 줄에 다 들어가면 좋으니, 넘칠 때는 카드 너비를 조금 줄여 한 줄에 담는다.
  // (넓은 화면 모드에서만 효과가 있다. 2열·1열 모드는 CSS가 --cw를 쓰지 않는다.)
  // 줄여도 CW_MIN보다 좁아지면 줄이지 않고 다음 줄로 넘긴다('전체' 탭처럼 많은 경우).
  const CW_MIN = 200, CW_GAP = 22;
  function fitCols(cards) {
    const board = $('#main');
    if (!board) return;
    board.style.removeProperty('--cw');
    const cs = getComputedStyle(board);
    const base = parseFloat(cs.getPropertyValue('--cw')) || 236;
    const n = cards.length;
    if (n < 2) return;
    const w = board.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
    if (n * base + (n - 1) * CW_GAP <= w) return;
    const cw = Math.floor((w - (n - 1) * CW_GAP) / n);
    if (cw >= CW_MIN) board.style.setProperty('--cw', cw + 'px');
  }
  function equalize() {
    document.querySelectorAll('.card').forEach((c) => { c.style.minHeight = ''; });
    const cards = [...document.querySelectorAll('.card')].filter((c) => !c.hidden);
    fitCols(cards);
    const max = Math.max(0, ...cards.map((c) => c.getBoundingClientRect().height));
    if (max > 0) cards.forEach((c) => { c.style.minHeight = Math.ceil(max) + 'px'; });
  }
  let eqTimer = 0;
  const equalizeSoon = () => { clearTimeout(eqTimer); eqTimer = setTimeout(equalize, 120); };

  /* ---------- 탭 ---------- */
  // 탭: '새로 나온 것'(안 본 호) · projects.json의 tabs · '전체'. 프로젝트는 tab 값으로 들어간다.
  const tabOf = (p) => ((state.cfg.tabs || []).some((t) => t.id === p.tab) ? p.tab : 'etc');
  function buildTabs(cfg) {
    const ps = cfg.projects.filter((p) => !p.hidden);
    const tabs = (cfg.tabs || []).filter((t) => ps.some((p) => p.tab === t.id));
    if (ps.some((p) => tabOf(p) === 'etc')) tabs.push({ id: 'etc', name: '그 밖의 것', note: '' });
    return [{ id: 'new', name: '새로 나온 것' }, ...tabs, { id: 'all', name: '전체', note: cfg.allNote || '' }];
  }

  function layout(cfg) {
    const gi = (id) => { const i = (cfg.groups || []).findIndex((g) => g.id === id); return i < 0 ? 99 : i; };
    const ps = cfg.projects.filter((p) => !p.hidden).map((p, i) => ({ p, i }))
      .sort((x, y) => gi(x.p.group) - gi(y.p.group) || x.i - y.i).map((x) => x.p); // 자주 나오는 순서
    state.tabs = buildTabs(cfg);
    const bar = $('#tabs');
    bar.innerHTML = state.tabs.map((t) => `<button class="tab" role="tab" type="button" data-tab="${esc(t.id)}" aria-selected="false">${esc(t.name)}<i class="tdot" aria-hidden="true"></i><em class="tn"></em></button>`).join('');
    bar.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab, true)));
    const main = $('#main');
    main.innerHTML = '<p class="tabnote" id="tabnote" hidden></p><div class="grid" id="grid"></div><p class="empty" id="empty" hidden></p>';
    ps.forEach((p) => { const c = cardShell(p); c.dataset.tab = tabOf(p); $('#grid').appendChild(c); });
  }

  function paintTabs() {
    const unreadCards = [...document.querySelectorAll('#grid .card.unread')];
    document.querySelectorAll('.tab').forEach((b) => {
      const t = b.dataset.tab;
      const n = t === 'new' ? unreadCards.length : t === 'all' ? 0 : unreadCards.filter((c) => c.dataset.tab === t).length;
      $('.tn', b).textContent = t === 'new' && n ? n : '';
      b.classList.toggle('has-new', t !== 'new' && n > 0);
    });
    paintTabNote();
  }

  function paintTabNote() {
    const el = $('#tabnote');
    if (!el) return;
    if (state.tab === 'new') {
      const n = state.unread || 0;
      el.innerHTML = n ? `아직 안 본 새 호가 <b>${n}개</b> 있어요.<button class="textbtn" id="allread" type="button">모두 봤어요로 표시 ›</button>` : '';
      const btn = $('#allread');
      if (btn) btn.addEventListener('click', () => {
        markSeen(visible().filter((p) => state.items[p.id] && state.items[p.id].key).map((p) => p.id));
        paintRead(); showTab('new');
      });
    } else {
      const t = (state.tabs || []).find((x) => x.id === state.tab) || {};
      el.textContent = t.note || '';
    }
    el.hidden = !el.textContent.trim();
  }

  function showTab(id, byUser) {
    if (!(state.tabs || []).some((t) => t.id === id)) id = state.tabs[1] ? state.tabs[1].id : 'all';
    state.tab = id;
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === id ? 'true' : 'false'));
    let shown = 0;
    document.querySelectorAll('#grid .card').forEach((c) => {
      // 데이터를 읽기 전에는 '새로 나온 것'을 가릴 수 없으니 모두 보여 준다.
      const on = id === 'all' || (id === 'new' ? (!state.ready || c.classList.contains('unread')) : c.dataset.tab === id);
      c.hidden = !on;
      if (on) shown++;
    });
    const empty = $('#empty');
    empty.hidden = shown > 0;
    empty.textContent = id === 'new' ? '새로 나온 건 모두 봤어요. 다음 호를 기다리는 중이에요.' : '아직 여기에 놓인 것이 없어요.';
    paintTabNote();
    try { sessionStorage.setItem(TABSTORE, id); } catch (err) { /* 무시 */ }
    if (byUser) {
      try { localStorage.setItem(TABSTORE, id); } catch (err) { /* 저장 못 해도 그만 */ }
      try { history.replaceState(null, '', '#' + id); } catch (err) { /* 무시 */ }
      const act = $('.tab[aria-selected="true"]');
      if (act) act.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }
    equalize();
    // 탭을 눌렀는데 카드가 화면 아래로 넘치면, 탭 막대가 위에 붙도록 올려서 한 화면에 담는다.
    if (byUser) {
      const bar = $('.tabsbar'), grid = $('#grid');
      const navH = $('.gnav').getBoundingClientRect().height;
      const barTop = bar.getBoundingClientRect().top + scrollY - navH;
      if (grid.getBoundingClientRect().bottom > innerHeight && scrollY < barTop - 2) scrollTo({ top: barTop, behavior: 'smooth' });
    }
  }

  async function refresh() {
    const now = Date.now();
    state.last = now;
    state.summaries = await getJSON('summaries.json').catch(() => state.summaries || {});
    await Promise.all(visible().map(async (p) => {
      const ad = ADAPTERS[(p.source && p.source.type) || 'static'];
      try {
        if (!ad) throw new Error('모르는 형식: ' + (p.source && p.source.type));
        fillCard(p, await ad(p.source || {}), now);
      } catch (err) { failCard(p, err); }
    }));
    $('#checked').textContent = `마지막 확인 ${hm(now)}`;
    paintRead();
    if (state.ready) showTab(state.tab); else equalize();
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
    if (cfg.credit) {
      const m = String(cfg.credit).match(/^(.*\bby)\s+(.+)$/i);
      $('#credit').innerHTML = m ? `<span>${esc(m[1])}</span> <em>${esc(m[2])}</em>` : `<em>${esc(cfg.credit)}</em>`;
    } else $('#credit').hidden = true;
    layout(cfg);
    const fromHash = decodeURIComponent(location.hash.slice(1));
    const asked = state.tabs.some((t) => t.id === fromHash) ? fromHash : null;
    let saved = null; try { saved = localStorage.getItem(TABSTORE); } catch (err) { saved = null; }
    let comeback = null;
    try { const r = document.referrer ? new URL(document.referrer) : null; if (r && r.origin === location.origin && !/^\/(index\.html)?$/.test(r.pathname)) comeback = sessionStorage.getItem(TABSTORE); } catch (err) { comeback = null; }
    showTab(asked || (state.tabs.some((t) => t.id === comeback) ? comeback : 'new'));
    $('#forget').addEventListener('click', (e) => { e.preventDefault(); try { localStorage.removeItem(STORE); } catch (err) { /* 무시 */ } paintRead(); });
    await refresh();
    state.ready = true;
    // 주소에 탭이 없으면: 안 본 새 호가 있을 때 '새로 나온 것', 없으면 지난번에 본 탭(없으면 첫 분류)
    const fallback = saved && saved !== 'new' && state.tabs.some((t) => t.id === saved) ? saved : state.tabs[1].id;
    // 프로그램을 보다가 '가판대' 단추로 돌아왔으면, 떠날 때 보던 탭 그대로
    let back = null;
    try {
      const r = document.referrer ? new URL(document.referrer) : null;
      if (r && r.origin === location.origin && !/^\/(index\.html)?$/.test(r.pathname)) back = sessionStorage.getItem(TABSTORE);
    } catch (err) { back = null; }
    if (back && !state.tabs.some((t) => t.id === back)) back = null;
    showTab(asked || back || (state.unread ? 'new' : fallback));
    window.addEventListener('hashchange', () => { const h = decodeURIComponent(location.hash.slice(1)); if (state.tabs.some((t) => t.id === h)) showTab(h); });
    setInterval(() => { if (!document.hidden) refresh(); }, REFRESH);
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - state.last > 5 * 60e3) refresh(); });
    window.addEventListener('pageshow', (e) => { if (e.persisted) paintRead(); }); // 뒤로 가기로 돌아왔을 때
    window.addEventListener('resize', equalizeSoon);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(equalize);
    window.addEventListener('storage', (e) => { if (e.key === STORE) paintRead(); }); // 다른 탭에서 읽었을 때
  }

  start();
})();
