# Seok's Stock 세부 지침서 (작업 인수인계)

기준: 2026-11-21 12:50 KST · 포트폴리오 비교 수정 커밋(12절 마지막 줄)
이 문서 하나만 읽으면 새 채팅(또는 PC의 Claude Code)에서 바로 이어 갈 수 있게 정리했다. 짧은 소개는 프로젝트 문서 `claude/seoks-stock-개요.md`에 있다.

---

## 0. 새 채팅에서 시작하는 순서

1. **이 문서를 먼저 읽는다.** 같은 내용이 두 곳에 있다.
   - 프로젝트 문서 `claude/seoks-stock-세부지침서.md`: 13절 링크·계정 포함
   - 저장소 `stock/HANDOFF.md`: 공개 저장소라 13절을 뺐다
2. **저장소를 붙인다.**
   - `add_repo(owner="hangseokemail-spec", repo="hangseokemail-spec.github.io", access="push")`
   - 안내된 명령으로 `/home/claude/hangseokemail-spec.github.io`에 클론한 뒤 `register_repo_root`
   - 이 저장소는 '석스 가판대' 전체 사이트이고, 이 앱은 `stock/` 폴더뿐이다. 다른 폴더는 요청 없이 건드리지 않는다. 가판대 '시장·투자' 탭에 이 앱 카드가 있다.
