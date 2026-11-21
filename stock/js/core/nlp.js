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

// 실적 지표 말(순서 중요: '영업이익률'을 '영업이익 성장'보다 먼저)
const FUND_WORDS = [
  [/영업\s*이익\s*률/, 'opm'], [/순\s*이익\s*률/, 'npm'],
  [/(?:eps|주당\s*순?\s*이익)\s*(?:성장|증가)\s*률?/, 'eps'], [/영업\s*이익\s*(?:성장|증가)\s*률?/, 'oi'],
  [/순\s*이익\s*(?:성장|증가)\s*률?/, 'ni'], [/매출\s*액?\s*(?:성장|증가)\s*률?/, 'rev'],
];

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


// ---- 제외 조건(분류): '레버리지 ETF는 빼고', '인버스 제외'
const CAT_WORDS = [['lev', /(레버리지|2배|3배|2x|3x)/i], ['inv', /(인버스|곱버스)/], ['bond', /(채권|국채|국고채)/], ['cmdty', /(원자재|금\s*(?:etf|현물)?|골드)/i], ['single', /단일\s*종목/], ['cc', /커버드\s*콜/], ['cash', /(현금성|머니마켓|cd금리|단기채)/i]];
function findExcludeCats(s) {
  const out = new Set();
  const re = /([가-힣a-zA-Z0-9·,\s]{1,30}?)\s*(?:etf|ETF|상품|종목|들)?\s*(?:은|는|을|를|도|이랑|과|와)?\s*(?:다\s*)?(?:빼고|빼서|제외|말고|빼줘|빼면)/g;
  let m;
  while ((m = re.exec(s))) {
    const seg = m[1].split(/(?:중에서?|중|에서)\s/).pop();
    for (const [k, rx] of CAT_WORDS) if (rx.test(seg)) out.add(k);
  }
  return [...out];
}

