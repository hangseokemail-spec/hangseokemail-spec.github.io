# Seok's Stock

https://hangseokemail-spec.github.io/stock/ — 한국·미국 주식·ETF 백테스트, 목표·노후 자금 설계, 내 자산 관리를 한 화면에서 하는 웹앱.

## 화면
- **로그인·가입**: 아이디·이메일·비밀번호로 가입, 계정별로 개인 데이터를 암호화해 저장. 계정 저장소(구글 Apps Script, `tools/apps_script/Code.gs`, 주소는 `config/backend.json`)가 연결되면 어느 기기에서든 같은 계정·데이터.
- **백테스트**: 말로 조건을 쓰면(예: "최근 3년간 시총 1~3위 미국 주식을 매달 말일 리밸런싱하면?") 조건 문장으로 되돌려 보여주고 바로 계산. 직접 종목·비중을 넣는 방식, 순위 전략(시총·모멘텀·저변동성 상위 N, 레버리지·인버스 등 제외), 리밸런싱(주기·밴드·조건), 매수·매도 타이밍(이동평균·크로스·모멘텀·낙폭·RSI·VIX·볼린저·MACD·트레일링 스톱·변동성 맞추기), 적립·인출, 원화/달러 기준, 비교 대상 최대 6개(지수·종목·지난 실행), 최근 실행 10개, 문제마다 다시 계산한 대안.
- **전략 찾기**: 목표 연수익률·최대 낙폭·기간 → 규칙 조합 수백 개를 월 단위로 시험해 목표를 지킨 규칙을 추천(산점도, 앞·뒤 절반 일관성).
- **목표·노후**: 계획 여러 개, 목표 금액 모드/노후 자금 모드, 구간별 수익률, 연금(공무원·국민·사학 등), 목돈 이벤트, 오늘 가치/그때 가치, 역산(필요 월 적립·수익률·기간·생활비), 목표 vs 실제.
- **내 자산**: 계좌·소유자 구조, 총자산·일간 등락·배당(연 예상, 투자/시가 배당률, 월별, 캘린더), 도넛·트리맵, 위험 점검과 대안, 리밸런싱 도우미, 기록, 계좌 캡처 인식(Claude API 키가 있으면 Claude, 없으면 기기 안 OCR).

## 폴더
- `index.html`, `css/`, `js/` — 앱(빌드 없음, ES 모듈 + ECharts CDN)
  - `js/core/` 계산(순수 함수): `engine.js` 백테스트, `signals.js` 타이밍 지표·규칙, `finder.js` 전략 찾기, `metrics.js` 지표, `plan.js` 목표·노후, `nlp.js` 자연어 해석, `comment.js` 진단·대안, `holdings.js` 내 자산·위험, `auth.js` 로그인·암호화 저장, `ai.js` Claude API(선택)
- `config/` — `accounts.json` 마스터 계정(해시만, `tools/make_account.mjs`로 만듦), `backend.json` 계정 저장소 주소
  - `js/views/` 화면 세 개, `js/ui/` 공통(서식·차트·DOM)
- `data/` — 시세 데이터베이스(GitHub Actions가 갱신)
  - `universe.json` 종목 목록·최근 종가, `px/<키>.json` 일별 종가(분할 반영)·배당, `monthly_<그룹>.json` 순위 전략용 월간 표, `kr_all.json` 국내 전 종목·ETF 이름과 시세, `extra_tickers.txt` 추가 종목
- `tools/` — 수집기(`fetch_data.py`, `universe_seed.py`)
- `tests/` — 수치 검증(`node tests/run.mjs`: 퀀트 기대값 96개 + 포트폴리오 비주얼라이저 대조, `timing_check.mjs` 타이밍 20개, `finder_check.mjs` 전략 찾기)

## 데이터 갱신
`.github/workflows/stock-data.yml` — 화~토 06:40, 월~금 16:50(KST)에 마지막 저장일 이후만 받아 붙임(증분), 일요일에 전체 점검. 미국·지수는 1985년, 국내는 2000년부터(상장 이후). 원/달러는 2003년 이전을 FRED(DEXKOUS)로 보충.
`.github/workflows/stock-add-ticker.yml` — 제목이 `[종목 추가]`로 시작하는 이슈(저장소 주인)가 열리면 그 종목을 DB에 넣고 답글을 단 뒤 닫음. 앱의 종목 검색에서 ‘추가 요청’을 누르면 이 이슈가 열려요.
