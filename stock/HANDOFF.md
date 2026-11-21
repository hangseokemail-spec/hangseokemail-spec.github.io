# Seok's Stock 세부 지침서 (작업 인수인계)

기준: 2026-11-21 21:30 KST · 팩터 20개(논문 기준)·전략 찾기 회전율 목표·대안 비교 칸, 실적 DB 13열(재무상태표·현금흐름), 국내 실적 수집 진행 중
이 문서가 **자세한 규칙의 원본**이다(계산·보안·디자인·데이터·테스트). 다음 채팅에서는 프로젝트 문서 `claude/seoks-stock-인수인계서.md`(마지막 세션 요약·진행 중인 일)와 `claude/seoks-stock-세부지침서.md`(시작 순서·요약·비공개 링크)를 먼저 읽고, 자세한 것은 여기서 찾는다.

---

## 0. 새 채팅에서 시작하는 순서

1. **문서를 읽는다.**
   - 프로젝트 문서 `claude/seoks-stock-인수인계서.md`: 마지막 세션에 한 일, 진행 중인 일, 처음 확인할 것
   - 프로젝트 문서 `claude/seoks-stock-세부지침서.md`: 시작 순서·지금 상태 요약·보안 규칙·링크와 계정(비공개)
   - 저장소 `stock/HANDOFF.md`(이 문서): 자세한 규칙 전부. 공개 저장소라 링크·계정은 뺐다
2. **저장소를 붙인다.**
   - `add_repo(owner="hangseokemail-spec", repo="hangseokemail-spec.github.io", access="push")`
   - 안내된 명령으로 `/home/claude/hangseokemail-spec.github.io`에 클론한 뒤 `register_repo_root`
   - 이 저장소는 '석스 가판대' 전체 사이트이고, 이 앱은 `stock/` 폴더뿐이다. 다른 폴더는 요청 없이 건드리지 않는다. 가판대 '시장·투자' 탭에 이 앱 카드가 있다.
3. **상태를 확인한다**(1분).
   ```
   cd stock
   node tests/run.mjs          # 통과 96 / 실패 0
   node tests/timing_check.mjs # 통과 20 / 실패 0
   node tests/goal_check.mjs   # 통과 52 / 실패 0
   node tests/mc_check.mjs     # 통과 10 / 실패 0
   node tests/fund_check.mjs   # 통과 19 / 실패 0
   node tests/finder_check.mjs # 추천 규칙 목록이 출력되면 정상
   ```
4. **로컬로 띄운다.** 저장소 루트에서 `python3 -m http.server 8765`를 실행하고 `http://localhost:8765/stock/`을 연다. 화면 확인은 9절의 Playwright 스크립트를 쓴다.
5. **커밋하고 배포한다.**
   - 커밋 전에 항상 `git pull --rebase origin main`. 시세 봇이 하루에 여러 번 커밋한다.
   - 메시지는 `stock: <한국어 요약>` 형식이고, 끝에 그 세션의 attribution 줄을 붙인다.
   - `git push`하면 GitHub Pages가 1~2분 안에 반영한다. 라이브 주소에서 강력 새로고침으로 확인한다. 시세는 IndexedDB 캐시라서 `meta.updated`가 바뀌어야 다시 받는다.

새 채팅 첫 메시지 예시:
> Seok's Stock 이어서 하자. 프로젝트의 세부지침서를 읽고 저장소를 붙인 다음, (할 일).

---

## 1. 지금 상태

### 1-1. 끝난 것 (라이브 반영됨)

**탭과 로그인**
- 탭은 6개: 내 자산 / 백테스트 / 전략 찾기 / 목표 / 노후 / 리포트(주소 `#assets #backtest #finder #goal #plan #report`, 노후 탭은 예전 주소 `#plan` 그대로). 주소가 없으면 백테스트로 연다.
- 내 자산·목표·노후·리포트는 로그인해야 열린다. 로그인하면 원래 가려던 탭으로 간다.
- 로그인·가입(아이디·이메일·비밀번호), 계정별 암호화 저장, 마스터 계정 1개

**백테스트**
- 포트폴리오 P1~P3 나란히 비교. 포트폴리오가 둘 이상이면 문장 해석은 **편집 중인 탭에만** 들어가고, 다른 포트폴리오와 전역 조건(기간·금액·통화·적립·비용·비교 대상)은 문장에서 말한 것만 바뀐다(`mergeIntoActive`). 포트폴리오가 하나일 때는 예전처럼 통째로 바꾸고, '앞의 것도 남겨서 같이 비교' 버튼을 띄운다.
- 비교 창('무엇과 비교할까요?') 맨 위 '내 포트폴리오': P1·P2·P3를 켜고 끈다(`pf.off`, 꺼진 것은 계산·문장에서 빠지고 탭이 점선). 하나는 꼭 남는다. '+ 새 포트폴리오 만들어 비교'로 탭을 만든다.
- 비교 대상 최대 6개, 최근 실행 10개
- 매수·매도 타이밍 프리셋 11개와 직접 설정, 조건부 리밸런싱
- 진단과 대안: 위는 진단 카드(문제만 짧게, 고갈이면 버티는 인출액). 아래는 **목표별 대안 4가지**(샤프 높이기 · 변동성 낮추기 · 최대 낙폭 줄이기 · 수익률 높이기, 넓은 화면 한 줄). `comment.js` altCandidates가 지금 전략에서 한 가지씩 바꾼 후보(리밸런싱 주기·밴드, 같은 비중·변동성 반비례·25% 상한, 채권·금·최소변동성·배당·지수 ETF 20/40% 섞기, 지수가 6·10·12개월선 아래면 쉬기(TM_MONTHS, 고른 길이에는 '이 기간에 가장 잘 맞은 길이' 안내) / 순위 전략은 종목 수·비중 방식·주기·순위 기준·ETF 혼합 근사)를 같은 기간으로 계산하고 findAlternatives가 목표마다 가장 나은 것을 겹치지 않게 고른다. 낮추기 대안은 수익률이 지금의 75% 이상, 수익률 대안은 낙폭 5%p·변동성 25% 이내인 것 중에서(없으면 조건을 풀고 '양보한 안' 표시). 카드마다 [그래프에 표시](위 성장 그래프에 점선으로 겹침, 다시 누르거나 범례를 누르면 뺌) · [이 대안으로 비교].
- **팩터(논문에서 시장을 이긴 기준) 20개**(`core/factors.js` FACTORS, 순위 기준 `metric: 'x:…'`): 가격 — 모멘텀 12-1(`x:mom121`), 위험 조정 모멘텀(`x:rmom`, S&P 방식), 52주 고점 근접(`x:hi52`), 단기 반전(`x:rev1`), 낮은/높은 베타(`x:lowbeta`/`x:highbeta`, 36개월·같은 표 시총 가중 시장) / 실적 — 이익수익률 E/P(`x:ep`), 매출수익률 S/P(`x:sp`), 장부가/시총 B/M(`x:bm`), FCF 수익률(`x:fcfy`), 주주환원 수익률(`x:shy`), GP/A(`x:gpa`), ROE(`x:roe`), 자산성장 낮은 순(`x:ag`), 발생액 낮은 순(`x:acc`) / 복합(후보 안 순위 0~1 평균) — 가치+모멘텀(`x:vm`), 가치+수익성 E/P·영업이익률(`x:vq`), 가치+수익성 B/M·GP/A(`x:bmgpa`), 네 팩터 평균(`x:multi4`), 다섯 팩터 평균(`x:multi5`: B/M·12-1·GP/A·자산성장·저변동). 비중에 **매출 비례**(`weighting: 'rev'`, 최근 4분기 매출, 모르는 종목은 가운데 값). 팩터를 고르면 계산법·근거 논문 한 줄(`.fx-note`). 근거 자료: 드라이브 'Seoks Stock(Backtest)'의 '시장을 이긴 주식 팩터 정리'와 '미국 주식 팩터 연구 및 5년 검증' 폴더(02_factor_catalog.csv).
- **이 대안으로 비교**(2026-11-21 고침): 대안을 새 포트폴리오로 넣고(타이밍·밴드·리밸런싱 달까지 복사 — 예전엔 타이밍이 빠졌음) 다시 계산한 뒤 결과 맨 위 '지금 전략과 대안 비교' 칸(`#altCmp`: 바뀐 점 stratDiff · 지표 5개 차이 · 최근 달 고른 종목 둘 다/지금만/대안만 · [달마다 나란히 보기] · [비교 끝내기])으로 이동. 대안 카드 버튼은 'P2로 비교 중'. 보유 변화에 P1/P2 고르기와 **나란히 비교**(같은 달 두 전략이 고른 종목, 한쪽만 고른 칩 강조, 평균 겹침 비율).
- 조건 칸(2026-11-21): 넓은 화면 3칸(담을 것 | 사고팔 때 + 비교 대상 위아래 | 기간과 돈), 입력칸 36px·묶음 간격 10px, 빼고 고르기는 접기(`details.ex-more`), 아래 설명 글 뺌, 비용 0 칩·배당 재투자·거래비용 한 줄. 순위 전략일 때 높이 868 → 458px.
- 순위 기준·조건에 **실적(펀더멘털)**: 매출·영업이익·순이익·EPS 성장률(전년 같은 분기 대비 YoY / 직전 분기 대비 QoQ), 영업이익률·순이익률(최근 4분기). 미국 주식만(SEC 공시, 2009년~). '실적 조건'(예: 영업이익률 20% 이상)을 넘는 종목 안에서만 고를 수 있다(`rank.ff = {key, min}`). 문장으로도 된다: '영업이익률 20% 이상 미국 주식 중 매출 성장률 상위 10개'. 순위 기준 값은 `metric: 'f:rev_yoy'`처럼 씀.
- 그래프 선 끝 라벨은 오른쪽 여백에 HTML로 펼쳐 놓고 꺾은 선으로 잇는다(`charts.js` bindEndOverlay, 시리즈에 `endText`). 겹치면 3줄 → 2줄 → 1줄로 줄이고, 라벨에 손을 올리면 그 선 강조
- 수익률 ▲▼(색 없이도 방향이 보이게): KPI·범례·연도별·롤링·자산·지표 표(`backtest.js` pa/ppa)
- 보유 변화: '한눈 지도'(종목 × 다시 고른 때/달, 진하기 = 비중, 노란 테두리 = 새로 들어옴, 회색 줄 = 피신처)와 '카드'를 바꿔 봄(holdMap)
- '앞으로(몬테카를로)' 탭: 지난 월수익률을 12개월 묶음으로 섞어 경로 2,000개(씨앗 고정), 10/20/30년, 분위수 띠·확률·표(`core/montecarlo.js`)
- 휴대폰(≤640px): 조건 네 묶음을 한 줄 요약 카드로 접고 누른 것만 펼침. 실행하면 모두 접고 결과로 이동(mobileCards)
- 넓은 화면에서 조건을 가로 4칸으로 배치
- 기간은 1985년부터