3. **상태를 확인한다**(1분).
   ```
   cd stock
   node tests/run.mjs          # 통과 96 / 실패 0
   node tests/timing_check.mjs # 통과 20 / 실패 0
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
- 탭은 4개: 백테스트 / 전략 찾기 / 목표·노후 / 내 자산
- 목표·노후와 내 자산은 로그인해야 열린다. 로그인하면 원래 가려던 탭으로 간다.
- 로그인·가입(아이디·이메일·비밀번호), 계정별 암호화 저장, 마스터 계정 1개

**백테스트**
- 포트폴리오 P1~P3 나란히 비교. 포트폴리오가 둘 이상이면 문장 해석은 **편집 중인 탭에만** 들어가고, 다른 포트폴리오와 전역 조건(기간·금액·통화·적립·비용·비교 대상)은 문장에서 말한 것만 바뀐다(`mergeIntoActive`). 포트폴리오가 하나일 때는 예전처럼 통째로 바꾸고, '앞의 것도 남겨서 같이 비교' 버튼을 띄운다.
- 비교 창('무엇과 비교할까요?') 맨 위 '내 포트폴리오': P1·P2·P3를 켜고 끈다(`pf.off`, 꺼진 것은 계산·문장에서 빠지고 탭이 점선). 하나는 꼭 남는다. '+ 새 포트폴리오 만들어 비교'로 탭을 만든다.
- 비교 대상 최대 6개, 최근 실행 10개
- 매수·매도 타이밍 프리셋 11개와 직접 설정, 조건부 리밸런싱
- 그래프 선 끝에 누적 %와 CAGR, 보유 변화 카드
- 넓은 화면에서 조건을 가로 4칸으로 배치
- 기간은 1985년부터

**전략 찾기**
- 목표 수익률·최대 낙폭·기간을 넣으면 규칙을 추천한다.

**목표·노후**
- 계획마다 최근 5회 기록
- '그해 통장 숫자 / 오늘 돈' 스위치, 돈의 가치 막대
- 나이 띠에서 목돈 넣기
- 필요한 수익률을 구해 전략 찾기로 연결

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

#### ② 기본 테마 결정 (답 대기)
- 사용자는 "전체 디자인 색이 약간 더 밝았으면"이라고 했다. Fable은 이를 딤 다크(#1B2427)로 결정했다.
- 흰 바탕을 기본으로 할지 물었지만 아직 답이 없다.
- 바꾸려면 두 곳을 고친다: `js/ui/dom.js`의 `DEFAULT_SETTINGS.theme = 'light'`와 `index.html`의 `s.theme || 'dark'`. 그리고 `theme-color` 메타도 맞춘다.
- 사용자는 상단 '밝게/어둡게' 버튼으로 언제든 바꿀 수 있다.

#### ③ GPT 디자이너 색 제안 (사용자 PC에서)
- 사용자 PC의 Claude Code가 Codex CLI에 `tools/agents/gpt_color_brief.md`를 보내 색 제안을 받는다.
- 결과가 이 채팅으로 오면 다음 순서로 판정한다.
  1. `node tools/design_check/verify.mjs <css>`로 대비비와 색각이상 구분을 계산한다.
  2. 같은 브리프 아래쪽의 '받아들이는 규칙'을 통과한 토큰 그룹만 `css/app.css`에서 교체한다.
  3. 넓은 화면과 휴대폰 스크린샷으로 비교한다.
  4. Fable(Agent, model: fable)에게 컨펌을 받는다.

### 1-3. 보류 (Fable §4, 요청이 있을 때)
- 그래프 끝 라벨 겹침 오버레이
- 보유 변화 한눈 지도(종목 × 시점)
- 수익률 ▲▼ 표시
- 지출 영수증·바구니 그림
- 물가 잠식 빗금(erosion hatch)
- 휴대폰용 조건 카드
- 라이트 테마 표 hover 대비

### 1-4. 다음 후보
- GPT 색 안
- 물가표
- 표본 밖(out-of-sample) 검증
- 몬테카를로
- 과거 대형주 목록(생존 편향 축소)
- 한국투자증권 API(키는 GitHub Secrets/Actions에만)
- PWA

---

## 2. 이번 세션(2026-11-21) 요청과 반영 위치

| 요청 | 반영 | 주요 위치 |
|---|---|---|
| 1·8 금액 옆 한글 읽기(원·달러, 모든 탭) | 입력칸·KPI·표 옆 읽기, Fable 규칙(6절) | `ui/format.js`, `ui/dom.js` moneyHints |
| 2 비교 대상 여러 개 | 최대 6개, 시트 탭 3개(지수 / 종목 검색 / 지난 실행), 문장 '…랑 비교' | `views/backtest.js` openCompare, `core/nlp.js` comparisonTargets |
| 3 보유 변화 카드, 새 종목 색 | 카드형, 새로 들어온 종목 형광펜, 팔았다 다시 산 구간은 한 카드, 리밸런싱 카드, '변화 없는 것도 보기' | `backtest.js` renderHoldingsCards |
| 4 롤링 빈 화면 | 기간에 맞춰 창 길이 자동 조정 | `backtest.js` 롤링 |
| 5·15 디자이너(Opus·GPT) + Fable 컨펌 | Opus 안과 Fable 컨펌 반영 완료, GPT 안은 PC Codex로 대기 | `css/app.css` 토큰, `tools/agents/` |
| 6 계획을 사람별로 저장, 최근 5회 | 계정 vault, 계획마다 5회, 칩을 누르면 복원(되돌리기 가능) | `views/plan.js` renderHistoryChips |
| 7 로그인(마스터만) | 마스터는 해시만 저장, 개인 탭 잠금 → 이후 가입창 추가 | `core/auth.js`, `config/accounts.json` |
| 9·12 목표·노후 직관성, 지금 돈/나중 돈 | 질문형 단계, '그해 통장 숫자 / 오늘 돈' 스위치, 돈의 가치 막대(국밥 비유), "= 오늘 돈으로 X어치" | `plan.js` valueBridge, thenYear |
| 10 느림 | 계산 11초 → 0.04초, IndexedDB 캐시, 미리 받기, modulepreload | `core/plan.js`, `core/data.js`, `index.html` |
| 11 목돈 버튼이 안 눌림 | 결과 아래 '목돈' 구역: 나이 띠, 48px 큰 버튼 2개, 핀을 눌러 고치기, 띠를 누르면 그 나이에 추가 | `plan.js` lifeBar, editEvent |
| 13 넓은 화면 가로 배치 | 1280px 이상에서 4칸(1.2fr 1.2fr 1fr .9fr) | `css` `.bt-grid` |
| 14 최근 10개와 비교, 더 밝게 | 최근 실행 띠(불러오기·비교), 딤 다크 | `backtest.js` historyStrip |
| 16 "레버리지 etf는 빼고"가 안 됨 | 분류 제외: 레버리지·인버스·채권·현금·원자재·단일종목·커버드콜 | `nlp.js` findExcludeCats, `engine.js` excludeCats |
| 17 해석은 어떻게? | 규칙 기반 + 못 알아들은 말이 있으면 Claude 자동(키가 있을 때) | `nlp.js` leftoverWords, `backtest.js` interpret, `core/ai.js` |
| 최대 기간(20년?) | 미국·지수 1985년부터, 30년·최대 프리셋 | `tools/fetch_data.py`, `backtest.js` |
| 조건부 리밸런싱(SPY −15% 등) | 타이밍 '리밸런싱' 종류(trigger), 프리셋 dd15reb, 밴드 리밸런싱 | `core/signals.js` |
| 그래프에 최종 %와 CAGR | 선 끝 라벨 3줄(이름 / +520% / CAGR 20.0%) | `ui/charts.js`, `backtest.js` drawGrowth |
| 매수·매도 타이밍 | 프리셋 11개 + 직접 설정(이동평균·크로스·모멘텀·낙폭·RSI·VIX·볼린저·MACD·트레일링 스톱·변동성 맞추기), 다음 거래일 실행 | `signals.js`, `backtest.js` openTiming |
| 목표로 전략 추천(종목이 아닌 규칙) | 전략 찾기 탭 | `core/finder.js`, `views/finder.js` |
| 가입창(아이디·이메일·비번, DB 저장) | 가입·로그인 탭, 계정 저장소에 기억 | `auth.js` signup, `app.js` openLogin, `tools/apps_script/Code.gs` |
| Claude 넘김이 실제로 동작하나? | 실제 API를 호출한다. 가짜 키로 401을 받아 경로가 열려 있음을 확인 | `core/ai.js` |
| 문장 해석하면 P1이 사라짐, 비교 창에 P1·P2 | 여러 포트폴리오일 때 편집 중인 탭에만 넣기(되돌리기·'전부 새로 만들기'), 비교 창에 내 포트폴리오 켜고 끄기·새로 만들기 | `backtest.js` interpret, mergeIntoActive, openCompare, addPortfolio, run(inc) |
| 계정 저장소 배포 | 두 번 클릭 키트로 배포, 연결·동기화 확인 끝(1-2 ①) | `tools/apps_script/`, `config/backend.json` |

---

## 3. 파일 지도 (`stock/`)

| 파일 | 역할 |
|---|---|
| `index.html` | 탭 4개(개인 탭은 `priv` 클래스), 계정 버튼, 밝게/어둡게 버튼, modulepreload, 기본 테마 dark |
| `css/app.css` | 디자인 토큰(Opus A2 블록, 딤 다크)과 모든 스타일 |
| `js/app.js` | 탭 전환(TABS, PRIVATE_TABS), 로그인·가입 창(openLogin), 계정 메뉴, 설정(마스터 전용 백엔드 주소·연결 확인, 암호화 내보내기/가져오기), 시작 시 세션 복원·prefetch |
| `js/core/engine.js` | 백테스트 엔진: runStatic, runRank, applyTiming, alignSeries, fillDefensive |
| `js/core/signals.js` | 타이밍 지표와 규칙: ruleSeries, planTiming, TIMING_PRESETS, ruleText/condText |
| `js/core/finder.js` | 전략 찾기: buildCandidates, simulateMonthly, findStrategies, candToBacktest |
| `js/core/metrics.js` | CAGR·MDD·변동성·샤프 등 지표 |
| `js/core/plan.js` | 목표·노후 계산과 역산 |
| `js/core/nlp.js` | 자연어 조건 해석 |
| `js/core/comment.js` | 진단과 다시 계산한 대안 |
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
| `js/views/plan.js` | 목표·노후 화면 |
| `js/views/assets.js` | 내 자산 화면 |
| `config/accounts.json` | 마스터 계정(h, salt, iter 310000, ver, role master, name 석스). 해시만 들어 있다. |
| `config/backend.json` | 계정 저장소 웹 앱 주소(2026-11-21 연결) |
| `data/` | 시세 DB(8절) |
| `tools/fetch_data.py`, `tools/universe_seed.py` | 시세 수집기, 종목 목록 |
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

### 목표·노후 (`plan.js`)
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
- ss.plans, ss.holdings, ss.snapshots, ss.bt, ss.btHistory, ss.planHistory, ss.priv, ss.finder
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
- 한국식: 상승은 빨강, 하락은 파랑. 마이너스는 U+2212(−).

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
- 탭바는 4칸. 900px 미만에서는 data-stamp를 숨긴다.

**그래프 (`charts.js`)**
- 선 끝 라벨은 rich 서식 `{n|이름}\n{v|+520%}\n{c|CAGR 20.0%}`, 겹침은 moveOverlap으로 피한다. 오른쪽 여백 118.
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

**수집기와 주의**
- 수집기는 `tools/fetch_data.py`와 `tools/universe_seed.py`. `__pycache__`는 `tools/.gitignore`로 뺀다.
- Actions에서 FRED가 시간 초과된 적이 있어서, 원/달러 보충은 로컬에서 하고 커밋했다.

---

## 9. 테스트·검증 도구

**테스트 (`tests/`)**
- `run.mjs`: 퀀트 기대값 96개와 포트폴리오 비주얼라이저 대조. CAGR 11.44 vs 11.46, 변동성 12.29 vs 12.3, MDD −25.69 vs −25.7.
- `timing_check.mjs` 20개, `finder_check.mjs`(추천 결과, 일별 엔진과 일치), `nlp_check.mjs`, `rank_check.mjs`, `pv_check.mjs`
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
- 화면을 바꾸면 shot.py 두 장
- 색을 바꾸면 verify.mjs

---

## 10. 협업 방식

**디자인**
- Opus 디자이너(Agent, 디자인 전담)가 제안 문서를 쓴다.
- Fable(Agent, model: fable)이 컨펌하고 수정을 지시한다. 그 뒤에 반영한다.
- 디자이너 에이전트가 중간에 멈추면 이미 쓴 문서로 진행했다.

**GPT 디자이너**
- 사용자 PC의 Codex CLI로 한다.
- 브리프와 판정 규칙: `tools/agents/gpt_color_brief.md`

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
- 사용자가 화면 조작(computer use)을 긴급 중지한 적이 있다. 화면을 봐야 하면 먼저 묻는다. 대신 파일 기록으로 상태를 읽는다.

**사용자 선호**
- 문제를 지적할 때는 구체적인 대안을 함께 낸다.
- 화면 글은 쉬운 한국어로 쓰고, 설명 없이도 알 수 있는 UI를 만든다.
- 포트폴리오가 바뀌면 메모리에 기록한다.

---

## 11. 알려진 한계·주의
- **생존 편향**: 종목 목록이 '오늘' 기준이다. poolTop 50으로 줄였지만, 완전히 없애려면 과거 대형주 목록이 필요하다(다음 후보).
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

그 사이의 'stock: 시세 갱신 …'은 봇 커밋이다.
