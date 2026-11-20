// 한국어 자연어 조건 해석기(규칙 기반, 키 없이 동작)
// 입력 문장 → 백테스트 상태(bt state) + 보고서(무엇을 알아들었고 무엇을 기본값으로 채웠나)
import { getUniverse, norm } from './data.js';
import { todayYm, ymAdd, ymToIso } from './dates.js';

// 수작업 별칭(유니버스 별칭에 더해)
const EXTRA_ALIASES = {
  '하이닉스': '000660', 'sk하이닉스': '000660', '닉스': '000660', '삼전': '005930', '삼성전자우': '005935', '삼성': '005930',
  '현대차': '005380', '현차': '005380', '기아차': '000270', '네이버': '035420', '카카오': '035720', '셀트리온': '068270',
  '삼바': '207940', '삼성바이오': '207940', '엔솔': '373220', '엘지엔솔': '373220', 'lg엔솔': '373220', '포스코': '005490',
  '한전': '015760', '한국전력': '015760', '에코프로비엠': '247540', '알테오젠': '196170', '한화에어로': '012450', '두산에너빌리티': '034020',
  '코스피200': '069500', '코스피 200': '069500', 'kodex200': '069500', '코스닥150': '229200',
  's&p500': 'SPY', 's&p 500': 'SPY', 'sp500': 'SPY', '에스앤피500': 'SPY', '에스엔피': 'SPY', '에스앤피': 'SPY',
  '나스닥100': 'QQQ', '나스닥 100': 'QQQ', '나스닥': 'QQQ', '다우': 'DIA', '러셀2000': 'IWM',
  '미국채10년': 'IEF', '미국 장기채': 'TLT', '장기채': 'TLT', '미국채': 'IEF', '단기채': 'SHY', '하이일드': 'HYG',
  '금': 'GLD', '은': 'SLV', '리츠': 'VNQ', '비트코인': 'MSTR',
};
// '주식/채권/현금' 같은 일반어 → 시장별 기본 ETF
const GENERIC = {
  US: { 주식: 'SPY', 채권: 'BND', 현금: 'BIL', 금: 'GLD' },
  KR: { 주식: '069500', 채권: '148070', 현금: '459580', 금: '411060' },
};
export const PRESETS = {
  '올웨더': { name: '올웨더(근사)', assets: [['VTI', 30], ['TLT', 40], ['IEF', 15], ['GLD', 7.5], ['DBC', 7.5]] },
  '영구포트폴리오': { name: '영구 포트폴리오', assets: [['VTI', 25], ['TLT', 25], ['BIL', 25], ['GLD', 25]] },
  '60/40': { name: '주식 60 채권 40', assets: [['SPY', 60], ['BND', 40]] },
  '6040': { name: '주식 60 채권 40', assets: [['SPY', 60], ['BND', 40]] },
};
const INDEX_LIKE = new Set(['SPY', 'VOO', 'IVV', 'VTI', 'QQQ', 'QQQM', 'DIA', 'IWM', 'VT', '069500', '102110', '360750', '379800', '133690', '379810']);

const KNUM = { 한: 1, 하나: 1, 일: 1, 두: 2, 둘: 2, 이: 2, 세: 3, 셋: 3, 삼: 3, 네: 4, 넷: 4, 사: 4, 다섯: 5, 오: 5, 여섯: 6, 육: 6, 일곱: 7, 칠: 7, 여덟: 8, 팔: 8, 아홉: 9, 구: 9, 열: 10, 십: 10 };

export function defaultBtState() {
  return {
    period: { preset: '10y', start: null, end: null },
    currency: 'KRW', initial: 10000000,
    flow: { type: 'none', amount: 0, pct: 4, freq: 'M', growth: 0 },
    reinvest: true, feeBp: 0, benchmark: 'SPY',
    portfolios: [newPortfolio('포트폴리오 1')],
  };
}
export function newPortfolio(name) {
  return {
    name, kind: 'static', assets: [],
    rank: { group: 'US_STOCK', metric: 'mcap', from: 1, top: 3, lookback: 12, skip: 0, weighting: 'equal', maxW: null, exclude: [] },
    rebalance: 'A', band: { abs: 5, rel: 0 },
  };
}