// ---- 타이밍·조건부 리밸런싱
const SIG_WORDS = [[/(s&p\s*500|에스앤피|spy|미국\s*시장|미장)/i, 'SPY'], [/(나스닥|qqq)/i, 'QQQ'], [/(코스피|kospi|국장|069500|kodex\s*200)/i, '069500'], [/(코스닥)/, '229200']];
export function parseTiming(s, isKR) {
  const t = s.toLowerCase();
  const def = isKR ? '069500' : 'SPY';
  const sigOf = (seg) => { if (/(포트폴리오|계좌|내\s*자산|전체)/.test(seg)) return 'self'; if (/(각\s*종목|종목마다|종목별|개별\s*종목)/.test(seg)) return 'each'; for (const [rx, k] of SIG_WORDS) if (rx.test(seg)) return k; return def; };
  const toOf = () => {
    const d = t.match(/(현금|초단기채|단기채|장기채|국채|미국채|채권|tlt|ief|bil|shy)\s*(?:etf)?\s*(?:으로|로|에)\s*(?:피신|옮|이동|바꾸|갈아|가|빼|넣|대피|전환|$)/) || t.match(/(현금|초단기채|단기채|장기채|국채|미국채|채권)\s*(?:으로|로)(?![가-힣]*보다)/) || t.match(/면\s*(현금|초단기채|단기채|장기채|국채|미국채|채권)(?=[\s,.!?]|$)/);
    const w = d?.[1] || '';
    if (/현금/.test(w)) return 'CASH';
    if (/장기채|tlt/.test(w)) return isKR ? '148070' : 'TLT';
    if (/^(국채|미국채|채권|ief)$/.test(w)) return isKR ? '148070' : 'IEF';
    if (/shy/.test(w)) return 'SHY';
    return isKR ? '153130' : 'BIL';
  };
  const isReb = /리밸런싱|비중\s*(을|를)?\s*(되돌|맞추|조정)/.test(t);
  const isOut = /(팔|매도|현금|피신|쉬|빠져|탈출|손절|채권으로|국채로|단기채로|정리)/.test(t);
  const check = /(월말|매달\s*말|한\s*달에\s*한\s*번\s*확인|월\s*단위\s*확인)/.test(t) ? 'M' : 'D';
  let rule = null, buy = null, sigSeg = t;
  let m;
  if ((m = t.match(/([^.,?!]{0,30}?)(?:고점\s*(?:대비|에서)?\s*)?[−-]?\s*(\d+(?:\.\d+)?)\s*%\s*(?:이상|넘게|정도)?\s*(?:빠지|빠졌|하락|떨어|내려|폭락)/))) { rule = { type: 'dd', th: -Math.abs(+m[2]), op: 'below' }; sigSeg = m[1]; }
  else if ((m = t.match(/([^.,?!]{0,20}?)(\d+)\s*(일|개월|달)\s*(?:이동\s*)?(?:평균)?\s*선?\s*(?:을|를|이)?\s*(아래|밑|이탈|깨|하회|밑돌|위|돌파|넘|상회)/))) {
    const below = /아래|밑|이탈|깨|하회|밑돌/.test(m[4]);
    rule = { type: 'ma', n: +m[2], unit: m[3] === '일' ? 'd' : 'm', op: below ? 'below' : 'above' }; sigSeg = m[1];
    if (!below && isOut) rule.op = 'below';
  } else if (/데드\s*크로스/.test(t)) rule = { type: 'cross', fast: 50, slow: 200, op: 'dead' };
  else if (/골든\s*크로스/.test(t)) { rule = { type: 'cross', fast: 50, slow: 200, op: 'dead' }; }
  else if ((m = t.match(/rsi\s*(?:가|이)?\s*(\d+)\s*(이하|아래|밑|이상|넘|위)/))) {
    const lo = /이하|아래|밑/.test(m[2]);
    const other = t.match(/(\d+)\s*(이상|넘|위)[^.]*?(팔|매도)/) || t.match(/(\d+)\s*(이하|아래|밑)[^.]*?(사|매수)/);
    if (lo) { buy = { type: 'rsi', n: 14, op: 'below', th: +m[1] }; rule = { type: 'rsi', n: 14, op: 'above', th: other && /이상|넘|위/.test(other[2]) ? +other[1] : 70 }; }
    else { rule = { type: 'rsi', n: 14, op: 'above', th: +m[1] }; const b2 = t.match(/(\d+)\s*(이하|아래|밑)/); buy = { type: 'rsi', n: 14, op: 'below', th: b2 ? +b2[1] : 30 }; }
    sigSeg = t.slice(0, t.indexOf('rsi'));
  } else if ((m = t.match(/vix\s*(?:가|이)?\s*(\d+)\s*(이상|넘|위|초과)/))) rule = { type: 'vix', op: 'above', th: +m[1] };
  else if ((m = t.match(/(\d+)\s*(?:개월|달)\s*수익률\s*(?:이|가)?\s*(마이너스|음수|0\s*%?\s*(?:아래|미만|이하)|단기채보다\s*낮|현금보다\s*낮)/))) rule = { type: 'ret', n: +m[1], unit: 'm', op: 'below', th: /단기채|현금/.test(m[2]) ? 'cash' : 0 };
  else if (/절대\s*모멘텀|듀얼\s*모멘텀/.test(t)) rule = { type: 'ret', n: 12, unit: 'm', op: 'below', th: 'cash' };
  else if ((m = t.match(/트레일링\s*스톱\s*[−-]?\s*(\d+)/))) rule = { type: 'trail', th: -Math.abs(+m[1]) };
  else if ((m = t.match(/변동성\s*(?:을|를)?\s*(?:연\s*)?(\d+)\s*%\s*(?:에|로)?\s*(?:맞추|타깃|타겟|목표)/))) return { kind: 'scale', signal: 'self', targetVol: +m[1], volWindow: 63, to: toOf(), check: 'M' };
  else if (/볼린저/.test(t)) { rule = { type: 'bb', n: 20, k: 2, op: 'aboveUpper' }; buy = { type: 'bb', n: 20, k: 2, op: 'belowLower' }; }
  else if (/macd/.test(t)) rule = { type: 'macd', op: 'bear' };
  if (!rule) return null;
  const signal = sigOf(String(sigSeg).slice(-14));
  const chk = /(매일|날마다|하루)/.test(t) ? 'D' : (rule.unit === 'm' || rule.type === 'ret') ? 'M' : check;
  if (isReb && !isOut) return { kind: 'trigger', signal, rule, check: chk, cooldown: 20 };
  // 'X% 빠지면 매수' 같은 역추세: 처음엔 현금으로 기다렸다가 사고, 회복하면 팖
  if (rule.type === 'dd' && /(사|매수|추가\s*매수|담)/.test(t) && !isOut) return { kind: 'switch', signal, sell: { type: 'dd', th: -3, op: 'above' }, buy: rule, to: toOf(), check, startIn: false, note: '하락 때 사고 고점 근처(−3% 안)로 회복하면 파는 규칙으로 해석했어요.' };
  return { kind: 'switch', signal, sell: rule, buy, to: toOf(), check: chk };
}