**전략 찾기**
- 목표 수익률·최대 낙폭·**연 회전율 한도**(제한 없음/200/100/50/20%)·기간을 넣으면 규칙을 추천한다. 회전율 = 1년 동안 사고판 금액 ÷ 평가액(한쪽 기준). 한도를 넘는 규칙은 '목표 밖', 못 찾으면 '회전율 한도를 넓히면 n개' 칩.
- 후보: 기존 규칙 + 팩터 계열(가치·모멘텀·저베타·주주환원·수익성·투자·회계·복합·매출 가중) × 매달/분기/**매년** × 타이밍 4가지. 미국 약 520개(2초). 실적 팩터는 미국 2010년·국내 2016년 무렵부터라 시험 기간이 그보다 길면 빠진다.
- 순위 규칙 카드 단계(`finder.js` rankSteps): 후보(넣고 빼기) → 점수(계산법·근거) → 담기(몇 %씩) → 다시 고르기(언제 팔고 사나) → [확인·팔기·돌아오기] → **지금 고른다면**(마지막 달 말 기준 종목과 비중, simulateMonthly의 nowPicks) → 거래 양(연 회전율 해석). 숫자 줄에 연 회전율.
- 추천 카드는 **행동 규칙**으로 보여 준다: 평소 / 다시 고르기·비중 맞추기 / 확인(월말 종가, 다음 거래일 거래) / 팔기 / 돌아오기 + "지난 N년 피신 몇 번·몇 개월 · YYYY.MM 말 기준 투자하는 때/피신해 있을 때"(`finder.js` candRule, simulateMonthly의 nOut·outMonths·nowIn). 표·툴팁 제목(candSentence)에도 돌아오는 조건이 들어간다.

**목표 탭** (2026-11-21 분리, `views/goal.js` + `views/goalcards.js`, 상태 `ss.goal`)
- 흐름: ① 목표 금액 정하기(돈의 가치 저울) ② 어떻게 모을까(실행 목표 조건) → 그 아래 답 카드 → ③ 돈이 모이는 모습(그래프·짚어 볼 때 4칸) → ④ 노후 탭에서 이어 가기
- 태블릿 이상(768px~)은 ①저울과 ②조건이 한 줄, 답("매달 ○○원 넣으면 돼요")은 바로 아래 전체 폭(조건은 위, 답은 아래). ②는 container query로 칸 4열/2열.
- 저울: 금액 칸은 숫자(쉼표), 이름표 괄호에 한글 읽기 '오늘 돈 (3억원)', '20년 뒤 통장 숫자 (약 4억 9,158만원)'(넣는 쪽은 정확히, 계산된 쪽은 두 단위). 연도 대신 'N년 뒤'. '저울로 보기 / 숫자로 넣기' 보기 전환(goal.view).
- 목표는 늘 오른쪽 접시(N년 뒤 통장 숫자): 연결돼 있으면(`calc.link='scale'`) 오른쪽 접시에 '목표' 깃발, 아래 상자 "목표 = 20년 뒤 통장에 찍힐 …", ②의 목표 칸에 '저울과 연결'. ②의 목표를 직접 고치면 연결이 풀리고, 저울 아래에 [N년 뒤 통장 숫자 …을 목표로 ▶]가 나온다. 연결돼 있으면 ②의 기간과 저울 기간은 같은 값(서로 따라감).
- 다른 길(부담을 줄이는 길): 기간·수익률·금액을 칸에 직접 써서 바로 다시 계산. 버튼 두 개: [그래프에 비교](위 조건은 그대로, 아래 '모이는 모습'에 기본과 이 경우를 같은 그래프로 — 여러 개 켜고 끌 수 있고, 오른쪽에 경우마다 넣은 돈 비교) / [목표 설정 변경](위 조건과 ④ 노후로 넘길 값을 바꿈, 되돌리기). 계산은 whatIf·scen(저울 연결이면 기간이 바뀔 때 목표도 물가만큼 커짐).
- 계산 `core/goalcalc.js`: scalePair, goalInputs, goalSummary(노후 탭 기본값), solve. 테스트 `tests/goal_check.mjs`(52개).

**노후 탭** (2026-11-21 개편, `views/plan.js`, 제목 '풍족한 노후를 위해')
- 목표 띠: 목표 탭의 goalSummary(N년 뒤 목표·오늘 돈·처음·매달·수익률·물가). [목표 값 다시 넣기] [목표 바꾸기]
- 입력은 가로 네 묶음: 1 나이(3칸 한 줄) · 2 은퇴 전 모으기 · 3 은퇴 후 쓰기 · 4 연금. '더 넣기'에 적립 증가·적립 멈춤·남길 돈.
- 목표에서 따라오는 칸 `plan.link = {retireAge, initial, monthly, rate, inflation}`: 연결이면 '목표' 꼬리표, 고치면 그 칸만 직접 입력('목표 ○○' 링크로 되돌림). 은퇴 나이 = 지금 나이 + 목표 기간. 목표 탭 [노후 탭에서 이어 가기]는 `ss.useGoal`로 모두 다시 연결.
- 결과: 금액(부족 −빨강/여유 +초록) 옆에 도장 '은퇴 때 부족!' / '여유로운 은퇴!'(상태가 바뀔 때만 쾅 애니메이션) → 문장(핵심 숫자 좋음 초록·나쁨 빨강) → 그래프(기대 수명까지, 바닥난 뒤 '돈이 없는 N년' 빨간 구간, 목표·필요한 돈 점선) → 요약 4칸 → '이렇게 바꾸면?'(한 번 누르면 점선, 한 번 더 누르면 계획에 넣기).
- 목표 < 필요한 돈이면 "목표를 정할 때보다 은퇴 뒤 쓸 돈이 더 커서 그래요" + [필요한 돈 …을 목표로 →](목표 탭 저울 오른쪽에 넣고 이동).
- 아래 카드(질문형 제목 + 한 줄 설명): 목돈 | 구간별 수익률 / 한 달에 얼마 쓸 수 있나(표 | 거꾸로) / 계획대로 가고 있나(얇은 띠) / 나이별 표.
- 최근 기록: 계획마다 5개, 좁고 통통한 칩(시간 / 여유·부족 금액 / 은퇴 나이·월 적립).
- 계획대로 가고 있나요: 큰 도장(앞서가요! / 계획대로! / 조금 분발! / 더 분발해요! / 아직 기록 없음) + 작은 도장 셋(금액 = 계획의 %, 불어나는 속도 = 실제 vs 계획 연증가율, 최근 흐름 = 마지막 두 기록). 모자라면 '은퇴까지 매달 X 더 모으면 따라잡아요'와 [지금 자산에서 계획 다시 세우기](trackVerdict). 사실 칸: 지금 실제 자산 / 계획대로라면 지금 있어야 할 돈 / 계획 대비 달성률 / 실제로 불어난 속도.
- '몇 살에 얼마가 있을까?' 카드: 오늘 돈과 그해 통장 숫자 설명 + 은퇴 때 막대 그림(빗금 = 물가가 가져간 몫), 표는 나이 | 오늘 돈 | 그해 통장 숫자 | 물가가 가져간 몫. 그래프 '모든 금액은 그해 통장 숫자' 옆 '?'에도 같은 설명(moneyExplainHtml).
- 거꾸로(원하는 생활비) 두 칸은 이름 한 줄·높이 44px·읽기 줄 20px로 맞춤.
- 예전 데이터: '목표 모드' 계획은 은퇴 나이 = 나이 + 목표 기간인 노후 계획으로 바뀌고, 예전 저울·실행 목표 값은 처음 열 때 `ss.goal`로 옮김(loadGoal).

**리포트 탭** (2026-11-21, `views/report.js`, 제목 '자산 목표 리포트')
- 한 장 요약: 결론 도장(여유로운 은퇴! / 조금만 더! / 이대로면 부족해요) + 한 줄 + 필요한 돈 채운 막대 → ① 지금 가진 돈(내 자산 총액) ② 목표 ③ 모으는 방법(목표 달성 가능 도장) ④ 노후 결과 → 목표를 채우려면(이 중 하나만: 매달·수익률·은퇴 나이·생활비) → 계획대로 가고 있나요 + 시험해 본 투자 방법(최근 백테스트 CAGR과 필요한 수익률 비교).
- 계산은 `plan.js` reportData()(노후 탭을 안 열어도 목표 값에 맞춰 계산)와 goal.js requestAssetsTotal. 탭을 열 때마다 다시 그림.

**내 자산** (2026-11-21 정리)
- 맨 위 칩: 모아보기 · (사람 전체) · 계좌별 · + 계좌. 휴대폰(≤760px)에서는 칩 줄이 한 줄을 다 쓰고 원화/달러·숨기기·캡처·종목 추가는 아랫줄(예전엔 칩이 잘려 '모이…'처럼 보였음). 계좌를 고르면 그 계좌의 구성 도넛·배당(연·배당률·월별 막대·달력).
- 모아보기 '계좌별 한눈에' 카드: 평가액·비중·수익률·연 배당.
- 총액: 원화 환산·달러 환산 나란히, 원화 자산/달러 자산 막대. 수익률은 평균단가를 아는 종목만(`valuate` plPct·plCoverage). [지금 환율로 다시 계산] = 시세 DB 다시 받기 + open.er-api 중 최신 날짜(`refreshFx`, 무료 환율은 하루 단위).
- 계좌는 별칭 중심(증권사 칸 없앰, 별칭으로 종류 짐작). 캡처 확인·종목 추가 창 안에서 바로 새 계좌. 캡처에 다른 계좌 이름이 보이면 새 계좌가 기본(덮어쓰기 사고 방지), 현금은 캡처에 보인 통화만 교체, 수익률만 보이면 평균단가 역산(≈).

**화면 전반**
- 모든 탭 금액 옆에 한글 읽기(원·달러)
- 디자인은 Opus 디자이너 안을 Fable이 컨펌해 반영했다. 딤 다크 기본과 새 색 토큰.
- 속도: 목표·노후 계산 11초 → 0.04초, 시세 IndexedDB 캐시와 미리 받기

**문장 해석**
- 제외어("레버리지 빼고"), 타이밍 문장, '…랑 비교' 꼬리를 알아듣는다.
- 못 알아들은 말이 있으면 Claude API 키가 있을 때 자동으로 Claude에 넘긴다.

### 1-2. 대기 중 — 사용자 차례

#### ① 계정 저장소 — 연결 끝 (2026-11-21 11:05)

이제 어느 기기에서든 같은 계정·데이터를 쓴다. 웹 앱 주소는 `stock/config/backend.json`에 있고 라이브에도 반영됐다.

**확인한 것**
- GET → "계정 저장소가 동작 중이에요 ✓", POST ping → `{"ok":true,"app":"seoks-stock"}`. 이번 컨테이너에서는 셸 curl이 script.google.com에 닿았다(WebFetch는 승인 대기에 걸릴 수 있으니 curl·Playwright로 확인).
- Playwright 컨텍스트 두 개: A에서 가입하고 매달 적립 2,345,000 입력 → B(처음 보는 브라우저)에서 같은 계정으로 로그인 → 값과 '최근 기록'이 그대로 보였다.

**사용자 차례로 남은 것**
- 시험 계정 `sstestbf3c81` 지우기: 드라이브 'Seok's Stock 계정' 시트의 그 줄, 'Seok's Stock 개인 데이터(암호화)' 폴더의 `vault_66df75282e4fff9d.json`
- 마스터 계정은 연결 뒤 처음 로그인할 때 원격에 자동 등록된다(`login`이 원격에서 'none'을 받으면 `register` 후 다시 `login`). 그 뒤로 마스터 데이터도 기기 사이에 동기화된다.

**다시 배포할 때(Code.gs를 고쳤을 때)**
- 사용자 PC의 키트 폴더(경로는 프로젝트 문서 13절)에 새 Code.gs를 넣고, 사용자에게 `배포하기.cmd` 두 번 클릭만 부탁한다. `webapp_url.txt`의 ID로 `clasp deploy -i`를 하므로 **주소가 바뀌지 않는다**.
- Claude는 그 폴더를 `device_request_folder_access`로 열 수 있다(이번에 허용됨). 파일은 `device_commit_files`로 넣고, 결과는 `device_bash`로 읽는다. 사용자에게 주소나 오류 문구를 복사해 달라고 하지 않는다.
  - `deploy_log.txt`: 단계별 기록(clasp push·deploy 출력 포함)
  - `cmd_log.txt`: 실행 직전 PowerShell 문법 검사 결과, PS 버전, LanguageMode, node 유무
  - `webapp_url.txt`: 배포 주소
- 사용자 PC: Windows PowerShell 5.1.26100, Node v26, clasp 3.4.1(전역 설치됨), clasp 로그인 완료

**키트에서 배운 것**
- `.ps1`은 **UTF-8 BOM이 꼭 하나만** 있어야 한다. 두 번이면 첫 줄 주석의 `'`가 문자열 시작으로 읽혀 "문자열에 ' 종결자가 없습니다"로 멈춘다. Write 도구는 원래 파일의 BOM을 유지하니 printf로 덧붙이지 않는다. 확인: `python3 -c "print(open('deploy.ps1','rb').read().count(b'\xef\xbb\xbf'))"` → 1
- 네이티브 명령에 PowerShell의 `2>&1`을 쓰지 않는다. 5.1에서는 표준오류가 오류 레코드가 되어 멈출 수 있다. `cmd /c "… 2>&1"`로 합친다(`Run` 함수).
- `clasp create`는 새 프로젝트의 기본 파일을 `Code.js`로 내려받는다. `.claspignore`가 Code.gs·appsscript.json만 올리므로 괜찮다. appsscript.json은 template으로 되돌린다.
- 컨테이너에서는 PowerShell 문법 검사를 돌릴 수 없었다(pwsh 내려받기가 막힘). 그래서 `배포하기.cmd`가 사용자 PC에서 먼저 검사하고 `cmd_log.txt`에 남긴다.

#### ② 기본 테마 — 결정됨(2026-11-21)
- 사용자: "지금도 나쁘진 않다" → 딤 다크(#1B2427) 유지. 상단 '밝게/어둡게'로 바꿀 수 있다.

#### ③ GPT 디자이너 색 제안 (사용자 PC에서)
- 사용자 PC의 Claude Code가 Codex CLI에 `tools/agents/gpt_color_brief.md`를 보내 색 제안을 받는다.
- 결과가 이 채팅으로 오면 다음 순서로 판정한다.
  1. `node tools/design_check/verify.mjs <css>`로 대비비와 색각이상 구분을 계산한다.
  2. 같은 브리프 아래쪽의 '받아들이는 규칙'을 통과한 토큰 그룹만 `css/app.css`에서 교체한다.
  3. 넓은 화면과 휴대폰 스크린샷으로 비교한다.
  4. Fable(Agent, model: fable)에게 컨펌을 받는다.

#### ④ 국내 실적 — 첫 수집 끝(130종목), 13열 수집 진행 중(2026-11-21 21:30)
- 첫 수집(run 44887051784, 17:54~21:15): 호출 7,439번, 130종목·2016년 1분기~, 200분 한도로 멈춤. 점검: 2026년 3분기까지 128종목, 매출 튀는 곳은 증권사·바이오(실제), 우선주 3개는 고유번호 없음(뺌). **공시일 문제**: DART가 정정본 접수번호를 줘서 공시일이 몇 년 뒤로 찍힌 줄 246개 → `kr_quarters`에서 법정 기한(분기·반기 45일, 사업 90일)보다 늦으면 기한으로(시험 있음).
- 수집기 13열 판(KR_VER=2): 재무상태표·현금흐름도 읽음. 예전 판 보고서는 다시 받고, **자료 없는 종목 먼저**. 계정 확인(probe) 결과 삼성전자 2024 반기 자산 485.8조·지배자본 373.7조·영업현금흐름(누적) 28.8조·설비투자 25.4조·배당 6.0조로 맞음(현금흐름은 '당기' 칸에 연초부터 누적).
- 21:21에 13열 수집 실행(run 44903519934, 시세 갱신 뒤 시작). 남은 30종목 + 130종목 다시 받기 ≈ 7천 회. 200분에 다 못 끝내면 다음 날 19:20 자동 실행이 잇는다. 끝나면 `python3 tests/kr_data_check.py`로 점검 → 드라이브 백업.
- 저장 단계는 늘 최신 저장소 위에 국내 파일만 덮고 `--kr-meta`로 meta.json 국내 기록을 다시 쓴다(시세 봇과 meta.json이 부딪혀 받은 자료를 잃지 않게).
- (이전 기록)
- 사용자가 17:54에 `DART_API_KEY`를 저장소 Secrets에 넣었다(값은 사용자만 봄). 바로 `stock-fund.yml`을 수동 실행(run 44887051784, 17:54 시작). 20:10 현재 아직 실행 중 — 호출이 예상보다 느림(한국 서버 왕복). 최대 200분이면 멈추고 받은 만큼 커밋하며, 남은 것은 다음 날 19:20 자동 실행에서 이어 받는다.
- **다음 채팅에서 먼저 할 일**: `gh api repos/hangseokemail-spec/hangseokemail-spec.github.io/actions/workflows/stock-fund.yml/runs?per_page=3`로 상태 확인 → 끝났으면 `git pull` 후 `stock/data/fund/KR_STOCK.json` 점검(종목 수, 분기 수, 삼성전자 005930 등 값이 상식과 맞는지, 매출 0 이하·튀는 값, `skip`의 결산월 목록, 연결/별도 `fs`) → `node tests/fund_check.mjs`(국내 '준비 중' 시험은 자료가 생기면 바꿔야 함) → 국내 대형주 실적 순위 백테스트 한 번 → 문제가 있으면 `fetch_fund.py` 국내 부분 수정. 가짜 응답 시험(`python3 tests/fund_kr_check.py`)만 통과한 상태다.
- 확인이 끝나면 국내 실적 압축(`fund/KR_STOCK.json`·`KR_raw.json`·`dart_corp.json`)을 드라이브 백업 폴더(⑤)에 올린다.
- 수동 실행: `gh workflow run`은 GraphQL이 막혀 안 되고 `gh api -X POST repos/<owner>/<repo>/actions/workflows/stock-fund.yml/dispatches -f ref=main`으로 한다. 실행 중 로그는 API로 못 보고 끝난 뒤 `actions/jobs/<id>/logs`로 본다. Secrets 목록 API는 이 프록시에서 막혀 있다.
- 네이버 금융·야후는 최근 5~6분기만 있고, 한국투자증권 재무 조회는 공시일이 없어 DART를 쓴다.
- 미국 SEC는 User-Agent에 연락처를 요구한다. 지금은 일반 이름으로도 받아지지만, 막히면 저장소 Settings → Variables에 `SEC_UA`(예: "이름 연락처 이메일")를 넣으면 Actions가 그걸 쓴다.

#### ⑤ 드라이브 DB 백업(2026-11-21)
- 사용자가 만든 드라이브 폴더 'Seoks Stock(Backtest)' 안에 'DB 백업 2026-11-21'(주소는 프로젝트 세부지침서 13절). 올린 것: 미국 실적 DB 압축(`seoks-stock_fundamental-DB-US_2026-11-21.zip`), `README_백업설명.txt`. 시세 DB 압축(`seoks-stock_price-DB_2026-11-21.zip`, 7.9MB)은 드라이브 연결 도구의 한 번 호출 한도(약 3.1MB) 때문에 못 올려 채팅으로 보냈고, 사용자가 직접 끌어다 놓기로 함 — 올라갔는지 다음에 확인.
- 드라이브 연결 도구로 파일 올리기: `create_file`의 `base64Content`에 `sha256:<해시>:<절대경로>`(파일 참조). **작업 폴더(/home/claude/…) 안의 파일만** 참조가 된다(/tmp·/mnt/user-data/outputs는 안 됨). 3MB 넘는 파일은 사용자에게 묻는다(나눠 올리기 또는 직접 올리기).
- 사용자 PC 폴더 접근 요청(Documents)은 자동 분류기가 거절했다 — 우회하지 않는다.

### 1-3. 보류 (Fable §4, 요청이 있을 때)
- 지출 영수증·바구니 그림
- 물가 잠식 빗금(erosion hatch)
- 라이트 테마 표 hover 대비
- (끝 라벨 겹침·보유 지도·▲▼·휴대폰 조건 카드는 2026-11-21에 만듦)

### 1-4. 다음 후보
- 국내 13열 수집 끝나면 점검·드라이브 백업(1-2 ④)
- 국내 수집 속도: 지금 1회 약 1.6초(순차). 필요하면 동시 4개 정도로(하루 2만 회 한도 안)
- 미국 순주주환원(신주 발행 빼기), F-스코어, 업종 중립 가치, 버퍼(매수·보유 기준 다르게)로 회전율 줄이기
- 드라이브 정기 백업(원하면): 3MB 한도 때문에 시세 DB는 나눠 올리거나 Apps Script로 받아 오게 해야 함
- 대안 4가지에 '두 가지를 같이 바꾼' 후보(예: 채권 섞기 + 리밸런싱 주기)
- GPT 색 안
- 물가표
- 한국투자증권 API(키는 GitHub Secrets/Actions에만)
- PWA
- 하지 않기로 한 것(사용자 결정 2026-11-21): 표본 밖 검증("부정확"), 과거 대형주 목록으로 생존 편향 줄이기("그것대로 문제")

---

## 2. 이번 세션(2026-11-21) 요청과 반영 위치

| 요청 | 반영 | 주요 위치 |
|---|---|---|
| 오전 요청(금액 한글 읽기, 비교 대상 여러 개, 보유 변화 카드, 롤링, 디자이너·컨펌, 계획 저장, 로그인·가입, 목표·노후 직관성, 속도, 목돈, 넓은 화면, 최근 실행, 제외어, Claude 넘김, 1985년, 조건부 리밸런싱, 끝 라벨, 타이밍, 전략 찾기) | 1-1과 4~7절 | 요청별 표는 `git show fc3b507:stock/HANDOFF.md`의 2절 |
| 문장 해석하면 P1이 사라짐, 비교 창에 P1·P2 | 여러 포트폴리오일 때 편집 중인 탭에만 넣기(되돌리기·'전부 새로 만들기'), 비교 창에 내 포트폴리오 켜고 끄기·새로 만들기 | `backtest.js` interpret, mergeIntoActive, openCompare, addPortfolio, run(inc) |
| 추천 1번 규칙이 '언제 돌아오나' 불명확 | 행동 규칙(평소·확인·팔기·돌아오기)·피신 횟수·지금 상태, 휴대폰 카드 넘침 수정 | `core/finder.js` candRule, `views/finder.js` ruleBlock |
| 내 자산 새 계좌 안 눌림·계좌 정리·모아보기·원화/달러 총액 | 창 안에서 바로 새 계좌, 별칭 중심, 계좌 칩·계좌별 한눈에, 통화별 총액·누른 순간 환율 | `views/assets.js`, `core/holdings.js` refreshFx·valuate |
| 목표·노후 저울·실행 목표 | 맨 위 카드 두 장(팀 협의: Opus 기획 → GPT 그림 → Fable 컨펌) | `views/goalcards.js`, `core/goalcalc.js`, `docs/plan_redesign/` |
| 계정 저장소 배포 | 두 번 클릭 키트로 배포, 연결·동기화 확인 끝(1-2 ①) | `tools/apps_script/`, `config/backend.json` |
| 오후·저녁 요청(목표/노후 분리, 저울·숫자로 넣기, 가로 입력, 도장·색, 대안 그래프 비교·목표 설정 변경, 기록 칩, 계획 판정 도장, 자산 표 설명, 휴대폰 내 자산 칩 잘림, 리포트 탭, 내 자산 맨 왼쪽, 백테스트 끝 라벨·▲▼·보유 지도·휴대폰 조건 카드·몬테카를로) | 1-1 각 탭 | 커밋 `2931f24`, `09f1a1f` |
| 분할·합병 반영? | 미국은 야후 수정 종가로 반영. 국내 일부는 분할·합병·감자 날이 보정 안 돼 있어 정리(8절) | `tools/fetch_data.py` clean_series |

---

## 3. 파일 지도 (`stock/`)

| 파일 | 역할 |
|---|---|
| `index.html` | 탭 6개(개인 탭은 `priv` 클래스), 계정 버튼, 밝게/어둡게 버튼, modulepreload, 기본 테마 dark |
| `css/app.css` | 디자인 토큰(Opus A2 블록, 딤 다크)과 모든 스타일 |
| `js/app.js` | 탭 전환(TABS, PRIVATE_TABS), 로그인·가입 창(openLogin), 계정 메뉴, 설정(마스터 전용 백엔드 주소·연결 확인, 암호화 내보내기/가져오기), 시작 시 세션 복원·prefetch |
| `js/core/engine.js` | 백테스트 엔진: runStatic, runRank, applyTiming, alignSeries, fillDefensive |
| `js/core/signals.js` | 타이밍 지표와 규칙: ruleSeries, planTiming, TIMING_PRESETS, ruleText/condText |
| `js/core/finder.js` | 전략 찾기: buildCandidates, simulateMonthly, findStrategies, candToBacktest |
| `js/core/metrics.js` | CAGR·MDD·변동성·샤프 등 지표 |
| `js/core/plan.js` | 목표·노후 계산과 역산 |
| `js/core/nlp.js` | 자연어 조건 해석 |
| `js/core/comment.js` | 진단(diagnose), 목표별 대안 4가지(altCandidates·findAlternatives), 서술 문장 |
| `js/core/holdings.js` | 내 자산 계산, 위험 점검 |
| `js/core/auth.js` | 로그인·가입·암호화 vault·원격 동기화 |
| `js/core/ai.js` | Claude API 호출(선택) |
| `js/core/data.js` | 시세 로드(IndexedDB 캐시), assetCats, monthEndSeries |
| `js/core/dates.js` | 날짜 도우미 |
| `js/ui/format.js` | 숫자·금액 서식, 한글 금액 읽기 |
| `js/ui/dom.js` | `$`, sheet, toast, store(개인 키는 vault로), settings, moneyHints, applyTheme |
| `js/ui/charts.js` | ECharts 래퍼(선 끝 라벨, 강조, markArea) |
| `js/views/backtest.js` | 백테스트 화면(가장 큼, 약 1,000줄) |
| `js/views/finder.js` | 전략 찾기 화면 |
| `js/views/goal.js` | 목표 탭: 카드 두 장 + 답 + 모이는 모습 + 노후로 넘기기, requestAssetsTotal(내 자산 탭을 안 열어도 총액) |
| `js/views/plan.js` | 노후 탭: 목표 띠, 가로 입력, 결과·도장·그래프, 아래 카드, reportData |
| `js/views/report.js` | 리포트 탭(한 장 요약) |
| `js/views/goalcards.js` | 목표 탭 카드: 돈의 가치 저울, 실행 목표 조건·답·다른 길, loadGoal, migratePlan |
| `js/core/montecarlo.js` | 몬테카를로(블록 재표집, 씨앗 고정) |
| `js/core/fund.js` | 실적 지표: FUND_METRICS(+ROE), quarterMetrics(성장률·이익률 + 최근 4분기 합 rev4·ni4·gp4·cfo4·fcf4·pay4, 잔액 ta·eq, gpa·roe·ag·acc), fundAt(공시일 기준), cutoffOf, loadFundPrep |
| `js/core/factors.js` | 팩터 목록 FACTORS, factorValue, **rankPool**(후보 거르기 → 시총 상위 50 → 점수, 복합은 순위 평균) · pickWeights(같게/시총/변동성/매출 비례 + 상한) · capWeights. 엔진 runRank와 전략 찾기 rankPick이 같이 씀 |
| `js/core/goalcalc.js` | 저울 환산, 네 질문 풀이(올림·대안), 구간 수익률과 같은 한 가지 수익률 |
| `js/views/assets.js` | 내 자산 화면 |
| `config/accounts.json` | 마스터 계정(h, salt, iter 310000, ver, role master, name 석스). 해시만 들어 있다. |
| `config/backend.json` | 계정 저장소 웹 앱 주소(2026-11-21 연결) |
| `data/` | 시세 DB(8절) |
| `tools/fetch_data.py`, `tools/universe_seed.py` | 시세 수집기, 종목 목록 |
| `tools/fetch_fund.py` | 실적 수집기: 미국 SEC companyfacts, 국내 OpenDART(`DART_API_KEY`). `--us-only`·`--kr-only`·`--full`·`--only`·`--max-calls` |
| `tools/make_account.mjs` | 계정 항목 만들기: `node tools/make_account.mjs <아이디> <비밀번호> [role] [이름]` → 출력을 accounts.json에 |
| `tools/apps_script/` | 계정 저장소 코드와 배포 키트(`배포하기.cmd` 두 번 클릭 → `deploy.ps1`), `mock_server.mjs` |
| `tools/agents/gpt_color_brief.md` | GPT 색 제안 요청문과 받아들이는 규칙 |
| `tools/design_check/` | 대비비·색각이상 검사(`verify.mjs`, `lib.mjs`, `evalset.mjs`) |
| `tools/dev/` | 화면 확인용 Playwright 스크립트(`shot.py`, `flow.py`, `perf.py`) |
| `tests/` | 9절 |
| `CLAUDE.md`, `AGENTS.md` | Claude Code·Codex 작업 안내와 서로 부르는 법 |
| `README.md` | 기능·폴더·데이터 갱신 소개 |

---

## 4. 계산 규칙 — 바꾸면 테스트 필수

### 엔진 (`engine.js`)
- 일별로 시뮬레이션하고, 목표 비중은 Map으로 관리한다. 신호는 **다음 거래일에 실행**한다(lag 1).
- 지표 워밍업은 460거래일이다. 시작일 이전 데이터를 쓴다.
- 방어 자산 열은 BIL / IEF / 153130 / CASH다. CASH는 합성 자산으로 1.0 고정. fillDefensive는 상장 전 구간의 수익을 0%로 채운다.
- 타이밍은 노출 시계열을 미리 계산한다(expo, 종목별 타이밍이면 expoEach). 이걸 목표 비중에 방어 자산 항목으로 더한다.
  - `applyTiming` → `res.timing = {tm, expo, expoEach, events, defKey, defLabel, nSell, nReb, inRatio}`
  - 'each' 타이밍의 inRatio는 expoEach로 계산한다(버그 수정됨).
- 순위 전략(runRank)
  - excludeCats로 분류를 제외한다(`assetCats`: lev/inv/bond/cash/cmdty/single/cc). universe도 고를 수 있다.
  - **poolTop**: 주식 그룹에서 지표가 시총이 아니면, 그달 시총 상위 50개 안에서만 고른다. '오늘 큰 종목을 미리 고르는' 편향을 막기 위해서다. 이전에는 15년 CAGR이 SMCI·SHOP 때문에 약 80%로 부풀었고, 지금은 약 28%다. rankDisclaimer가 이 풀을 안내한다.
- `nameOf('CASH')`는 '현금'이다.

### 신호 (`signals.js`)
- 지표: sma, ema, rsi(Wilder), rollingStd, monthlySma, monthlyRet
- `ruleSeries(rule, {day, v}, {cashRet, vix})`, `alignTo`
- `planTiming(tm, sigs, days, isCheck)` → `{expo, expoEach?, events[{i, kind: sell|buy|reb|scale, at, asset?}]}`
  - 종류: switch(팔고 옮김), trigger(조건이 맞을 때 리밸런싱), scale(변동성 맞추기)
  - checkMask: 월말 점검('M')
- 상태가 있는 규칙(STATEFUL): ma, cross, ret, macd, vix, dd
- defaultBuy(다시 사는 기준): rsi는 반대쪽 임계값 30/70, bb, trail은 10개월선 위로 오면 복귀
- 프리셋 11개: ma10m, ma200, absmom, cross, stop15, trail10, rsi, vix30, vol15, each10m, dd15reb
- 트레일링 스톱의 고점은 `isFinite`로 막는다. NaN 고점 때문에 한 번도 안 팔리던 버그가 있었다.
- 문장 만들기: RULE_LABEL, ruleText, condText('…면'으로 끝나는 절), DEF_LABEL, negate

### 전략 찾기 (`finder.js`)
- **후보 만들기**
  - `buildCandidates({market, allowLev})`: 고정 템플릿 × 타이밍(t0, ma, abs, dd, each) + 순위 계열 + 섹터 회전 + GEM
  - 후보 수: US 약 246, KR 약 211, ALL + 레버리지 600개 이상
- **시뮬레이션**
  - 월 단위로 돈다: monthlyFrame, rankPick(poolTop 적용), signalState, simulateMonthly, monthlyMetrics
  - 일별 엔진과 결과가 같은지 확인했다(예: 13.9% / −18.1%).
- **점수와 추천**
  - 점수는 calmar와 앞·뒤 절반 일관성으로 매긴다. 계열당 최대 2개, 중복은 제거한다.
  - `findStrategies(opts)` → `{yms, base, target, limit, all, qualified, recs, count}`
- **백테스트 탭으로 넘기기**
  - `candToBacktest(c, years)`가 sessionStorage `ss.pendingBt`에 넣고 `bt:pending` 이벤트를 보낸다.
  - 목표·노후에서 들어올 때는 `ss.finderPrefill`과 `finder:prefill` 이벤트를 쓴다.
- **문장**: `josa(word, pair)`, `candSentence`
- **화면**
  - 산점도 축 고정: x −60..0, y −5..max(30, 목표×2.5). 범위 밖 점은 속이 빈 점으로 그린다.
  - 목표 영역은 zone-fill로 칠한다.
  - 목표를 지킨 규칙이 없으면 완화 칩을 보여 준다.

### 실적 (`core/fund.js`, `tools/fetch_fund.py`)
- 분기 표 한 줄 = [분기말, 공시일, 매출, 영업이익, 순이익, 희석 EPS, **매출총이익, 영업현금흐름, 설비투자, 총자산, 자본(지배), 자사주 매입, 배당 지급**](13열, `fields`). 앞 6열은 예전과 같다(미국 9,944칸 일치 확인). 미국 현금흐름은 10-Q 누적값을 분기로 풀고(ytd_series), 잔액은 inst_series, **그 분기 실적 공시일보다 늦게 처음 공시된 새 열 값은 버린다**(미리 보기 방지). 국내는 손익 3개월/누적, 재무상태표 잔액, 현금흐름 누적 − 직전 보고서 누적.
- 앱 지표: TTM 합은 연속 4분기 모두 있을 때만. 매출총이익 > 매출×1.01이면 버림, 설비투자·자사주·배당 음수는 0, 현금흐름표가 있는 분기의 자사주·배당 빈칸은 0. 자본 > 총자산이면 자본 버림. GP/A = gp4/총자산, ROE = ni4/평균 자본(자본 > 0), 자산성장 = 총자산/1년 전 − 1, 발생액 = (ni4 − cfo4)/평균 총자산. 같은 분기가 여러 번 공시되면 **처음 공시된 값과 그 날짜**(나중에 고친 값으로 과거를 미리 보지 않게).
- 태그: 매출은 여러 태그 중 그 분기 가장 큰 값(전체 매출 > 부분 매출), 영업이익 `OperatingIncomeLoss`(은행은 없음), 순이익 `NetIncomeLoss` 우선, EPS `EarningsPerShareDiluted` 우선. 4분기는 같은 태그의 10-K 연간 − 1~3분기(연간 공시일까지 나온 가장 최근 분기 값), 공시일은 10-K 날짜.
- 국내(DART `fnlttSinglAcntAll`, 2015년~): 1분기·반기·3분기 보고서 손익계산서의 `thstrm_amount`(3개월)가 그 분기 값, 4분기 = 사업보고서 연간 − 3분기 누적(`thstrm_add_amount`, 없으면 1~3분기 합). 공시일 = `rcept_no` 앞 8자리. 연결(CFS) 우선, 없으면 별도(OFS) — 한 번 정하면 그 회사는 계속 같은 쪽. 순이익은 지배주주 귀속 우선, EPS는 희석 우선. 결산월이 12월이 아닌 회사는 뺌(`company.json`의 acc_mt). 분기말은 12월 결산 기준 3/31·6/30·9/30·12/31.
- 지주회사 전환으로 CIK가 바뀐 종목은 예전 CIK도 이어 붙인다(`PRED`: XOM, GOOGL, DIS, BLK, ETN, LIN, MDT, MRVL, AVGO).
- 지표: YoY = 분기말이 350~380일 전인 분기, QoQ = 75~105일 전 분기 대비. 기준 값이 0 이하이면 성장률 없음. 이익률 = 연속 4분기 합(영업이익 합 ÷ 매출 합).
- 그달(ym) 말 리밸런싱에는 그 달 마지막 날 **이틀 전까지** 공시된 분기 중 가장 최근 것을 쓴다(`cutoffOf`). 그 분기말이 200일 넘게 지났으면 없음으로 본다.
- runRank: 실적 지표는 그달 시총 상위 50개(poolTop) 안에서 순위. 실적 조건은 후보를 먼저 거른다. 실적이 있는 종목이 15개 이상인 첫 달 다음 달부터 시작(대략 2010년).

### 목표 → 노후 연결
- `ss.goal = {inflation, scale:{today|then, years, last}, calc:{ask, target, initial, monthly, rate, years, link}, view}`. goalSummary(goal)이 답까지 채운 값(목표·기간·처음·매달·수익률)을 주고, 노후 탭 syncFromGoal이 `plan.link`가 켜진 칸만 맞춘다.
- 노후 탭은 'tabshown'에서 다시 맞추고, 목표 탭은 `ss.goal.at`이 바뀌었으면 다시 그린다(`goal:reload` 이벤트도 있음).

### 몬테카를로 (`core/montecarlo.js`)
- 입력: 첫 포트폴리오의 월말 시간가중 수익률. 12개월 묶음 무작위 시작(끝에서 처음으로 이어 붙임), 경로 2,000개, mulberry32 씨앗 7.
- 적립·인출은 백테스트 조건(주기·매년 증액)을 그대로, 연말마다 분위수(10·25·50·75·90). 낙폭은 아래 10%가 가장 깊음.
- 3년 미만이면 그리지 않는다. 테스트 `tests/mc_check.mjs`(일정 수익률이면 손계산과 같음, 씨앗 고정).

### 목표·노후 계산 (`core/plan.js`)
- lifePlan 직후 `if (st._noAlt) return { mode: 'retire', lp, gap };`로 끝낸다. 역산 함수 안에서 다시 역산하는 중첩을 막는다. 11초가 걸린 원인이 이것이었다.
- rateForYear는 정렬된 수익률 구간을 WeakMap에 캐시한다.

### 데이터 로드 (`data.js`)
- IndexedDB `ss-cache`에 저장하고, 키는 `meta.updated` 버전이다. 버전이 바뀌면 캐시를 버린다(setDataVersion).
- clearDataCache, prefetch(자주 쓰는 종목)
- `assetCats(it)`, `CAT_LABEL`, `monthEndSeries(px, useTR)`

---

## 5. 로그인·계정·보안 (`auth.js`, `Code.gs`)

**키 유도**
- PBKDF2-SHA256 310,000회. salt는 무작위 salt 뒤에 소문자 아이디를 붙인 것이다.
- 결과 512비트를 둘로 나눈다.
  - 앞 32바이트: 검증값(ver). 서버가 비교한다.
  - 뒤 32바이트: AES-GCM 키. 브라우저 밖으로 나가지 않는다.

**저장 위치**
- 계정 해시: `h = sha256('ss-acct:' + 소문자 아이디)`
- vault: localStorage `ss.vault.<h 앞 16자>`
- 세션: `ss.sess` {h, name, role, k, v}. 평소에는 sessionStorage, '로그인 유지'를 고르면 localStorage.

**개인 키(PERSONAL)**
- ss.goal, ss.plans, ss.holdings, ss.snapshots, ss.bt, ss.btHistory, ss.planHistory, ss.priv, ss.finder
- `dom.store()`가 이 키들을 자동으로 vault로 보낸다.
- Claude API 키와 모델은 ss.priv(vault)로 따로 둔다.
- 마스터 첫 로그인 때 예전 평문 키와 apiKey를 vault로 옮긴다.

**로그인 순서**
- 마스터(`config/accounts.json`) → 이 기기 계정(localStorage `ss.accounts`) → 원격(salt → login)
- 원격이 'none'을 돌려주면 자동으로 register한다.
- 가입은 `signup({id, email, pw, pw2, remember})`

**동기화**
- vaultSet이 `_at`을 갱신하고, 디바운스로 저장한 뒤 1.5초 뒤 원격에 push한다.
- 로그인과 restoreSession 때 원격 box의 `_at`이 더 새로우면 그것으로 바꾼다.

**백엔드 주소**
- localStorage `ss.backendUrl`(마스터가 설정에서 이 기기만 덮어쓸 수 있음)을 먼저 보고, 없으면 `config/backend.json`을 쓴다.
- 요청은 text/plain POST라서 사전 요청 없이 CORS를 통과한다.

**Code.gs 동작**
- 액션: ping / salt / register / login / push. GET에 액션이 없으면 "동작 중이에요 ✓" 안내 화면과 주소를 보여 준다. `setup()`은 시트와 폴더 주소를 로그에 남긴다.
- 계정 시트 'Seok's Stock 계정': h, id, email, name, role, salt, iter, ver, 가입일, …, fails, lockUntil, vaultAt
- 개인 데이터: 드라이브 'Seok's Stock 개인 데이터(암호화)' 폴더의 `vault_<h16>.json`. 암호문이다.
- 10회 연속 실패하면 15분 잠근다.
- 아이디 규칙 `^[a-z0-9_.-]{3,20}$`, 이메일 형식 검사, LockService로 동시 쓰기를 막는다.
- 웹 앱 설정: 나로 실행(USER_DEPLOYING), 모든 사용자(익명). 보안은 검증값, 잠금, 브라우저 암호화로 지킨다.

**백업**
- 설정에서 암호화된 내보내기/가져오기(exportVault/importVault)

### 보안 규칙 (반드시 지킨다)
- 비밀번호와 키 원문을 공개 저장소에 커밋하지 않는다. accounts.json에는 해시·salt·검증값만 넣는다. 시험 스크립트 로그인도 환경변수(`SS_ID`, `SS_PW`)로 한다.
- Claude API 키는 계정 vault에만 암호화해 둔다. 백업 파일, 공유 링크, URL에는 넣지 않는다.
- 개인 보유 종목과 계획은 저장소에 커밋하지 않는다. 공유 링크에는 보유 종목이 없다.
- 한국투자증권 앱 키·시크릿은 공개 페이지에 넣지 않는다. GitHub Secrets/Actions에만 둔다.
- 사용자 PC 폴더 접근 요청이 거절되면 우회하지 않는다. 첨부 파일이나 드라이브로 전달한다.

---

## 6. 화면·디자인 규칙

**색**
- 색은 `css/app.css` 토큰만 쓴다.
- 기본 딤 다크: bg-page #1B2427, surface #252D30, theme-color #1B2427
- Fable이 컨펌한 새 토큰
  - compare-1..6: 비교선
  - hl-bg / hl-ink: 형광펜(새로 들어온 종목)
  - sig-buy / sig-sell / sig-reb: 타이밍 표시
  - zone-fill / zone-line: 전략 찾기 목표 영역
  - dot-muted
  - erosion: 물가
  - timing-off: 쉬는 구간 음영
- 한국식: 상승은 빨강, 하락은 파랑. 마이너스는 U+2212(−). 시세·수익률에만 쓴다.
- 좋음/나쁨(노후 결과, 목표 탭 '불어난 돈' 막대, 최근 기록 칩)은 시세 색과 따로 `--st-good`(초록) · `--st-bad`(빨강).
- 도장 `.stamp.good/.bad`(−9° 기울임, 이중 테두리, 상태가 바뀔 때만 `.slam`).

**금액 읽기 (Fable 확정)**
- 천의 배수일 때만 '천'으로 읽는다: 2,000만 → "2천만원", 1,000만 → "천만원", 2,500만 → "2,500만원".
- 입력칸은 정확히 읽는다. KPI 표시는 앞 두 단위만 쓴다(예: "3억 2,400만원").
- 달러는 정확히 읽고, 원화 환산에만 '약'을 붙인다(유효숫자 3자리).
- 구현
  - `format.js`: koreanUnits(n, {exact}), readKRW, approxKRW, readUSD, krRead(x, cur='KRW', exact=true), krReadUSD(x, fx)
  - groupWord: `g % 1000 === 0`일 때만 '천'
  - 입력칸에 `data-money` 속성만 붙이면 `dom.moneyHints`가 읽기를 표시한다. sheet()가 열릴 때 자동으로 적용된다.

**낱말**
- '지금 돈 / 나중 돈' 대신 "{year}년 통장 숫자" / "오늘 돈"
- 리밸런싱 없음 = "리밸런싱 없이 두기"
- KPI 제목 = "연환산 수익률(CAGR)"
- 목표·노후 단계 제목은 질문형

**레이아웃**
- 1280px 이상: 백테스트 조건 4칸(종목 / 리밸런싱 / 조건 / 비교)
- 리밸런싱이 'none'이면 적립·인출 칸을 숨긴다.
- 탭바는 6칸(글씨 11px). 900px 미만에서는 data-stamp를 숨긴다.
- 목표 탭: 768px 이상에서 저울 | 조건 한 줄(5fr 6fr). 노후 탭: 입력 네 묶음 1100px 이상 4열, 641~1099px 2열, 휴대폰 1열(나이는 3칸 한 줄). 아래 카드 1025px 이상 2열(같은 줄 같은 높이).

**그래프 (`charts.js`)**
- 선 끝 라벨: 시리즈에 `endText {name, value, sub, cls}`를 주면 오른쪽 여백(132px)에 HTML 라벨을 세로로 펼치고 꺾은 선으로 잇는다(bindEndOverlay, 'finished' 때마다 다시 배치). 휴대폰은 라벨 없이 범례·읽기 줄.
- 범례에서 점선 시리즈는 점선 견본(repeating-linear-gradient)으로 그린다. 쌓기(`stack`)는 category 축에서만 쓴다(몬테카를로 띠).
- 선을 강조하면 다른 선은 흐려진다. 타이밍으로 쉬는 구간은 markArea. animationDurationUpdate는 200.

**디자인 문서**
- Opus 안 `03_design_opus.md`(§Z까지)와 Fable 컨펌 `04_fable_confirm.md`
- 드라이브 '설계 협의 기록' 폴더에 있다(13절).

---

## 7. 문장 해석 (`nlp.js`)과 Claude 연결 (`ai.js`)

기본은 브라우저 안의 규칙 기반 해석이다.

**제외어**
- CAT_WORDS → findExcludeCats. 예: "레버리지 etf는 빼고" → excludeCats lev

**타이밍**
- SIG_WORDS → `parseTiming(s, isKR)`
- '…면 현금/채권'에서 옮길 곳을 찾는다. 월말 점검('M'), 저점 매수도 해석한다.
- 타이밍 구절에 나온 종목과 '현금/채권' 같은 일반어는 담을 종목에서 뺀다.
- 옮길 곳이 국내 ETF인지 미국 ETF인지는 포트폴리오 종목을 보고 정한다(tmKR).

**비교**
- `comparisonTargets(s)` → `{words, start, end}`. 토큰을 뒤에서부터 해석한다.
- '…랑 비교' 꼬리에 나온 종목은 비교 대상으로 보낸다. 단, 그러면 문장이 비는 경우에는 포트폴리오로 둔다(예: "SPY랑 QQQ 비교").
- 결과는 `st.benchmarks` 배열이다.

**못 알아들은 말**
- KNOWN 정규식, ENDINGS, isKnownWord, leftoverWords
- 화면에 '무시한 말'로 표시한다.

**Claude 연결**
- 남은 말이 있거나 해석 결과가 비었을 때, API 키가 있으면 자동으로 Claude를 부른다.
- 브라우저가 api.anthropic.com에 직접 요청한다. `anthropic-dangerous-direct-browser-access` 헤더를 쓰고, 기본 모델은 `claude-sonnet-5-5`(설정에서 바꿀 수 있음).
- 실패하면 규칙 해석 결과로 돌아간다. 가짜 키로 401을 받아 CORS 경로가 열려 있음을 확인했다.
- 해석을 바꾸면 `node tests/nlp_check.mjs`를 돌린다.

---

## 8. 시세 데이터 (`stock/data`)

**파일**
- `universe.json`: 약 880종목과 최근 종가
- `px/<키>.json`: 일별 종가(분할 반영)와 배당
- `monthly_<그룹>.json`: 순위 전략용 월간 표
- `kr_all.json`: 국내 전 종목·ETF 이름과 시세
- `extra_tickers.txt`: 추가 종목
- `meta.updated`가 앱 캐시 버전이다.

**워크플로**
- `.github/workflows/stock-data.yml`: 화~토 06:40, 월~금 16:50(KST)에 증분 수집, 일요일에 전체 점검
- `.github/workflows/stock-add-ticker.yml`: 저장소 주인이 제목이 `[종목 추가]`로 시작하는 이슈를 열면 종목을 넣고 답글을 단 뒤 닫는다. 앱 종목 검색의 '추가 요청' 버튼이 이 이슈를 연다.

**시작일**
- 미국·지수: 1985-01-02. `START_US_TS = 473385600`, p1 표시로 한 번 전체 재수집했다(255개 파일).
- 국내: 2000년부터(또는 상장일부터)
- 원/달러: 1985-01-02. FRED DEXKOUS로 앞부분을 보충한다. FRED가 실패하면 stooq, 그것도 실패하면 기존 줄을 유지한다. p1은 보충에 성공했을 때만 표시한다.
- VIX: 1990-01-02(`IDX_VIX`)

**국내 시세 정리(2026-11-21, `clean_series`)**
- 국내 종목만. ① 가격제한폭을 크게 벗어나 튀었다가 10거래일 안에 원래 수준(±15%)으로 돌아오면 그 사이를 메움(야후 오류: 대한전선 2005~2007, LG유플러스 2001~2008, 주성엔지니어링 2024.10 등) ② 남은 '가격제한폭 밖' 하루 변동(분할·합병·감자·재상장을 야후가 보정하지 않은 날)은 그날 수익을 0으로 보고 그 전 가격·배당을 같은 비율로 맞춤(앞부분을 버리지 않음).
- 기준: 2015-06-15 전 0.75~1.30배, 그 뒤 0.62~1.45배(애매한 권리락 날은 건드리지 않게 넓게), ETF 0.38~2.10배. 바로 전 1~5일 값이 멈춰 있었으면 그만큼 따라잡을 수 있다고 보고, 시세가 7일 넘게 비면 판단하지 않음.
- 수집할 때마다 적용되고, 네트워크 없이 `python3 tools/fetch_data.py --clean-only`로 지금 파일만 다시 정리할 수 있다(meta.json `cleaned`에 기록). 2026-11-21에 16개 파일을 정리해 커밋했다.
- 미국 종목은 야후 분할 반영 종가 그대로(증분 수집 때 겹치는 날 0.2% 넘게 다르면 전체 재수집). 남은 큰 하루 변동(IONQ 2025.1 등)은 실제 사건이라 그대로 둠.

**실적 DB (`data/fund/`)**
- `US_STOCK.json`: `{updated, src, fields(13개), nodata, t: {티커: {cik, at, q: [[분기말, 공시일, 매출, 영업이익, 순이익, EPS, 매출총이익, 영업현금흐름, 설비투자, 총자산, 자본, 자사주, 배당]…]}}}` 약 1.2MB, 159종목·2008년~(2026-11-21 `--us-only --full`로 다시 만듦). 2010년 이후 채움률: 총자산·자본 98%, 영업현금흐름 95%, 설비투자 89%, 매출총이익 69%(은행·보험 없음), 자사주 67%, 배당 62%. `sec_cik.json`: 티커 → CIK(EDGAR 검색 색인 efts로 찾음).
- 자료 없음 6개: ARM, ASML, BABA, CCJ, NVO, TSM(미국 밖 회사라 20-F·40-F로 연간만 내고 분기 XBRL이 없음).
- `KR_STOCK.json`(앱이 읽음, 모양 같음, 원 단위) · `KR_raw.json`(수집기 전용: 보고서별 원본 값 `reps`, 받은 보고서 `done`, 연결/별도 `fs`, 결산월 `acc_mt`) · `dart_corp.json`(종목코드 → DART 고유번호).
- 국내 갱신: `stock-fund.yml`(매일 19:20 KST, 수동 실행 가능, 키 없으면 바로 끝). 입력 `probe`(예 `005930:2024:11012`)를 주면 그 보고서 계정 목록만 찍고 끝(키는 안 찍음). 저장 단계는 최신 저장소 위에 KR 파일을 덮고 `fetch_fund.py --kr-meta`. 주의: `stock-data.yml`은 `stock/tools/**` 푸시에도 돌고 같은 대기열(stock-data)이라, 대기 중인 실행은 새로 들어온 실행에 밀려 취소된다. 낼 때가 된(분기말 30일 지난) 보고서 중 아직 안 받은 것만 묻고, 기한+30일이 지나도 없으면 다시 묻지 않는다. 한 번에 최대 1만 5천 회·200분(하루 한도 2만 회), 넘으면 받아 둔 만큼 저장하고 다음 날 이어서. 키가 틀리면(010 등) 멈추고 키는 로그에 찍지 않는다.
- 갱신: `stock-data.yml`의 fundamentals 단계는 미국만(`--us-only`, 실패해도 시세는 계속). 마지막 분기말이 75일 넘게 지났고 3일 안에 확인하지 않은 종목만 다시 받아 **없던 분기만 붙인다**(있는 분기 값은 그대로). 바뀌면 meta.json `updated`·`fund`도 갱신해 브라우저 캐시를 새로 받게 한다.
- 이 컨테이너에서 Python urllib로 SEC를 부를 때 User-Agent에 공백·괄호가 있으면 403이 났다. 기본값 `SeoksStock-research/1.0`. `www.sec.gov`(티커 목록)는 403이라 efts를 쓴다.

**수집기와 주의**
- 수집기는 `tools/fetch_data.py`와 `tools/universe_seed.py`. `__pycache__`는 `tools/.gitignore`로 뺀다.
- Actions에서 FRED가 시간 초과된 적이 있어서, 원/달러 보충은 로컬에서 하고 커밋했다.

---

## 9. 테스트·검증 도구

**테스트 (`tests/`)**
- `run.mjs`: 퀀트 기대값 96개와 포트폴리오 비주얼라이저 대조. CAGR 11.44 vs 11.46, 변동성 12.29 vs 12.3, MDD −25.69 vs −25.7.
- `timing_check.mjs` 20개, `goal_check.mjs` 52개, `mc_check.mjs` 10개, `fund_check.mjs` 20개(공시일 전 값을 안 쓰는지, 애플 4분기 값, 실적 순위·조건, 국내 영업이익률 순위가 돎), `python3 tests/fund_kr_check.py` 19개(국내 수집기, 가짜 응답으로 4분기·연결/별도·결산월·증분·재무상태표·누적 현금흐름·예전 판 다시 받기·정정공시 공시일), `factor_check.mjs` 33개(팩터 손계산·공시 전 값·복합 점수·매출 비례·재무 팩터·회전율 한도·규칙 문장), `finder_check.mjs`(추천 결과, 일별 엔진과 일치), `nlp_check.mjs`, `rank_check.mjs`, `pv_check.mjs`
- 장기 확인값: VFINX 원화 1985년~ CAGR 12.51%, 60/40 달러 1987년~ 9.03%

**화면 확인 (`tools/dev/`)** — Playwright와 `/usr/bin/google-chrome` 기준
- `shot.py <url> <out.png> <w> <h> [js] [wait_ms]`: 한 장 찍기, 콘솔 오류 출력
- `flow.py <url> <w> <h> <prefix>`: 단계를 표준입력으로 받는다.
  - 단계는 `\n---\n`으로 구분한다.
  - `SHOT 이름 [full]`은 스크린샷을 찍는다.
  - `LOGIN`은 환경변수 `SS_ID`/`SS_PW`로 로그인한다.
  - `WAIT ms <js>`는 js를 실행하고 ms만큼 기다린다.
  - 나머지 줄은 페이지에서 실행할 js다.
- `perf.py <url> <cpu배수> [4g]`: 휴대폰 화면, CPU를 느리게 해서 속도를 잰다.
- 화면을 바꾸면 넓은 화면(1440)과 휴대폰(390) 두 장으로 확인한다.

**계정 저장소 흉내**
- `node tools/apps_script/mock_server.mjs`를 실행한다(포트 8766, Code.gs와 같은 동작).
- 앱 설정(마스터)에서 계정 저장소 주소를 `http://localhost:8766`으로 넣는다.
- 컨텍스트 두 개로 가입과 동기화를 시험한다. 이번 세션에 통과했다: 기기 A에서 가입 → 기기 B에서 로그인 → 월 적립 2,345,000과 기록이 복원됨.

**색 검사**
- `node tools/design_check/verify.mjs [css 경로]`: 대비비와 색각이상 구분을 계산한다.

**언제 무엇을 돌리나**
- 계산을 바꾸면 run / timing / finder
- 해석을 바꾸면 nlp_check
- 목표 탭 계산(goalcalc)을 바꾸면 goal_check(52개), 몬테카를로를 바꾸면 mc_check(10개), 실적 계산·수집기를 바꾸면 fund_check(19개)
- 국내 시세 정리 규칙을 바꾸면 `--clean-only`를 돌리고 바뀐 파일 목록을 확인
- 화면을 바꾸면 shot.py 두 장
- 색을 바꾸면 verify.mjs

---

## 10. 협업 방식

**디자인**
- Opus 디자이너(Agent, 디자인 전담)가 제안 문서를 쓴다.
- Fable(Agent, model: fable)이 컨펌하고 수정을 지시한다. 그 뒤에 반영한다.
- 디자이너 에이전트가 중간에 멈추면 이미 쓴 문서로 진행했다.

**GPT 디자이너**
- **이 채팅(클라우드)에서 바로 부를 수 있다**(2026-11-21 확인). `npm install @openai/codex`(0.171) 후 `npx codex login --device-auth`를 백그라운드로 돌리면 링크(https://auth.openai.com/codex/device)와 일회용 코드가 나온다. 사용자에게 링크·코드만 보내 로그인하게 한다(15분 유효). 새 컨테이너마다 다시 로그인해야 한다.
- 부르기: `npx codex exec --skip-git-repo-check -C <작업 폴더> --sandbox workspace-write -o <답 파일> "$(cat 브리프.md)"`. 저장소는 읽기만 하게 하고 결과물은 작업 폴더에 받는다. 시안은 Playwright로 찍어 확인한다(Codex 쪽 Chrome은 안 뜸).
- 사용자 PC의 Codex CLI로도 된다. 색 브리프와 판정 규칙: `tools/agents/gpt_color_brief.md`
- 팀 협의 순서(목표·노후 때 씀): Claude 초안 → Opus 검토(agent, model opus)·GPT 시안(Codex) 동시에 → Fable 컨펌(agent, model fable) → 구현. 기록은 `docs/plan_redesign/`.

**PC 쪽 Claude Code ↔ Codex CLI**
- Claude Code가 Codex에게: `codex exec --skip-git-repo-check "…"`. 저장된 로그인을 다시 쓴다. `-o 파일`로 답을 파일에 받는다. 제안만 받을 때는 `--sandbox read-only`.
- Codex가 Claude에게: `claude -p "…"`
- 설치
  - Claude Code: `irm https://claude.ai/install.ps1 | iex`
  - Codex: `npm i -g @openai/codex`
  - PC 홈에 `.codex` 폴더가 있으니 이미 설치됐을 수 있다.
  - Codex 앱과 CLI를 둘 다 깔면 자동 호출이 실패했다는 보고가 있다. 하나만 둔다.
- 안내 파일: `stock/CLAUDE.md`, `stock/AGENTS.md`

**이 채팅(클라우드)의 한계**
- 사용자 PowerShell을 직접 실행할 수 없다.
- 기기 연결 도구가 있어도 다운로드 폴더 접근 요청이 자동으로 거절된 적이 있다. 우회하지 말고 첨부 파일이나 드라이브로 전달한다.
- 2026-11-21에는 키트 폴더 접근이 허용됐다. `device_bash`는 사용자 PC 안의 리눅스 VM이라 PowerShell은 못 돌리지만, 폴더 파일을 읽고 쓸 수 있다.
- 2026-11-21 저녁: 사용자 PC 폴더 접근 요청(Documents)이 자동 분류기에 거절됨. 기본 브라우저(앱 안 브라우저)에는 GitHub 로그인이 되어 있다.
- 백그라운드 서버(로컬 8765·목업 8766)는 턴이 끝나면 꺼질 수 있다 — 화면 찍기 전에 다시 띄운다.
- 사용자가 화면 조작(computer use)을 긴급 중지한 적이 있다. 화면을 봐야 하면 먼저 묻는다. 대신 파일 기록으로 상태를 읽는다.

**사용자 선호**
- 문제를 지적할 때는 구체적인 대안을 함께 낸다.
- 화면 글은 쉬운 한국어로 쓰고, 설명 없이도 알 수 있는 UI를 만든다.
- 포트폴리오가 바뀌면 메모리에 기록한다.
- 커밋·푸시는 묻지 않고 바로 해도 된다(2026-11-21 사용자: "저장소에 푸시해도 돼, 앞으로 그냥 해"). 시세 봇과 겹치지 않게 푸시 전 `git pull --rebase`만 지킨다.

---

## 11. 알려진 한계·주의
- **생존 편향**: 종목 목록이 '오늘' 기준이다. poolTop 50으로 줄였다. 과거 대형주 목록은 넣지 않기로 했다(사용자 결정). 합병돼 사라진 회사도 목록에 없다.
- **국내 기업 행사**: 분할·합병·감자로 생긴 불가능한 하루 변동은 0으로 보정(8절). 그날의 실제 수익은 알 수 없어 0으로 둔 것이다.
- **실적**: 국내는 키를 넣고 첫 수집이 끝나야 쓸 수 있다. 미국은 XBRL 의무화 전(2009년 이전)은 없다. 태그를 섞어 쓰는 회사는 드물게 한 분기가 튄다(예: IBM 2021년 4분기 매출은 킨드릴 분사로 연간 기준이 달라 작게 나옴). 미국 밖 회사 6개는 없음. EPS 4분기는 연간 − 1~3분기라 주식 수가 크게 바뀐 해는 근사.
- **몬테카를로**: 과거 월수익률의 순서만 바꾼 것이라 과거에 없던 사건은 담지 못한다(화면에 안내).
- **데이터 기간**: 국내는 2000년 이전 데이터가 없다. 원/달러 2003년 이전은 FRED 일별 자료다.
- **전략 찾기**
  - 월 단위 근사다. 대표 사례에서 일별 엔진과 일치함을 확인했다.
  - 같은 기간에서 고른 규칙이라 과최적화 위험이 있다. 앞·뒤 절반 일관성으로 일부를 걸러 낸다.
- **계정 저장소**: Apps Script 할당량 안에서 동작한다. 개인·가족 규모면 충분하다.
- **드라이브 연결 도구**: Apps Script 프로젝트 파일을 만들 수 없다(외부 MIME 요구). 배포는 clasp나 손으로 한다.
- **컨테이너 파일**: 이전 채팅의 `/home/claude/work`, `/home/claude/design` 파일은 새 채팅에 없다. 필요한 것은 저장소(`tools/dev`, `tools/apps_script/mock_server.mjs`)와 드라이브로 옮겨 두었다.

---

## 12. 이번 세션 커밋 (오래된 순)

| 커밋 | 내용 |
|---|---|
| `8f0610e` | 로그인·계정별 암호화 저장, 전략 찾기 탭, 매수·매도 타이밍, 비교 대상 여러 개, 최근 실행 기록 |
| `b5b7cca` | 원/달러 1985년부터(FRED 보충), 로그인 뒤 원래 가려던 탭으로 |
| `6a10186` | 가입창, 계정 저장소 연결 시 어느 기기에서든 동기화 |
| `d71d0b0` | 목표·노후 질문형 단계, 그때 돈/오늘 돈 이름표, 나이 띠 목돈 |
| `569cce4` | Fable 컨펌 반영(딤 다크·새 토큰, 금액 읽기 규칙, 낱말 통일, 형광펜, poolTop 50 등) |
| `b250e72` | '…랑 비교' 꼬리의 지수를 비교 대상으로 |
| `40588bf` | 계정 저장소 배포 키트, CLAUDE.md·AGENTS.md, GPT 색 브리프, 색 검사 스크립트 |
| `fc3b507` | 이 지침서(HANDOFF.md), `tools/dev`, `mock_server.mjs` |
| `ae8e23b` | 배포 키트: 두 번 클릭 실행, clasp 3.4 확인, 주소·기록 파일 |
| `ab0ef15` | 배포 스크립트 BOM 중복 수정, API 페이지 먼저 열기, 실행 전 문법 검사 |
| `a3f5337` | 계정 저장소 연결(backend.json) |
| `c21ead3` | 문장 해석 시 다른 포트폴리오 유지, 비교 창에 P1·P2·P3 |
| `8323a6c` | 전략 찾기 추천을 행동 규칙으로, 피신 횟수·지금 상태 |
| `1d0169e` | 내 자산 계좌 정리, 모아보기 계좌별, 원화·달러 총액, 누른 순간 환율 |
| `ba806c8` | 목표·노후 돈의 가치 저울·실행 목표 만들기 |
| `2931f24` | 목표·노후 탭 분리(목표 → 노후 기본값), 노후 가로 입력·도장·색, 백테스트 끝 라벨 정리·▲▼·보유 지도·휴대폰 조건 카드·몬테카를로, 국내 시세 정리 |
| `09f1a1f` | 리포트 탭, 내 자산 맨 왼쪽, 대안 그래프 비교, 노후 판정 도장·자산 표 설명·기록 칩 |
| `80479e3` | 실적(펀더멘털) 순위 기준·조건, SEC 실적 DB와 증분 수집, 문장 해석 |
| `14b0b7a` | OpenDART 국내 실적 수집기·stock-fund 워크플로, 국내 실적 순위 열기 |
| `119406c` | 진단과 대안: 목표별 대안 4가지(샤프·변동성·낙폭·수익률), 그래프에 겹쳐 보기 |
| `66558f2` | 대안 후보의 하락장 쉬기를 6·10·12개월선 세 가지로 |
| `c77d548` | 팩터 11개·매출 비례, 전략 찾기 회전율 목표·자세한 규칙·매년 교체, 대안 비교 칸·보유 변화 나란히, 조건 칸 3칸 |
| `097b6fa` | 실적 DB 13열(재무상태표·현금흐름) 수집기·미국 DB, 재무 팩터 9개, 실적 조건 ROE |
| `e103a4d` | 국내 공시일: 정정공시 늦은 날은 법정 기한으로 |
| `6a2eced` | 국내 실적 순위 시험, 설비투자 계정, '…과 비교' 꼬리 해석 |
| `f992802` | 국내 실적 저장 단계(최신 저장소 위에 덮기, --kr-meta) |

그 사이의 'stock: 시세 갱신 …'은 봇 커밋이다.