/** 문장 정규화 */
function normalize(t) {
  let s = String(t || '').replace(/[　\s]+/g, ' ').replace(/[％]/g, '%').replace(/[～〜]/g, '~').trim();
  s = s.replace(/(\d)\s*(프로|퍼센트|퍼)(?![가-힣])/g, '$1%');
  s = s.replace(/(\d),(\d{3})/g, '$1$2').replace(/(\d),(\d{3})/g, '$1$2');
  // 한글 수: '세 종목', '다섯 개', '삼 년'
  s = s.replace(/(^|[\s(])(한|하나|두|둘|세|셋|네|넷|다섯|여섯|일곱|여덟|아홉|열)\s*(개|종목|가지|년|달|해)(?![가-힣])/g, (m, a, k, u) => `${a}${KNUM[k]}${u}`);
  s = s.replace(/천만\s*원/g, '1000만원').replace(/(^|[^\d])천만/g, '$11000만');
  s = s.replace(/(^|[^\d])백만/g, '$1100만').replace(/(^|[^\d])만불/g, '$110000달러');
  return s;
}

/** 금액 표현 파싱: '1억 5천', '1000만원', '$10,000', '1만 달러', '10k' → {value, cur, idx, len} */
function findAmounts(s) {
  const out = [];
  const re = /(\$\s?\d+(?:\.\d+)?\s*(?:k|K|천|만)?)|(\d+(?:\.\d+)?\s*억(?:\s*\d+(?:\.\d+)?\s*(?:천만|천|만))?\s*(?:원)?)|(\d+(?:\.\d+)?\s*(?:천만|만|천)\s*(?:원|달러|불)?)|(\d+(?:\.\d+)?\s*(?:원|달러|불))|(\d+(?:\.\d+)?\s*k\b)/gi;
  let m;
  while ((m = re.exec(s))) {
    const txt = m[0];
    let cur = /\$|달러|불/.test(txt) ? 'USD' : 'KRW';
    let v = 0;
    const num = (x) => parseFloat(x);
    if (/\$/.test(txt)) {
      v = num(txt.replace(/[^\d.]/g, ''));
      if (/k|K|천/.test(txt)) v *= 1000; else if (/만/.test(txt)) v *= 10000;
    } else if (/억/.test(txt)) {
      const [a, b] = txt.split('억');
      v = num(a) * 1e8;
      const bm = (b || '').match(/(\d+(?:\.\d+)?)\s*(천만|천|만)/);
      if (bm) v += num(bm[1]) * (bm[2] === '천만' ? 1e7 : bm[2] === '천' ? 1e7 : 1e4);
    } else if (/천만/.test(txt)) v = num(txt) * 1e7;
    else if (/만/.test(txt)) v = num(txt) * 1e4;
    else if (/천/.test(txt)) v = num(txt) * 1e3;
    else if (/k/i.test(txt)) { v = num(txt) * 1000; cur = 'USD'; }
    else v = num(txt);
    if (cur === 'USD' && /만/.test(txt) && !/\$/.test(txt)) v = num(txt) * 1e4;
    if (v > 0) out.push({ value: v, cur, idx: m.index, len: txt.length, txt });
  }
  return out;
}

/** 자산 이름 찾기(긴 이름 먼저). 반환: [{key, idx, len, text}] */
function findAssets(s, mask) {
  const U = getUniverse();
  if (!U) return [];
  const lower = s.toLowerCase();
  const cands = [];
  const add = (name, key, minLen = 2) => {
    const n = String(name).toLowerCase();
    if (n.length < minLen) return;
    cands.push([n, key]);
  };
  for (const it of U.items) {
    if (it.t === 'index' && !/^IDX_/.test(it.k)) continue;
    if (it.m === 'IDX') continue;
    add(it.n, it.k, 2);
    add(it.n.replace(/\s+/g, ''), it.k, 3);
    for (const a of it.al || []) add(a, it.k, 2);
    if (it.m === 'KR') add(it.k, it.k, 6);
  }
  for (const [a, k] of Object.entries(EXTRA_ALIASES)) if (k.length > 1 || a.length > 1) cands.push([a.toLowerCase(), k]);
  cands.sort((a, b) => b[0].length - a[0].length);
  const used = mask || new Uint8Array(s.length);
  const found = [];
  const free = (i, l) => { for (let j = i; j < i + l; j++) if (used[j]) return false; return true; };
  const mark = (i, l) => { for (let j = i; j < i + l; j++) used[j] = 1; };
  for (const [n, key] of cands) {
    if (n === '금' || n === '은') continue; // 일반어 처리에서
    let from = 0, i;
    while ((i = lower.indexOf(n, from)) >= 0) {
      from = i + 1;
      const before = lower[i - 1] || ' ', after = lower[i + n.length] || ' ';
      // 영문 티커/이름은 단어 경계 필요
      if (/[a-z0-9]/.test(n[0]) && /[a-z0-9]/.test(before)) continue;
      if (/[a-z0-9]$/.test(n) && /[a-z0-9]/.test(after)) continue;
      if (/^\d{6}$/.test(n) && (/\d/.test(before) || /\d/.test(after))) continue;
      if (!free(i, n.length)) continue;
      mark(i, n.length);
      found.push({ key, idx: i, len: n.length, text: s.substr(i, n.length) });
    }
  }
  // 대문자 티커(유니버스에 있는 미국 티커): 'QQQ', 'BRK-B', 'C'(1~2글자는 대문자로 쓴 경우만)
  const re = /(^|[^A-Za-z0-9])([A-Z]{1,5}(?:-[AB])?)(?=$|[^A-Za-z0-9])/g;
  let m;
  while ((m = re.exec(s))) {
    const t = m[2], i = m.index + m[1].length;
    if (!free(i, t.length)) continue;
    if (U.byKey.has(t) && U.byKey.get(t).m === 'US') {
      if (['ETF', 'KRW', 'USD', 'VS', 'TOP', 'AI', 'TR', 'H', 'IRP', 'ISA', 'MDD', 'CAGR'].includes(t)) continue;
      mark(i, t.length); found.push({ key: t, idx: i, len: t.length, text: t });
    }
  }
  // 소문자 티커(3글자 이상, 'qqq', 'schd')
  const re2 = /(^|[^A-Za-z0-9])([a-z]{3,5})(?=$|[^A-Za-z0-9])/g;
  while ((m = re2.exec(s))) {
    const t = m[2].toUpperCase(), i = m.index + m[1].length;
    if (!free(i, t.length)) continue;
    if (U.byKey.has(t) && U.byKey.get(t).m === 'US' && !['THE', 'AND', 'FOR'].includes(t)) { mark(i, t.length); found.push({ key: t, idx: i, len: t.length, text: m[2] }); }
  }
  found.sort((a, b) => a.idx - b.idx);
  return found;
}

/**
 * 해석: 문장 → {state, report}
 * prev: 지금 상태(고치는 문장 '분기로 바꿔줘'를 덮어쓸 때)
 */
export function parseCommand(text, prev = null) {
  const s0 = normalize(text);
  const s = s0;
  const said = new Set(), defaulted = [], warnings = [], ignored = [];
  const mask = new Uint8Array(s.length);
  const markRange = (i, l) => { for (let j = i; j < i + l && j < s.length; j++) mask[j] = 1; };
  const st = defaultBtState();
  const P = st.portfolios[0];

  // ---- 금액(먼저 확정해 숫자 오인을 막음)
  const amounts = findAmounts(s);
  amounts.forEach((a) => markRange(a.idx, a.len));
  // 날짜·연도 표현도 먼저 가림
  const yearRe = /((?:19|20)\d{2})\s*(?:년|\.|-|\/)?\s*(\d{1,2})?\s*(?:월)?/g;
  const years = [];
  let m;
  while ((m = yearRe.exec(s))) { years.push({ y: +m[1], mo: m[2] ? +m[2] : null, idx: m.index, len: m[0].length }); markRange(m.index, m[0].length); }

  // ---- 프리셋(올웨더 등): 하나의 포트폴리오 묶음으로 취급
  const presetItems = [];
  const preRe = /(올\s*웨더|영구\s*포트폴리오|60\s*\/\s*40\s*포트?)/g;
  while ((m = preRe.exec(s))) {
    const k = m[1].replace(/\s+/g, '').replace(/포트$/, '');
    if (PRESETS[k]) { presetItems.push({ type: 'preset', preset: k, idx: m.index, len: m[0].length }); markRange(m.index, m[0].length); }
  }

  // ---- 자산 찾기
  const assets = findAssets(s, mask);
  // 일반어(주식/채권/현금/금)
  const genRe = /(^|[\s,(])(주식|채권|현금|금)(?=\s*\d|\s*(?:반|나머지)|[\s,)]|$)/g;
  const generic = [];
  while ((m = genRe.exec(s))) {
    const i = m.index + m[1].length;
    if (mask[i]) continue;
    // '금리', '금액', '지금' 같은 경우는 정규식 경계로 이미 배제
    generic.push({ word: m[2], idx: i, len: m[2].length });
    markRange(i, m[2].length);
  }

  // ---- 순위 전략 감지
  const rankMetric = /(시총|시가총액|대장주|덩치)/.test(s) ? 'mcap'
    : /(모멘텀|많이\s*오른|수익률\s*(상위|높은|좋은)|상승률\s*상위|12-1)/.test(s) ? 'mom'
      : /(변동성\s*(낮은|작은|하위)|저변동|덜\s*흔들|안정적인)/.test(s) ? 'lowvol' : null;
  const rankN = (() => {
    let r;
    if ((r = s.match(/(\d+)\s*[~\-–]\s*(\d+)\s*(?:등|위)/))) return [+r[1], +r[2]];
    if ((r = s.match(/(\d+)\s*(?:등|위)\s*부터\s*(\d+)\s*(?:등|위)/))) return [+r[1], +r[2]];
    if ((r = s.match(/(?:상위|톱|top|TOP|베스트)\s*(\d+)/))) return [1, +r[1]];
    if ((r = s.match(/(\d+)\s*(?:등|위)\s*(?:까지|안)/))) return [1, +r[1]];
    if ((r = s.match(/(\d+)\s*(?:등|위)\s*만/))) return [+r[1], +r[1]];
    if ((r = s.match(/(\d+)\s*(?:개|종목|가지)(?![가-힣]*월)/))) return [1, +r[1]];
    return null;
  })();
  const isRank = !!rankMetric && (assets.length === 0 || /(중에서|중\s|빼고|제외)/.test(s));

  // ---- 시장
  const mUS = /(미국|미장|美|S&P|에스앤피)/i.test(s), mKR = /(한국|국내|국장|코스피|코스닥|국내상장)/.test(s);
  const mETF = /ETF|이티에프/i.test(s);

  if (isRank) {
    P.kind = 'rank';
    said.add('rank');
    P.rank.metric = rankMetric;
    P.rank.group = (mKR && !mUS) ? (mETF ? 'KR_ETF' : 'KR_STOCK') : (mETF ? 'US_ETF' : 'US_STOCK');
    if (!mKR && !mUS) defaulted.push('market');
    if (rankN) { P.rank.from = rankN[0]; P.rank.top = rankN[1]; } else { P.rank.from = 1; P.rank.top = 5; defaulted.push('topN'); }
    if (/(시총\s*(비중|가중)|시가총액\s*(비중|가중))/.test(s)) P.rank.weighting = 'mcap';
    else if (/역변동성/.test(s)) P.rank.weighting = 'invvol';
    else { P.rank.weighting = 'equal'; if (!/(동일|똑같이|균등|1\/N|같은\s*비)/.test(s)) defaulted.push('weighting'); }
    let r;
    if ((r = s.match(/(?:최대|상한)\s*(\d+(?:\.\d+)?)\s*%/))) P.rank.maxW = +r[1];
    if (rankMetric === 'mom') {
      if ((r = s.match(/(\d+)\s*개월\s*(?:수익률|모멘텀|상승률)/))) P.rank.lookback = +r[1];
      else if (/12-1/.test(s)) { P.rank.lookback = 12; P.rank.skip = 1; } else defaulted.push('lookback');
    }
    if (rankMetric === 'lowvol') {
      if ((r = s.match(/(\d+)\s*개월\s*변동성/))) P.rank.lookback = +r[1];
    }
    // 제외 종목
    for (const a of assets) {
      const after = s.slice(a.idx + a.len, a.idx + a.len + 6);
      if (/^\s*(은|는|을|를)?\s*(빼고|제외)/.test(after)) P.rank.exclude.push(a.key);
    }
    P.rebalance = 'M';
  } else if (assets.length || generic.length || presetItems.length) {
    // ---- 고정 비중: 자산 뒤 숫자 = 비중
    const items = [...assets.map((a) => ({ ...a, type: 'asset' })), ...generic.map((g) => ({ ...g, type: 'generic' })), ...presetItems].sort((a, b) => a.idx - b.idx);
    const mkt = items.some((x) => x.type === 'asset' && (getUniverse().byKey.get(x.key)?.m === 'US')) ? 'US' : items.some((x) => x.type === 'asset') ? 'KR' : (mKR && !mUS ? 'KR' : 'US');
    const groups = splitComparison(s, items);
    st.portfolios = groups.map((g, i) => {
      const pf = newPortfolio(`포트폴리오 ${i + 1}`);
      if (g.length === 1 && g[0].type === 'preset') {
        const pr = PRESETS[g[0].preset];
        pf.name = pr.name; pf.assets = pr.assets.map(([key, w]) => ({ key, w }));
      } else pf.assets = itemsToAssets(s, g.filter((x) => x.type !== 'preset'), mkt, defaulted);
      return pf;
    });
    said.add('assets');
    // 비교: 단일 지수형 하나 + 나머지 → 벤치마크
    if (st.portfolios.length >= 2) {
      const single = st.portfolios.map((p) => p.assets.length === 1 && INDEX_LIKE.has(p.assets[0].key));
      const allSingle = single.every(Boolean);
      if (!allSingle) {
        const bi = single.lastIndexOf(true);
        if (bi >= 0 && st.portfolios.length > 1) { st.benchmark = st.portfolios[bi].assets[0].key; st.portfolios.splice(bi, 1); said.add('benchmark'); }
      } else { st.benchmark = null; said.add('benchmark'); }
    }
    st.portfolios = st.portfolios.slice(0, 3);
    st.portfolios.forEach((p) => { if (p.assets.length === 1) p.rebalance = 'none'; });
  }

  // ---- 리밸런싱
  const reb = parseRebalance(s, isRank);
  if (reb) {
    st.portfolios.forEach((p) => {
      if (reb.mode === 'band' && p.kind === 'rank') { warnings.push('순위 전략에는 밴드 리밸런싱을 쓸 수 없어 매월로 계산해요.'); return; }
      p.rebalance = reb.mode; if (reb.band) p.band = reb.band; if (reb.month) p.rebMonth = reb.month;
    });
    said.add('rebalance');
  } else defaulted.push('rebalance');

  // ---- 기간
  const per = parsePeriod(s, years);
  if (per) { st.period = per; said.add('period'); } else defaulted.push('period');

  // ---- 금액: 적립/인출 vs 시작 금액
  let initSet = false;
  for (const a of amounts) {
    const before = s.slice(Math.max(0, a.idx - 8), a.idx), after = s.slice(a.idx + a.len, a.idx + a.len + 10);
    const freq = /(매달|매월|월\s*$|한\s*달에|달마다|1개월마다)/.test(before) || /^\s*씩?\s*(매달|매월)/.test(after) ? 'M'
      : /(분기|3개월)/.test(before) ? 'Q' : /(매년|해마다|1년에|연\s*$)/.test(before) ? 'A' : null;
    const isWithdraw = /(빼\s*쓰|빼서|인출|꺼내|생활비)/.test(after) || /(인출)/.test(before);
    const isContrib = /(적립|넣|모으|사\s*모|투자하|매수)/.test(after) || /씩/.test(after.slice(0, 2)) || /(적립)/.test(before);
    if (freq && (isWithdraw || isContrib || /씩/.test(after))) {
      st.flow = { type: isWithdraw ? 'withdraw' : 'contribute', amount: a.value, pct: 4, freq, growth: 0 };
      said.add('flow');
      if (!st._curSaid) { st.currency = a.cur; st._curSaid = true; }
    } else if (!initSet) {
      st.initial = a.value; initSet = true; said.add('initial');
      st.currency = a.cur; st._curSaid = true;
    }
  }
  let r;
  if ((r = s.match(/(?:연|매년|1년에)\s*(\d+(?:\.\d+)?)\s*%\s*씩?\s*(?:인출|빼)/))) { st.flow = { type: 'withdrawPct', amount: 0, pct: +r[1], freq: 'A', growth: 0 }; said.add('flow'); }
  if ((r = s.match(/(?:매년|해마다)\s*(\d+(?:\.\d+)?)\s*%\s*(?:씩)?\s*(?:늘|증액|올려)/))) { st.flow.growth = +r[1]; }
  if (st.flow.type === 'contribute' && !initSet) { st.initial = st.flow.amount; defaulted.push('initial'); }
  if (!initSet && st.flow.type === 'none') defaulted.push('initial');

  // ---- 통화
  if (/원화\s*(로|기준)?/.test(s)) { st.currency = 'KRW'; st._curSaid = true; }
  if (/달러\s*(로|기준)/.test(s)) { st.currency = 'USD'; st._curSaid = true; }
  if (!st._curSaid) {
    const keys = st.portfolios.flatMap((p) => (p.kind === 'rank' ? [p.rank.group.startsWith('US') ? 'SPY' : '069500'] : p.assets.map((a) => a.key)));
    const curs = new Set(keys.map((k) => getUniverse()?.byKey.get(k)?.cur || 'USD'));
    st.currency = curs.size === 1 ? [...curs][0] : 'KRW';
    defaulted.push('currency');
  }
  if (!initSet && st.flow.type === 'none') st.initial = st.currency === 'USD' ? 10000 : 10000000;
  delete st._curSaid;

  // ---- 벤치마크
  if ((r = s.match(/(코스피|코스닥|S&P\s*500|에스앤피|나스닥|다우|SPY|QQQ|KODEX\s*200)\s*(?:와|과|랑|이랑|하고)?\s*(?:대비|비교|보다)/i))) {
    const w = r[1].toLowerCase();
    st.benchmark = /코스피|kodex/.test(w) ? '069500' : /코스닥/.test(w) ? '229200' : /나스닥|qqq/.test(w) ? 'QQQ' : /다우/.test(w) ? 'DIA' : 'SPY';
    said.add('benchmark');
    // 벤치마크로 쓴 이름이 포트폴리오 자산으로 잘못 들어갔으면 제거
    st.portfolios.forEach((p) => { if (p.kind === 'static' && p.assets.length > 1) p.assets = p.assets.filter((a) => a.key !== st.benchmark || a.w); });
  } else if (!said.has('benchmark')) {
    const keys = st.portfolios.flatMap((p) => (p.kind === 'rank' ? [p.rank.group.startsWith('US') ? 'SPY' : '069500'] : p.assets.map((a) => a.key)));
    const kr = keys.filter((k) => isKoreaExposure(k)).length;
    st.benchmark = kr > keys.length / 2 ? '069500' : 'SPY';
    defaulted.push('benchmark');
  }
  if (st.portfolios.length === 1 && st.portfolios[0].kind === 'static' && st.portfolios[0].assets.length === 1 && st.portfolios[0].assets[0].key === st.benchmark) {
    st.benchmark = st.benchmark === 'SPY' ? 'QQQ' : 'SPY';
  }

  // ---- 배당·비용
  if (/배당\s*(재투자\s*)?(안|없이|빼고|제외|미재투자)/.test(s)) { st.reinvest = false; said.add('reinvest'); }
  if ((r = s.match(/(?:수수료|비용|거래비용)\s*(\d+(?:\.\d+)?)\s*%/))) { st.feeBp = Math.round(+r[1] * 100); said.add('fee'); }
  if (/(내\s*포트폴리오|내\s*자산|내\s*구성|지금\s*내|내\s*계좌|내\s*연금)/.test(s)) { st.source = 'assets'; said.add('assets'); }

  // ---- 미지원
  if (/(배당\s*(많이|높은|수익률\s*상위)|고배당\s*종목\s*\d)/.test(s) && !assets.length) warnings.push('배당수익률 순위는 아직 지원하지 않아요. SCHD나 TIGER 미국배당다우존스 같은 배당 ETF로 비교해 보세요.');
  if (/매주|주\s*단위/.test(s)) warnings.push('주 단위 리밸런싱은 아직 안 돼서 매월로 정했어요.');

  const empty = !st.portfolios.some((p) => p.kind === 'rank' || p.assets.length) && !st.source;
  if (empty) warnings.push('담을 종목이나 고르는 규칙을 찾지 못했어요. 예: "QQQ 60 SCHD 40" 또는 "미국 시총 상위 3개".');
  // 고치는 문장(종목 없음 + 이전 상태 있음): 리밸런싱·기간·금액 등만 덮어쓰기
  if (prev && empty && (said.size > 0)) {
    const merged = structuredClone(prev);
    if (said.has('rebalance')) merged.portfolios.forEach((p) => { p.rebalance = st.portfolios[0].rebalance; p.band = st.portfolios[0].band; });
    if (said.has('period')) merged.period = st.period;
    if (said.has('initial')) { merged.initial = st.initial; merged.currency = st.currency; }
    if (said.has('flow')) merged.flow = st.flow;
    if (said.has('benchmark')) merged.benchmark = st.benchmark;
    if (said.has('reinvest')) merged.reinvest = st.reinvest;
    if (said.has('fee')) merged.feeBp = st.feeBp;
    return { state: merged, report: { patch: true, said: [...said], defaulted: [], warnings: warnings.filter((w) => !w.startsWith('담을')), ignored } };
  }
  st.meta = { said: [...said], defaulted: [...new Set(defaulted)] };
  return { state: st, report: { patch: false, said: [...said], defaulted: [...new Set(defaulted)], warnings, ignored, empty } };
}

function isKoreaExposure(k) {
  const it = getUniverse()?.byKey.get(k);
  if (!it || it.m !== 'KR') return false;
  return !/(미국|글로벌|나스닥|S&P|차이나|중국|일본|인도|선진국|신흥국|유로|베트남|달러|해외|월드)/.test(it.n);
}

/** 비교 문장 'A vs B', 'A랑 B 비교' → 자산 묶음 나누기 */
function splitComparison(s, items) {
  if ((!/(vs|VS|비교|대결|중\s*뭐가|중\s*어느)/.test(s) || items.length < 2) && !items.some((x) => x.type === 'preset')) return [items];
  const groups = [[]];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (it.type === 'preset') { if (groups[groups.length - 1].length) groups.push([]); groups[groups.length - 1].push(it); groups.push([]); continue; }
    groups[groups.length - 1].push(it);
    const next = items[i + 1];
    if (!next) break;
    const between = s.slice(it.idx + it.len, next.idx);
    if (/(vs|VS|대\s|와\s*$|과\s*$|이랑|랑\s|하고\s|와\s|과\s|,\s*그리고)/.test(between) && !/^\s*\d/.test(between)) {
      // 'A 50 B 50이랑 C' → 숫자 뒤 '이랑'에서 끊김
      groups.push([]);
    }
  }
  return groups.filter((g) => g.length);
}