// ---- 반영하지 못했을 수 있는 말(간단 점검)
const KNOWN = /^(매출|매출액|성장률|성장|증가율|영업이익|영업이익률|순이익|순이익률|이익률|eps|EPS|qoq|QoQ|yoy|YoY|전분기|직전|대비|실적|미국주식|국내주식|최근|지난|동안|기간|부터|까지|년|개월|달|매달|매월|매년|분기|반기|말일|말일날|말|월말|연말|리밸런싱|리밸|비중|같은|동일|똑같이|균등|시총|시가총액|모멘텀|수익률|상승률|변동성|낮은|높은|좋은|많이|오른|상위|하위|위|등|개|종목|주식|etf|채권|현금|금|미국|국내|한국|코스피|코스닥|나스닥|대형주|중에서|중|골라서|고르|골라|담|담아|사|사서|사고|팔|팔고|매수|매도|투자|투자하면|하면|했을|때|경우|결과|백테스트|보여|보여줘|알려줘|해줘|해|줘|하고|하는|걸로|으로|로|씩|원|만원|달러|적립|인출|비교|대비|벤치마크|이랑|랑|와|과|하고|및|또|그리고|좀|이렇게|정도|약|만|빼고|제외|말고|레버리지|인버스|기준|원화|달러로|배당|재투자|수수료|비용|거래비용|한번|번|1달에|한달에|한|가장|제일|각|마다|이하|이상|아래|위로|넘으면|빠지면|떨어지면|하락|고점|이동평균|일선|개월선|데드크로스|골든크로스|rsi|vix|피신|쉬기|단기채|국채|장기채|트레일링|스톱|볼린저|macd|절대|듀얼|상대|되돌리기|맞추기|교체|바꾸|바꿔|다시|처음|시작|금액|원으로|기준으로|월|일|주|이|그|저|것|거|수|등등|포트폴리오|전략|규칙|조건|어떻게|얼마|몇|년간|팔기|사기|쉬기|추가|낮으면|높으면|넘으면|이상에서|이하에서|수익|교체하면|느낌|대해|대한|위해|하나|둘|셋|모두|전부|각각|매일|확인|판단|시점|이후|이전|동안만|정도로|높은것|낮은것|가치|밸류|수익성|퀄리티|팩터|멀티|복합|베타|저베타|고베타|반전|단기|52주|고점|최고|최고가|근접|위험|조정|이익수익률|매출수익률|per|psr|싼|싸게|저평가|비례|가중|평균|순위|점수|네|4개|e\/p|s\/p)$/i;
const ENDINGS = /(하면|하고|해서|하는|했을|하기|해줘|해주세요|하자|합니다|해요|할때|할|한|함|됨|되는|되면|됐을|이면|으면|면|은|는|이|가|을|를|에|에서|의|도|만|으로|로|와|과|랑|이랑|까지|부터|보다|처럼|마다|것|거|걸|게|기|간|날|요|죠|지)$/;
function isKnownWord(w0) {
  let w = w0.toLowerCase();
  for (let k = 0; k < 4; k++) {
    if (KNOWN.test(w) || w.length < 2) return true;
    const nw = w.replace(ENDINGS, '');
    if (nw === w) break;
    w = nw;
  }
  return KNOWN.test(w) || w.length < 2 || /(싶어|싶은|볼까|볼래|어때|인가|일까|입니다)$/.test(w0);
}
function leftoverWords(s, mask) {
  const out = [];
  const re = /[가-힣A-Za-z]{2,}/g;
  let m;
  while ((m = re.exec(s))) {
    // 앞쪽(어간)이 이미 해석된 범위(종목 이름 등)면 통과: 'SPY가', '애플을'
    let k = 0; while (k < m[0].length && mask[m.index + k]) k++;
    if (k === m[0].length) continue;
    const rest = m[0].slice(k);
    if (k > 0 && (rest.length <= 2 || isKnownWord(rest))) continue;
    if (isKnownWord(m[0])) continue;
    out.push(m[0]);
  }
  return [...new Set(out)];
}

