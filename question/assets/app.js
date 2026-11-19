(function () {
  'use strict';

  var RECENT = 5; // 탭에 올리는 최근 질문 수. 6번째부터 가장 오래된 질문이 '지난 질문'으로 옮겨진다.
  var GRAND = 'grand';
  var PALETTE = ['#1F4FD8', '#D9622B', '#2E9E6A', '#8E44AD', '#C9A227', '#0E8FA6', '#6B7280'];

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var app = { data: null, byId: {}, recent: [], archive: [], base: '#/', cache: {}, charts: [] };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function dotDate(d) { return String(d || '').replace(/-/g, '.'); }
  function safeUrl(u) { return /^https:\/\//i.test(String(u || '')) ? String(u) : ''; }
  function safePath(p) { return /^data\/[a-z0-9_\-\/]+\.md$/i.test(String(p || '')) && String(p).indexOf('..') < 0 ? String(p) : ''; }
  function catOf(id) {
    var cs = (app.data && app.data.categories) || [];
    for (var i = 0; i < cs.length; i++) if (cs[i].id === id) return cs[i];
    return { id: id || 'etc', name: id || '기타', desc: '' };
  }
  function isRecent(q) { return app.recent.indexOf(q) >= 0; }

  // ---------- data ----------
  function load() {
    fetch('data/index.json', { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (d) {
        app.data = d;
        var qs = (Array.isArray(d.questions) ? d.questions : []).filter(function (q) { return q && q.id; });
        qs.sort(function (a, b) { return (b.no || 0) - (a.no || 0); });
        app.data.questions = qs;
        qs.forEach(function (q) { app.byId[q.id] = q; });
        app.recent = qs.slice(0, RECENT);
        app.archive = qs.slice(RECENT);
        chrome();
        route();
      })
      .catch(function () {
        $('#content').innerHTML = '<p class="state">질문 목록을 불러오지 못했어요. 잠시 뒤 새로고침해 주세요.</p>';
        $('#dateLabel').textContent = '';
      });
  }

  function fetchReport(q) {
    var path = safePath(q.file);
    if (!path) return Promise.resolve('_보고서 파일 경로가 올바르지 않습니다._');
    if (app.cache[path] != null) return Promise.resolve(app.cache[path]);
    return fetch(path, { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (t) { app.cache[path] = t; return t; })
      .catch(function () { return '_보고서를 불러오지 못했어요. 새로고침해 주세요._'; });
  }

  // ---------- chrome ----------
  function chrome() {
    var d = app.data, qs = d.questions;
    var latest = qs[0];
    $('#dateLabel').textContent = latest ? '질문 ' + qs.length + '편 · 최근 ' + dotDate(latest.date) : '첫 질문을 기다리는 중';
    $('#issueLine').textContent = '하나의 물음에 세상의 창을 모두 열다';
  }

  function tabs(active) {
    var h = '<a class="tab" role="tab" href="#/" aria-selected="' + (active === 'list') + '">질문 리스트</a>';
    app.recent.forEach(function (q) {
      h += '<a class="tab" role="tab" href="#/t/' + esc(q.id) + '" aria-selected="' + (active === q.id) + '"><span class="tno">Q' + pad(q.no) + '</span>' + esc(q.tab || q.title) + '</a>';
    });
    $('#tabs').innerHTML = h;
    var sel = $('#tabs [aria-selected="true"]');
    if (sel && sel.scrollIntoView) sel.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // ---------- routing ----------
  function parse() {
    var h = location.hash || '#/';
    var m = h.match(/^#\/(t|q)\/([a-z0-9_\-]+)$/i);
    if (m) return { kind: m[1], id: m[2] };
    return { kind: 'list' };
  }

  function route() {
    if (!app.data) return;
    var r = parse();
    if (r.kind === 'q') {
      var q = app.byId[r.id];
      if (!q) { location.replace('#/'); return; }
      if (!$('#content').dataset.view) renderBase(app.base);
      openDetail(q);
      return;
    }
    closeDetail(true);
    if (r.kind === 't') {
      var tq = app.byId[r.id];
      if (!tq) { location.replace('#/'); return; }
      if (!isRecent(tq)) { location.replace('#/q/' + tq.id); return; }
      app.base = '#/t/' + tq.id;
    } else {
      app.base = '#/';
    }
    var want = app.base === '#/' ? 'list' : 't:' + app.base.slice(4);
    if ($('#content').dataset.view === want) return; // 상세 화면을 닫고 돌아올 때는 읽던 위치를 그대로 둔다
    renderBase(app.base);
  }

  function renderBase(base) {
    var m = base.match(/^#\/t\/(.+)$/);
    destroyCharts();
    if (m && app.byId[m[1]]) {
      var q = app.byId[m[1]];
      tabs(q.id);
      $('#content').dataset.view = 't:' + q.id;
      $('#content').innerHTML = reportShell(q, 'tab');
      $('#content').dataset.qid = q.id; // 본문은 '왜 그런지 따라가기'를 누를 때 불러온다(숨긴 상태에서는 그래프 크기를 잴 수 없음)
    } else {
      tabs('list');
      $('#content').dataset.view = 'list';
      delete $('#content').dataset.qid;
      $('#content').innerHTML = listHtml();
    }
    window.scrollTo(0, 0);
  }

  // ---------- list ----------
  function card(q) {
    var c = catOf(q.category);
    return '<a class="qcard" href="#/q/' + esc(q.id) + '">' +
      '<div class="qmeta"><span class="qno">Q' + pad(q.no) + '</span><span>' + esc(dotDate(q.date)) + '</span><span class="pill">' + esc(c.name) + '</span>' +
      (isRecent(q) ? '' : '<span class="pill arch">지난 질문</span>') + (q.version ? '<span>' + esc(q.version) + '</span>' : '') + '</div>' +
      '<p class="qtitle">' + esc(q.title) + '</p>' +
      (q.question ? '<p class="qask">' + esc(String(q.question).split('\n')[0]) + '</p>' : '') +
      '<p class="qanswer">' + esc(q.answer) + '</p>' +
      '<span class="qmore">질문과 답 보기 →</span></a>';
  }

  function listHtml() {
    var d = app.data, qs = d.questions;
    var cats = (d.categories || []).slice();
    if (!cats.some(function (c) { return c.id === GRAND; })) cats.unshift({ id: GRAND, name: '거대 담론', desc: '' });
    cats.sort(function (a, b) { return (a.id === GRAND ? -1 : 0) - (b.id === GRAND ? -1 : 0); });
    var known = {};
    cats.forEach(function (c) { known[c.id] = true; });
    qs.forEach(function (q) { if (!known[q.category]) { cats.push(catOf(q.category)); known[q.category] = true; } });

    var h = '<div class="list-intro"><h2>질문 리스트</h2><p>답은 다섯 문장 이내로 압축했습니다. 질문을 누르면 보고서 전체가 열립니다.</p></div>';
    if (!qs.length) return h + '<p class="note">아직 올라온 질문이 없습니다.</p>';
    cats.forEach(function (c) {
      var items = qs.filter(function (q) { return q.category === c.id; });
      if (!items.length && c.id !== GRAND) return;
      h += '<section class="cat" aria-labelledby="cat-' + esc(c.id) + '"><div class="cat-head"><h3 id="cat-' + esc(c.id) + '">' + esc(c.name) + '</h3>' +
        (c.desc ? '<span class="cat-desc">' + esc(c.desc) + '</span>' : '') + '<span class="cat-n">' + items.length + '개</span></div>';
      h += items.length ? '<div class="qcards">' + items.map(card).join('') + '</div>'
        : '<p class="empty-cat">아직 이 분류의 질문은 없습니다. 인간과 문명, AI와 인류의 미래처럼 큰 질문이 이곳에 모입니다.</p>';
      h += '</section>';
    });
    return h;
  }

  // ---------- report ----------
  function readMinutes(q) { return q.minutes ? ' · 읽는 데 약 ' + esc(q.minutes) + '분' : ''; }
  function answerHtml(q) {
    var a = Array.isArray(q.lead) ? q.lead : String(q.answer || '').split(/\n\s*\n/);
    return a.filter(function (x) { return String(x).trim(); }).map(function (x) { return '<p>' + esc(String(x).trim()) + '</p>'; }).join('');
  }

  // 첫 화면: Q. 질문과 답만. 본문은 '왜 그런지 따라가기'를 눌러야 열린다.
  function reportShell(q, mode) {
    var c = catOf(q.category);
    var ask = String(q.question || q.title || '').split('\n')[0];
    var more = String(q.question || '').split('\n').slice(1).join(' ').trim();
    return '<section class="rfront">' +
      '<div class="qmeta"><span class="qno">Q' + pad(q.no) + '</span><span>' + esc(dotDate(q.date)) + '</span><span class="pill">' + esc(c.name) + '</span>' +
      (isRecent(q) ? '' : '<span class="pill arch">지난 질문</span>') + '</div>' +
      '<h2 class="rq"' + (mode === 'detail' ? ' id="detailTitle"' : '') + '><span class="qmark">Q.</span> ' + esc(ask) + '</h2>' +
      (more ? '<p class="rq-more">' + esc(more) + '</p>' : '') +
      '<div class="ranswer">' + answerHtml(q) + '</div>' +
      '<button type="button" class="readmore" data-readmore>왜 그런지 따라가기' + readMinutes(q) + ' <span aria-hidden="true">↓</span></button>' +
      '</section>' +
      '<section class="rmain" hidden>' +
      '<div class="rmain-head"><h2 class="rtitle">' + esc(q.title) + '</h2>' +
      '<button type="button" class="btn-outline toc-toggle" data-toc-toggle aria-pressed="false">차례 숨기기</button></div>' +
      '<div class="rbody"><nav class="rtoc" aria-label="차례"><p>차례</p><ol></ol></nav>' +
      '<article class="prose"><p class="state">불러오는 중…</p></article></div>' +
      '<p class="rback"><button type="button" class="btn-ghost" data-totop>↑ 질문과 답으로 돌아가기</button></p>' +
      '</section>';
  }

  // 한국어 본문에서 '**[확정]**은'처럼 굵은 글씨 바로 뒤에 조사가 붙으면 마크다운이 굵게 처리하지 못한다.
  // 코드 블록 밖의 **...**를 <strong>으로 미리 바꿔 둔다.
  function fixBold(md) {
    return String(md).split(/(```[\s\S]*?```)/).map(function (part, i) {
      if (i % 2 === 1) return part;
      return part.replace(/\*\*(?=\S)([^*\n]+?)\*\*/g, function (m, inner) {
        return /\s$/.test(inner) ? m : '<strong>' + inner + '</strong>';
      });
    }).join('');
  }

  function fillReport(q, root) {
    var token = (root.dataset.token = String(Math.random()));
    fetchReport(q).then(function (md) {
      if (root.dataset.token !== token) return;
      var art = $('.prose', root);
      if (!art) return;
      var html = window.marked ? window.marked.parse(fixBold(md), { gfm: true }) : '<pre>' + esc(md) + '</pre>';
      art.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(html) : esc(md);
      art.querySelectorAll('table').forEach(function (t) {
        var w = document.createElement('div'); w.className = 'tbl';
        t.parentNode.insertBefore(w, t); w.appendChild(t);
      });
      var toc = $('.rtoc ol', root), n = 0, items = '';
      art.querySelectorAll('h3').forEach(function (h) {
        var id = q.id + '-s' + (++n);
        h.id = id;
        items += '<li><a href="#" data-jump="' + id + '">' + esc(h.textContent) + '</a></li>';
      });
      art.querySelectorAll('h4').forEach(function (h, i) { h.id = q.id + '-h' + i; });
      if (toc) toc.innerHTML = items;
      hydrateCharts(art);
    });
  }

  // ---------- 차례 숨기기 (선택 기억) ----------
  function tocHidden() { try { return localStorage.getItem('sq-toc') === 'hide'; } catch (e) { return false; } }
  function applyToc(root) {
    var h = tocHidden();
    root.querySelectorAll('.rmain').forEach(function (m) { m.classList.toggle('wide', h); });
    root.querySelectorAll('[data-toc-toggle]').forEach(function (b) { b.textContent = h ? '차례 보이기' : '차례 숨기기'; b.setAttribute('aria-pressed', String(h)); });
  }

  // ---------- charts ----------
  function destroyCharts() {
    app.charts.forEach(function (c) { try { c.destroy(); } catch (e) {} });
    app.charts = [];
  }
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  function hydrateCharts(root) {
    root.querySelectorAll('pre > code.language-chart').forEach(function (code) {
      var pre = code.parentNode, cfg;
      try { cfg = JSON.parse(code.textContent); } catch (e) { return; }
      if (!cfg || !cfg.data || !Array.isArray(cfg.data.datasets)) return;
      var fig = document.createElement('figure'); fig.className = 'chart';
      var box = document.createElement('div'); box.className = 'cv';
      var cv = document.createElement('canvas');
      cv.setAttribute('role', 'img');
      cv.setAttribute('aria-label', cfg.caption || '그래프');
      box.appendChild(cv); fig.appendChild(box);
      if (cfg.caption) { var fc = document.createElement('figcaption'); fc.textContent = cfg.caption; fig.appendChild(fc); }
      pre.parentNode.replaceChild(fig, pre);
      if (!window.Chart) return;
      var type = cfg.type || 'bar';
      var ink2 = cssVar('--ink-2') || '#4B5563', line = cssVar('--line') || '#E2E5EA';
      cfg.data.datasets.forEach(function (ds, i) {
        var col = PALETTE[i % PALETTE.length];
        if (!ds.borderColor) ds.borderColor = col;
        if (!ds.backgroundColor) ds.backgroundColor = (type === 'line' || type === 'scatter') ? col : col + 'CC';
        if (type === 'line' && ds.tension == null) ds.tension = 0.2;
      });
      var opts = cfg.options || {};
      opts.responsive = true; opts.maintainAspectRatio = false;
      opts.plugins = opts.plugins || {};
      opts.plugins.legend = opts.plugins.legend || { labels: { color: ink2, font: { family: 'IBM Plex Sans KR' } } };
      if (type !== 'pie' && type !== 'doughnut' && type !== 'radar') {
        opts.scales = opts.scales || {};
        ['x', 'y'].forEach(function (ax) {
          var s = opts.scales[ax] = opts.scales[ax] || {};
          s.ticks = s.ticks || {}; s.ticks.color = s.ticks.color || ink2;
          s.grid = s.grid || {}; s.grid.color = s.grid.color || line;
        });
      }
      try { app.charts.push(new window.Chart(cv, { type: type, data: cfg.data, options: opts })); } catch (e) {}
    });
  }

  // ---------- detail sheet ----------
  var lastFocus = null;
  function openDetail(q) {
    var det = $('#detail'), body = $('#detailBody');
    if (det.hidden) lastFocus = document.activeElement;
    closeArch();
    det.hidden = false;
    document.body.classList.add('lock');
    body.innerHTML = reportShell(q, 'detail');
    body.dataset.qid = q.id;
    $('.detail-sheet').scrollTop = 0;
    $('.detail-sheet').focus();
  }
  function closeDetail(silent) {
    var det = $('#detail');
    if (det.hidden) return;
    det.hidden = true;
    document.body.classList.remove('lock');
    $('#detailBody').innerHTML = '';
    if (!silent && parse().kind === 'q') location.hash = app.base;
    if (lastFocus && lastFocus.focus) { try { lastFocus.focus(); } catch (e) {} }
  }

  // ---------- archive panel ----------
  function archHtml() {
    if (!app.archive.length) {
      return '<p class="note">아직 지난 질문이 없습니다. 질문이 여섯 개가 되면 가장 오래된 질문부터 이곳으로 옮겨지고, 질문 리스트에서도 계속 볼 수 있습니다.</p>';
    }
    var h = '', month = '';
    app.archive.forEach(function (q) {
      var m = String(q.date || '').slice(0, 7);
      if (m !== month) { month = m; h += '<p class="arch-month">' + esc(m.replace('-', '년 ')) + '월</p>'; }
      h += '<a class="arch-item" href="#/q/' + esc(q.id) + '"><span class="qmeta"><span class="qno">Q' + pad(q.no) + '</span><span>' + esc(dotDate(q.date)) + '</span><span class="pill">' + esc(catOf(q.category).name) + '</span></span><b>' + esc(q.title) + '</b></a>';
    });
    return h;
  }
  function openArch() {
    $('#archList').innerHTML = archHtml();
    $('#archPanel').hidden = false; $('#archScrim').hidden = false;
    $('#archBtn').setAttribute('aria-expanded', 'true');
  }
  function closeArch() {
    $('#archPanel').hidden = true; $('#archScrim').hidden = true;
    $('#archBtn').setAttribute('aria-expanded', 'false');
  }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var t = e.target.closest ? e.target : null;
    if (!t) return;
    var jump = t.closest('[data-jump]');
    if (jump) {
      e.preventDefault();
      var el = document.getElementById(jump.getAttribute('data-jump'));
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    var rm = t.closest('[data-readmore]');
    if (rm) {
      e.preventDefault();
      var scope = rm.closest('#detailBody') || $('#content');
      var main = $('.rmain', scope);
      if (main) {
        main.hidden = false; applyToc(scope);
        if (!main.dataset.loaded) { main.dataset.loaded = '1'; var qid = scope.dataset.qid; if (app.byId[qid]) fillReport(app.byId[qid], scope); }
        setTimeout(function () { main.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 30);
      }
      return;
    }
    if (t.closest('[data-toc-toggle]')) {
      e.preventDefault();
      try { localStorage.setItem('sq-toc', tocHidden() ? 'show' : 'hide'); } catch (x) {}
      applyToc(document);
      return;
    }
    if (t.closest('[data-totop]')) {
      e.preventDefault();
      var sc = t.closest('#detailBody') ? $('.detail-sheet') : null;
      if (sc) sc.scrollTo({ top: 0, behavior: 'smooth' }); else window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (t.closest('[data-close]')) { e.preventDefault(); closeDetail(false); return; }
    if (t.closest('[data-arch-close]')) { e.preventDefault(); closeArch(); return; }
    if (t.closest('#archBtn')) { e.preventDefault(); if ($('#archPanel').hidden) openArch(); else closeArch(); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (!$('#detail').hidden) closeDetail(false);
    else if (!$('#archPanel').hidden) closeArch();
  });
  window.addEventListener('hashchange', route);
  load();
})();