function itemsToAssets(s, items, mkt, defaulted) {
  const out = [];
  let rest = null;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const key = it.type === 'generic' ? GENERIC[mkt][it.word] : it.key;
    if (it.type === 'generic') defaulted.push(`generic:${it.word}`);
    const end = it.idx + it.len;
    const nextIdx = items[i + 1]?.idx ?? s.length;
    const seg = s.slice(end, nextIdx);
    const before = s.slice(Math.max(0, it.idx - 6), it.idx);
    let w = null, mm;
    if ((mm = seg.match(/^\s*(?:은|는|을|를|이|가|:)?\s*(\d+(?:\.\d+)?)\s*%?(?!\s*(?:만|억|원|년|개월|월|달러|등|위|개|일))/))) w = +mm[1];
    if (/나머지|잔여/.test(before)) rest = out.length;
    out.push({ key, w });
  }
  // 비율: '6:4', '60/40'
  const ratio = s.match(/(\d+)\s*[:/]\s*(\d+)(?:\s*[:/]\s*(\d+))?/);
  if (ratio && out.every((a) => a.w == null) && out.length >= 2) {
    const r = [ratio[1], ratio[2], ratio[3]].filter(Boolean).map(Number);
    r.forEach((v, i) => { if (out[i]) out[i].w = v; });
  }
  if (/반반|반\s*반|절반씩/.test(s) && out.length === 2 && out.every((a) => a.w == null)) { out[0].w = 50; out[1].w = 50; }
  const known = out.filter((a) => a.w != null).reduce((t, a) => t + a.w, 0);
  if (rest != null && out[rest].w == null) out[rest].w = Math.max(0, 100 - known);
  const missing = out.filter((a) => a.w == null);
  if (missing.length) {
    const left = Math.max(0, 100 - out.filter((a) => a.w != null).reduce((t, a) => t + a.w, 0));
    const each = (known > 0 ? left : 100) / missing.length;
    missing.forEach((a) => { a.w = +each.toFixed(2); });
    if (known === 0 && out.length > 1 && !/(동일|똑같이|균등|같은\s*비)/.test(s)) defaulted.push('weights');
  }
  const tot = out.reduce((t, a) => t + a.w, 0);
  if (tot > 0 && Math.abs(tot - 100) > 0.01) {
    if (Math.abs(tot - 10) < 0.01) out.forEach((a) => { a.w *= 10; });
    else out.forEach((a) => { a.w = +(a.w * 100 / tot).toFixed(2); });
  }
  // 같은 종목 합치기
  const merged = [];
  for (const a of out) { const f = merged.find((x) => x.key === a.key); if (f) f.w += a.w; else merged.push({ ...a }); }
  return merged;
}