// '나스닥이랑 코스피200이랑 비교' → 비교 바로 앞에서부터 거꾸로, 지수 이름만으로 된 덩어리를 모음 → {words, start, end}
const IDXW = '(코스피\\s*200|코스피|코스닥\\s*150|코스닥|S&P\\s*500|에스앤피|나스닥\\s*100|나스닥|다우|SPY|QQQ|KODEX\\s*200|VT|전세계)';
function comparisonTargets(s) {
  const m = s.match(/([^,.?!]{0,40}?)(?:와|과|랑|이랑|하고)?\s*(?:대비|비교|보다)/);
  if (!m) return { words: [], start: -1, end: -1 };
  const seg = m[1], segStart = m.index;
  const toks = seg.split(/\s*(?:이랑|랑|와|과|하고|및|그리고|,)\s+|\s*(?:이랑|랑|하고)\s*$/).map((x) => x.trim()).filter(Boolean);
  const words = [];
  let firstPos = -1;
  for (let i = toks.length - 1; i >= 0; i--) {
    const t = toks[i].replace(/(이랑|랑|와|과|하고)$/, '').trim();
    if (new RegExp(`^${IDXW}$`, 'i').test(t)) { words.unshift(t.toLowerCase()); firstPos = seg.lastIndexOf(t); continue; }
    if (i === toks.length - 1) { const m2 = t.match(new RegExp(`\\s${IDXW}$`, 'i')); if (m2) { words.unshift(m2[1].toLowerCase()); firstPos = seg.lastIndexOf(m2[1]); } }
    break;
  }
  return { words, start: firstPos >= 0 ? segStart + firstPos : -1, end: segStart + m[0].length };
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

  // '…랑 비교' 꼬리의 지수 이름은 담을 종목이 아니라 비교 대상
  const cmpT = comparisonTargets(s);
  if (cmpT.words.length && cmpT.start >= 0) {
    const inTail = (a) => a.idx >= cmpT.start && a.idx < cmpT.end;
    const rest = assets.filter((a) => !inTail(a)).length + generic.length + presetItems.length;
    const rankWords = /(시총|시가총액|대장주|모멘텀|많이\s*오른|수익률\s*(상위|높은|좋은)|상승률\s*상위|변동성\s*(낮은|작은|하위)|저변동)/.test(s);
    if (rest || rankWords) { for (let i = assets.length - 1; i >= 0; i--) if (inTail(assets[i])) assets.splice(i, 1); }
    else cmpT.words = []; // 'SPY랑 QQQ 비교'처럼 비교 대상뿐이면 둘을 포트폴리오로
  }
  // 타이밍 문구 안의 종목(신호 대상·피신처)은 담을 종목에서 뺌: 'SPY가 15% 빠지면', '단기채보다 낮으면 국채로'
  const tmPre = parseTiming(s, false);
  if (tmPre) {
    const DEFW = /^(단기채|국채|장기채|미국채|채권|현금|초단기채|미국 장기채)$/;
    const sigIdx = [];
    for (let i = assets.length - 1; i >= 0; i--) {
      const a = assets[i];
      const after = s.slice(a.idx + a.len, a.idx + a.len + 14);
      if (DEFW.test(a.text)) { assets.splice(i, 1); continue; }
      const isSig = /^\s*(?:가|이|의)(?=\s)/.test(after) || /^\s*(?:가|이|의)?\s*(?:고점|rsi|vix|이동\s*평균|\d+\s*(?:일|개월)\s*(?:이동)?\s*(?:평균)?\s*선|\d+\s*(?:개월|달)\s*수익률|수익률|데드|골든)/i.test(after);
      if (isSig) sigIdx.push(i);
    }
    const hasRankWord = /(시총|시가총액|모멘텀|수익률\s*(상위|높은)|변동성\s*(낮은|하위)|성장률|이익률)/.test(s);
    // '…면 현금(으로)', '채권으로 피신' 같은 일반어는 담을 자산이 아니라 피신처
    for (let i = generic.length - 1; i >= 0; i--) { const g = generic[i]; const before = s.slice(Math.max(0, g.idx - 4), g.idx), after = s.slice(g.idx + g.len, g.idx + g.len + 6); if (['현금', '채권'].includes(g.word) && (/면\s*$/.test(before) || /^\s*(으로|로|에)/.test(after))) generic.splice(i, 1); }
    if (sigIdx.length && (assets.length > sigIdx.length || hasRankWord)) for (const i of sigIdx) assets.splice(i, 1);
  }
  // ---- 순위 전략 감지
  // 실적 지표: '매출 성장률 상위', 'EPS 성장률(QoQ)', '영업이익률 20% 이상' 등
  const fundHits = [];
  for (const [re, key] of FUND_WORDS) {
    const g = new RegExp(re.source, 'gi');
    let mm;
    while ((mm = g.exec(s))) {
      if (fundHits.some((h) => mm.index >= h.idx && mm.index < h.idx + h.len)) continue;
      const tail = s.slice(mm.index + mm[0].length, mm.index + mm[0].length + 24);
      const per = ['opm', 'npm'].includes(key) ? '' : /^[^,.]{0,10}?(qoq|전\s*분기|직전\s*분기|분기\s*대비)/i.test(tail) ? '_qoq' : '_yoy';
      const th = tail.match(/^\s*(?:\([^)]*\)\s*)?(?:(?:yoy|qoq)\s*)?(?:이|가|은|는)?\s*(\d+(?:\.\d+)?)\s*%\s*(?:이상|넘는|넘은|초과|보다\s*높)/i);
      fundHits.push({ idx: mm.index, len: mm[0].length, key: key + per, min: th ? +th[1] : null });
    }
  }
  // 팩터(논문 기준): 복합 → 개별 순으로 먼저 본다
  const factorMetric = /(가치|밸류)\s*[+＋와과·&]?\s*(모멘텀)/.test(s) ? 'x:vm'
    : /(가치|밸류)\s*[+＋와과·&]?\s*(수익성|퀄리티|이익률)/.test(s) ? 'x:vq'
      : /((네|4)\s*(개\s*)?팩터|멀티\s*팩터|복합\s*팩터)/.test(s) ? 'x:multi4'
        : /(위험\s*조정\s*모멘텀|S&P\s*모멘텀)/i.test(s) ? 'x:rmom'
          : /52\s*주\s*(고점|최고)/.test(s) ? 'x:hi52'
            : /(단기\s*반전|지난\s*달\s*덜\s*오른)/.test(s) ? 'x:rev1'
              : /(저\s*베타|낮은\s*베타|베타\s*(가\s*)?(낮은|작은))/.test(s) ? 'x:lowbeta'
                : /(고\s*베타|높은\s*베타|베타\s*(가\s*)?(높은|큰))/.test(s) ? 'x:highbeta'
                  : /(이익\s*수익률|E\/P|저\s*PER|PER\s*(이\s*)?(낮은|싼))/i.test(s) ? 'x:ep'
                    : /(매출\s*수익률|S\/P|저\s*PSR|PSR\s*(이\s*)?(낮은|싼))/i.test(s) ? 'x:sp' : null;
  const priceMetric = factorMetric || (/(시총|시가총액|대장주|덩치)/.test(s) ? 'mcap'
    : /(모멘텀|많이\s*오른|수익률\s*(상위|높은|좋은)|상승률\s*상위|12-1)/.test(s) ? 'mom'
      : /(변동성\s*(낮은|작은|하위)|저변동|덜\s*흔들|안정적인)/.test(s) ? 'lowvol' : null);
  const fundFilter = fundHits.find((h) => h.min != null) || null;
  const fundRank = fundHits.find((h) => h.min == null) || (!priceMetric ? fundFilter : null);
  const rankMetric = priceMetric || (fundRank ? `f:${fundRank.key}` : null);
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
    if (fundFilter) { P.rank.ff = { key: fundFilter.key, min: fundFilter.min }; said.add('rank'); }
    P.rank.group = (mKR && !mUS) ? (mETF ? 'KR_ETF' : 'KR_STOCK') : (mETF ? 'US_ETF' : 'US_STOCK');
    if (!mKR && !mUS) defaulted.push('market');
    if (rankN) { P.rank.from = rankN[0]; P.rank.top = rankN[1]; } else { P.rank.from = 1; P.rank.top = 5; defaulted.push('topN'); }
    if (/(시총\s*(비중|가중)|시가총액\s*(비중|가중))/.test(s)) P.rank.weighting = 'mcap';
    else if (/역변동성/.test(s)) P.rank.weighting = 'invvol';
    else if (/매출\s*(비례|가중)/.test(s)) P.rank.weighting = 'rev';
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
    // 제외 분류(레버리지·인버스 등)
    const exCats = findExcludeCats(s);
    if (exCats.length) { P.rank.excludeCats = exCats; said.add('exclude'); }
    // 제외 종목
    for (const a of assets) {
      const after = s.slice(a.idx + a.len, a.idx + a.len + 6);
      if (/^\s*(?:etf|ETF)?\s*(은|는|을|를|도)?\s*(빼고|제외|말고)/.test(after)) { if (!(P.rank.excludeCats || []).length || !/레버리지|인버스/.test(a.text)) P.rank.exclude.push(a.key); }
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

  // ---- 매수·매도 타이밍 / 조건부 리밸런싱
  const pf0 = st.portfolios[0];
  const tmKR = pf0?.kind === 'rank' ? pf0.rank.group.startsWith('KR') : pf0?.assets?.length ? pf0.assets.every((a) => getUniverse()?.byKey.get(a.key)?.m === 'KR') : (mKR && !mUS);
  const tmg = parseTiming(s, tmKR);
  if (tmg) {
    const note = tmg.note; delete tmg.note;
    st.portfolios.forEach((p) => { p.timing = structuredClone(tmg); if (tmg.kind === 'trigger' && !/(매달|매월|분기|매년|반기)/.test(s)) p.rebalance = p.kind === 'rank' ? p.rebalance : 'none'; });
    said.add('timing');
    if (note) warnings.push(note);
    if ([tmg.sell, tmg.buy, tmg.rule].some((r) => r?.type === 'vix') && !getUniverse()?.byKey.get('IDX_VIX')) warnings.push('VIX 데이터는 다음 자동 갱신 때 들어와요. 그 전에는 VIX 조건이 동작하지 않아요.');
  }

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
  const cmpWords = cmpT.words;
  if (cmpWords.length) {
    const toKey = (w) => (/코스피|kodex/.test(w) ? '069500' : /코스닥/.test(w) ? '229200' : /나스닥|qqq/.test(w) ? 'QQQ' : /다우/.test(w) ? 'DIA' : /vt|전세계/.test(w) ? 'VT' : 'SPY');
    st.benchmarks = [...new Set(cmpWords.map(toKey))].slice(0, 6);
    st.benchmark = st.benchmarks[0];
    said.add('benchmark');
    // 벤치마크로 쓴 이름이 포트폴리오 자산으로 잘못 들어갔으면 제거
    st.portfolios.forEach((p) => { if (p.kind === 'static' && p.assets.length > 1) p.assets = p.assets.filter((a) => !st.benchmarks.includes(a.key) || a.w); });
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
  // 반영하지 못했을 수 있는 말
  for (const a of assets) markRange(a.idx, a.len);
  ignored.push(...leftoverWords(s, mask));
  if (empty) warnings.push('담을 종목이나 고르는 규칙을 찾지 못했어요. 예: "QQQ 60 SCHD 40" 또는 "미국 시총 상위 3개".');
  // 고치는 문장(종목 없음 + 이전 상태 있음): 리밸런싱·기간·금액 등만 덮어쓰기
  if (prev && empty && (said.size > 0)) {
    const merged = structuredClone(prev);
    if (said.has('rebalance')) merged.portfolios.forEach((p) => { p.rebalance = st.portfolios[0].rebalance; p.band = st.portfolios[0].band; });
    if (said.has('period')) merged.period = st.period;
    if (said.has('initial')) { merged.initial = st.initial; merged.currency = st.currency; }
    if (said.has('flow')) merged.flow = st.flow;
    if (said.has('benchmark')) { merged.benchmark = st.benchmark; merged.benchmarks = st.benchmarks?.length ? st.benchmarks : (st.benchmark ? [st.benchmark] : []); }
    if (said.has('reinvest')) merged.reinvest = st.reinvest;
    if (said.has('fee')) merged.feeBp = st.feeBp;
    if (said.has('timing')) merged.portfolios.forEach((p) => { p.timing = structuredClone(st.portfolios[0].timing); });
    return { state: merged, report: { patch: true, said: [...said], defaulted: [], warnings: warnings.filter((w) => !w.startsWith('담을')), ignored } };
  }
  if (!st.benchmarks?.length) st.benchmarks = st.benchmark ? [st.benchmark] : [];
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
