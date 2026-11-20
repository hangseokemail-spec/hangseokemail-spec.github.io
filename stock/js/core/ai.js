// (선택) Claude API — 사용자가 설정에 자기 키를 넣었을 때만. 키는 이 브라우저 localStorage에만 저장.
import { settings } from '../ui/dom.js';
import { searchAssets, getUniverse } from './data.js';
import { defaultBtState, newPortfolio } from './nlp.js';

export function hasKey() { return !!settings().apiKey; }

async function call({ system, content, maxTokens = 1500 }) {
  const s = settings();
  if (!s.apiKey) throw new Error('API 키가 없어요');
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': s.apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model: s.model || 'claude-sonnet-5-5', max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
  });
  if (!r.ok) {
    const t = await r.text().catch(() => '');
    if (r.status === 401) throw new Error('API 키가 맞지 않아요');
    throw new Error(`API 오류 ${r.status} ${t.slice(0, 120)}`);
  }
  const j = await r.json();
  return (j.content || []).map((c) => c.text || '').join('');
}
function extractJson(text) {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, text];
  const s = m[1];
  const i = s.indexOf('{'), k = s.lastIndexOf('}');
  return JSON.parse(s.slice(i, k + 1));
}
function resolveKey(x) {
  if (!x) return null;
  const U = getUniverse();
  const up = String(x).toUpperCase().replace(/\.(KS|KQ)$/, '');
  if (U.byKey.has(up)) return up;
  return searchAssets(String(x), 1)[0]?.k || null;
}

/** 자연어 → 백테스트 상태 */
export async function aiParse(text) {
  const system = `너는 한국어 백테스트 조건을 JSON으로 바꾸는 해석기다. 반드시 JSON 하나만 출력한다.
스키마: {"portfolios":[{"name":string,"kind":"static"|"rank","assets":[{"key":"미국 티커 또는 국내 6자리 코드","w":비중%}],"rank":{"group":"US_STOCK"|"KR_STOCK"|"US_ETF"|"KR_ETF","metric":"mcap"|"mom"|"lowvol","from":1,"top":N,"lookback":개월,"skip":개월,"weighting":"equal"|"mcap"|"invvol","maxW":null|%,"exclude":[]},"rebalance":"none"|"M"|"Q"|"S"|"A"|"band","band":{"abs":%p,"rel":%,"cap":%}}],
"period":{"preset":"Ny"|"Nm"|"max"|null,"start":"YYYY-MM"|null,"end":"YYYY-MM"|null},"currency":"KRW"|"USD","initial":숫자,"flow":{"type":"none"|"contribute"|"withdraw"|"withdrawPct","amount":숫자,"pct":숫자,"freq":"M"|"Q"|"A","growth":%},"reinvest":true|false,"feeBp":숫자,"benchmark":"SPY"|"QQQ"|"069500"|티커|null,
"said":[사용자가 직접 말한 항목: "period","assets","rank","rebalance","initial","currency","flow","benchmark"],"defaulted":[기본값으로 채운 항목],"warnings":[못 하는 요청이 있으면 한국어로 짧게]}
규칙: 최대 3개 포트폴리오. 비중 합은 100. 순위 전략의 리밸런싱은 M/Q/S/A만. 기간을 말하지 않으면 {"preset":"10y"}. 시작 금액을 말하지 않으면 원화 10000000 또는 달러 10000. 벤치마크는 미국 자산 위주면 SPY, 국내 위주면 069500.`;
  const out = extractJson(await call({ system, content: text }));
  const st = { ...defaultBtState(), ...out };
  st.portfolios = (out.portfolios || []).slice(0, 3).map((p, i) => {
    const base = newPortfolio(p.name || `포트폴리오 ${i + 1}`);
    const assets = (p.assets || []).map((a) => ({ key: resolveKey(a.key), w: +a.w || 0 })).filter((a) => a.key);
    return { ...base, ...p, assets, rank: { ...base.rank, ...(p.rank || {}) }, band: { ...base.band, ...(p.band || {}) } };
  });
  if (!st.portfolios.length) st.portfolios = [newPortfolio('포트폴리오 1')];
  st.benchmark = out.benchmark ? resolveKey(out.benchmark) : null;
  st.meta = { said: out.said || [], defaulted: out.defaulted || [], ai: true };
  const empty = !st.portfolios.some((p) => p.kind === 'rank' || p.assets.length);
  return { state: st, report: { said: st.meta.said, defaulted: st.meta.defaulted, warnings: out.warnings || [], empty, ai: true } };
}

/** 계좌 캡처 이미지(여러 장) → 보유 종목 목록 */
export async function aiReadHoldings(images) {
  const system = `너는 한국 증권사·자산관리 앱의 계좌 캡처에서 보유 종목 표를 읽는다. JSON 하나만 출력한다.
스키마: {"account":{"broker":문자열|null,"name":문자열|null,"currency":"KRW"|"USD"|null},"total":화면의 총자산 숫자|null,"holdings":[{"name":"화면에 보이는 종목명","ticker":"보이면 티커/코드, 아니면 null","quantity":숫자|null,"avgPrice":숫자|null,"price":숫자|null,"value":평가금액 숫자|null,"weightPct":비중%|null,"currency":"KRW"|"USD"|null,"returnPct":수익률%|null,"confidence":0~1}],"cash":[{"currency":"KRW"|"USD","amount":숫자}]}
규칙: 숫자는 쉼표·단위 없이(₩·$ 빼고). 수량이 안 보이고 비중(%)만 보이면 weightPct만 채운다. "KRW"·"현금"·"예수금" 행은 holdings가 아니라 cash로. 계좌번호·이름 같은 개인정보는 출력하지 않는다. 확실하지 않은 값은 null로 두고 confidence를 낮춘다. 여러 장이면 같은 계좌의 이어진 화면으로 보고 중복 행은 한 번만.`;
  const content = [...images.map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.type, data: im.data } })), { type: 'text', text: '보유 종목을 읽어 줘.' }];
  return extractJson(await call({ system, content, maxTokens: 3000 }));
}