function parseRebalance(s, isRank) {
  let r;
  if ((r = s.match(/[±+]\s*(\d+(?:\.\d+)?)\s*%?\s*p?/)) || (r = s.match(/(\d+(?:\.\d+)?)\s*%\s*p?\s*(?:이상|넘게|넘으면|이상\s*)?\s*(?:벗어나|차이|틀어|이탈)/)) || (r = s.match(/밴드\s*(\d+(?:\.\d+)?)/))) {
    if (/상대|비중의/.test(s)) return { mode: 'band', band: { abs: 0, rel: +r[1] } };
    return { mode: 'band', band: { abs: +r[1], rel: 0 } };
  }
  if (/(리밸런싱|리밸|재조정|교체|바꿔|갈아)\s*(없이|안\s*하|하지\s*않|안\s*함)|사서\s*그냥|그냥\s*두|바이\s*앤\s*홀드|바이앤홀드|묻어/.test(s)) return { mode: 'none' };
  const ctx = isRank || /(리밸|재조정|교체|바꿔|갈아|다시\s*맞)/.test(s);
  const clean = s.replace(/(매달|매월)\s*\d[\d.]*\s*(만|억|천)?\s*원?\s*씩?/g, '');
  if (!ctx) return null;
  if (/(분기|3\s*개월)/.test(clean)) return { mode: 'Q' };
  if (/(반기|6\s*개월)/.test(clean)) return { mode: 'S' };
  if ((r = clean.match(/매년\s*(\d{1,2})\s*월/))) return { mode: 'A', month: +r[1] };
  if (/(1\s*년에\s*한\s*번|매년|해마다|연\s*1\s*회|1\s*년마다|연간|1년\s*단위)/.test(clean)) return { mode: 'A' };
  if (/(매달|매월|한\s*달에\s*한\s*번|1\s*개월에\s*한\s*번|1\s*개월마다|달마다|월\s*1\s*회|월말|말일|매\s*월)/.test(clean)) return { mode: 'M' };
  return null;
}

