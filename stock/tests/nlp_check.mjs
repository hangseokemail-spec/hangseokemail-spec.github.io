import './node-loader.mjs';
import { parseCommand } from '../js/core/nlp.js';
const S = [
 '최근 3년간 시총 1~3등 주식들로만 1개월에 한번씩 매달 말일에 리밸런싱 했을 때 백테스트 결과는?',
 '애플 40 마소 30 나머지 채권, 2015년부터 분기마다 리밸런싱, S&P500 대비',
 'QQQ 60 SCHD 40이랑 SPY 비교해줘, 최근 10년',
 '삼성전자 하이닉스 반반, 2018년부터 2024년까지, 리밸런싱 안 하고',
 '국내 시총 상위 5개 똑같이, 매년 1월에 리밸런싱, 코스피 대비, 1억으로 10년',
 '미국 대형주 중 12개월 모멘텀 상위 5개 매달 교체, 2010년부터',
 '변동성 낮은 미국 주식 10개 분기마다, 최근 5년, 원화 기준',
 'KODEX 미국반도체 25 KODEX 미국나스닥100 25 TIGER 미국배당다우존스 25 TIME 글로벌AI인공지능액티브 25, ±3% 벗어나면 리밸런싱',
 '매달 50만원씩 VOO 적립, 2012년부터 원화로',
 '10억으로 시작해서 매년 4%씩 인출, 주식 60 채권 40, 2000년부터',
 '엔비디아 빼고 미국 시총 상위 5개, 최근 7년, 시총 비중대로, 한 종목 최대 25%',
 'TSM 20 NVDA 15 LLY 20 CRWD 15 MU 15 BE 15, 밴드 5%, 배당 재투자 안 함, 2021년 1월부터',
 '코로나 이후 나스닥100 vs 코스피200, 1000만원',
 '작년 한 해 TIGER 미국배당다우존스랑 SCHD 비교',
 '시총 1등만 계속 사면? 2000년부터 매년 바꿔서',
 'QQQ 70 TLT 30, 5억으로 매달 200만원씩 빼 쓰면, 2015년부터 반기 리밸런싱',
 '삼성전자 매달 1일에 30만원씩, 2010년부터',
 '2015년 3월부터 2020년 12월까지 SPY 50 QQQ 50이랑 올웨더 비교',
];
for (const t of S) {
  const { state: st, report: r } = parseCommand(t);
  const pf = st.portfolios.map(p => p.kind === 'rank' ? `RANK(${p.rank.group},${p.rank.metric},${p.rank.from}-${p.rank.top},${p.rank.weighting}${p.rank.maxW?',max'+p.rank.maxW:''}${p.rank.exclude.length?',ex'+p.rank.exclude:''}${p.rank.metric==='mom'?',lb'+p.rank.lookback:''}) reb=${p.rebalance}` : `[${p.assets.map(a=>a.key+':'+a.w).join(' ')}] reb=${p.rebalance}${p.rebalance==='band'?JSON.stringify(p.band):''}${p.rebMonth?'@'+p.rebMonth:''}`).join(' || ');
  console.log('\n> '+t+'\n  '+pf+`\n  period=${JSON.stringify(st.period)} cur=${st.currency} init=${st.initial} flow=${JSON.stringify(st.flow)} bm=${st.benchmark} reinvest=${st.reinvest}\n  said=${r.said} def=${r.defaulted} warn=${r.warnings}`);
}