function parsePeriod(s, years) {
  const end = todayYm();
  let r;
  if ((r = s.match(/(?:최근|지난)\s*(\d+)\s*년/)) || (r = s.match(/(?<![\d])(\d{1,2})\s*년\s*(?:간|동안|치)/)) || (r = s.match(/(?:로|으로)\s*(\d{1,2})\s*년(?![가-힣]*(?:부터|까지))/))) return { preset: `${r[1]}y`, start: null, end: null };
  if ((r = s.match(/(?:최근|지난)\s*(\d+)\s*개월/)) || (r = s.match(/(\d+)\s*개월\s*(?:간|동안)/))) return { preset: `${r[1]}m`, start: null, end: null };
  if (/작년/.test(s)) { const y = Math.floor(end / 100) - 1; return { preset: null, start: `${y}-01`, end: `${y}-12` }; }
  if (/올해/.test(s)) { const y = Math.floor(end / 100); return { preset: null, start: `${y}-01`, end: null }; }
  if (/(전체\s*기간|최대|상장\s*이후|처음부터)/.test(s)) return { preset: 'max', start: null, end: null };
  if (/코로나/.test(s)) return { preset: null, start: '2020-02', end: null, note: '코로나 이후는 2020년 2월부터로 정했어요.' };
  if (/금융\s*위기/.test(s)) return { preset: null, start: '2007-10', end: null };
  if (years.length) {
    const a = years[0], b = years[1];
    const ym = (x, isEnd) => `${x.y}-${String(x.mo || (isEnd ? 12 : 1)).padStart(2, '0')}`;
    const range = b && /(부터|~|-|에서)/.test(s.slice(a.idx, b.idx + 1));
    if (range) return { preset: null, start: ym(a), end: ym(b, true) };
    if (/까지/.test(s.slice(a.idx, a.idx + a.len + 4)) && !/부터/.test(s)) return { preset: null, start: null, end: ym(a, true) };
    return { preset: null, start: ym(a), end: null };
  }
  void ymAdd; void ymToIso;
  return null;
}
