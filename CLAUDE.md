# 석스 가판대 — 이 저장소에서 가판대를 고치는 Claude에게

https://hangseokemail-spec.github.io/ 는 석스님(선생님)이 만든 것을 한 화면에 모아 보는 페이지다.
처음부터 끝까지 읽고 그대로 따른다. 형식의 자세한 설명은 README.md, 지금까지의 결정과 남은 일은 claude.ai 프로젝트 「석스 가판대」의 `claude/가판대-인수인계서.md`.

## 0. 범위 — 이 지침은 맨 위 폴더의 가판대 파일에만 해당한다
- 가판대 파일: `index.html` `hub.js` `home.js` `projects.json` `summaries.json` `manifest.webmanifest` `icons/` `tools/` `README.md` `CLAUDE.md` `.nojekyll`
- 같은 저장소의 `question/`(Seok's Question) `stock/`(Seok's Stock) `ai-guide/`(AI 잘 쓰는 법)는 **다른 작업의 앱**이다. 가판대 작업은 그 폴더를 고치지 않고, 그 앱 작업은 각 폴더의 지침을 따른다(stock은 `stock/CLAUDE.md`).
- 다른 작업이 가판대 파일을 고칠 수 있는 곳은 둘뿐: `summaries.json`에 자기 호의 요약 한 줄, `projects.json`에 자기 프로그램 등록 한 덩어리.

## 1. 꼭 지킬 것
- **한국어로만** 쓴다 — 보고, 진행 설명, 작업 목록, 커밋 메시지, 하위 에이전트 지시까지.
- **올리기 전에 반드시 `git pull --rebase`.** 이 저장소는 stock 시세 갱신(하루 몇 번 자동 커밋), stock·question 작업, '가판대 요약 쓰기' 예약, 주간지(SEOKONOMY) 채팅이 함께 고친다.
- 커밋 신원: `git -c user.name="hangseokemail-spec" -c user.email="hangseokemail-spec@users.noreply.github.com" commit …`
- 공개 저장소다. 키·비밀번호·개인 정보는 어디에도 쓰지 않는다.
- **선생님께 일을 넘기지 않는다.** 설정·예약·지침은 알아서 고치고, 보고는 한 일과 결과만. 선생님만 할 수 있는 일(로그인 등)만 한 번 짧게 말한다.
- 문제를 말할 때는 **구체적인 대안**을 함께 낸다(선생님 기본 요청).
- 고친 뒤에는 `python3 tools/check.py`로 화면을 점검하고, 올린 뒤에는 실제 주소에서 한 번 더 본다(GitHub Pages 반영 1~10분).
- 이 지침(CLAUDE.md)이나 README를 바꾸면 같은 작업 안에서 프로젝트 문서 `claude/가판대-인수인계서.md`도 맞게 고친다(대화에 프로젝트 도구가 있을 때).

## 2. 파일과 동작
| 파일 | 하는 일 |
|---|---|
| `projects.json` | 탭(`tabs`), 칸 순서(`groups`), 프로그램 목록(`projects`), 큰 제목(`headline`·`credit`), 미국 휴장일(`usMarketClosed`). **새 프로그램은 여기에 한 덩어리만 더한다.** |
| `hub.js` | 열 때마다 각 프로그램의 목록 JSON을 직접 읽어(캐시 없이) 최신 호 카드를 그린다. 20분마다·화면에 돌아올 때 다시 읽는다. 어댑터: `index`(목록 JSON) · `seoks-wind` · `guru13f` · `stock` · `hub`(hub.json 한 개) · `static` |
| `index.html` | 디자인 전부(애플 홈페이지 느낌, Pretendard + Playfair Display, Noto Serif KR 900). 반응형 4가지: PC·태블릿 가로(세로 카드) / 태블릿 세로·휴대폰 가로(가로 카드 2줄) / 휴대폰 세로(1줄 목록) / 낮은 가로 화면(압축) |
| `summaries.json` | `프로그램 id → 호 키 → 핵심 한 문장`. 호 키는 `python3 tools/latest.py`가 알려 준다 |
| `home.js` | 각 프로그램 화면의 떠 있는 '가판대' 단추(끌어서 옮기기, 기기마다 자리 기억) |
| `tools/latest.py` | 프로그램마다 최신 호 키, 요약 유무, 무엇을 읽고 쓸지(`read`·`summaryTone`) |
| `tools/check.py` | 기기 7가지 × 탭마다 오류·카드 높이·줄 맞춤·가로 넘침·한 화면 넘침 점검, 화면은 `/tmp/hub_check/` |

브라우저 저장(기기마다 따로, 서버로 안 보냄): `seoks-hub-seen-v1`(어느 호까지 눌러 봤나) · `seoks-hub-tab-v1`(마지막 탭, sessionStorage에도) · `seoks-home-pos-v1`(단추 자리) · `seoks-home-hint-v1`.
호 키: 목록형은 `날짜|라벨`(예 `2026-11-21|제7호`), 풍향계는 미국장 날짜, 13F는 분기 말 날짜, 도구·게임은 없음(읽음 표시 없음).

## 3. 지금 실린 것 (2026-11-21)
| 탭 | id | 이름 | 주소 | 주기(projects.json `schedule`) | 누가 발행 |
|---|---|---|---|---|---|
| 시장·투자 | news | Seok's Paper | /news/ | 화~토 06:20, 미국 휴장 다음 날 쉼(`usMarket`) | news-data 아침 신문 작업 |
| 시장·투자 | seoks | 증시 풍향계 | /seoks/?tab=wind | 화~토 06:20, `usMarket` | seoks 저장소 |
| 시장·투자 | seokonomy | SEOKONOMY | /news/seokonomy/ | 토 08:00 | 주간지 채팅(news-data `WEEKLY.md`) — 발행 뒤 summaries.json에 요약을 직접 넣음 |
| 시장·투자 | guru13f | 구루들의 움직임 | /guru13f/ | 분기마다(분기 말+45일) | guru13f 저장소 |
| 시장·투자 | stock | Seok's Stock | /stock/#backtest | 언제든(시세 매일 자동) | 이 저장소 stock/ 작업 |
| 과학 | bios | 바이오스 | /bios/ | 금 19:00 | 바이오스 예약(news-data seokscope) |
| 과학 | nova | Nova | /nova/ | 금 22:00(`publishAt`) | Nova 예약(nova 저장소) |
| 질문 | question | Seok's Question | /question/ | 비정기 | 이 저장소 question/ 작업 |
| 놀이 | gugutop | 구구탑 | http://3.34.169.45/ | 언제든 | 선생님 게임 서버 |

## 4. 선생님이 정한 화면·글 원칙 (바꾸지 않는다)
- 큰 제목 "매일 한 뼘씩, 세상 읽기." + 영화 크레딧처럼 "Directed by Seoks". 딱딱하지 않게, 표지가 잘 보이게.
- **요약은 그 호 전체를 관통하는 핵심 생각을 완결된 한 문장으로 직접 쓴다.** "이런 내용이 들어 있어요"·"~를 다룹니다" 금지, 원문 문장 잘라 붙이기 금지, 결론으로 맺거나 질문으로 끝냄, **말줄임표로 끝내지 않음**. 제목을 되풀이하지 않는다. Nova는 해요체, 나머지는 한다체. 요약이 없으면 아무 문장이나 넣지 말고 비워 둔다.
- 카드 요약은 **양쪽 정렬**(글자 사이 줄바꿈), 카드 제목은 낱말을 쪼개지 않고 두 줄 길이를 고르게. 앞으로 새 카드도 같게.
- **카드 크기는 모두 같고**, 같은 줄 카드는 위아래가 맞는다. 글은 자르지 않는다.
- **탭마다 한 화면에** 다 보이게: 탭을 누르면 탭 막대가 위에 붙도록 올리고, 넓은 화면에서 한 줄에 안 들어가면 카드 너비를 줄여(최소 200px) 한 줄에 담는다. 그래도 창 아래로 넘치면 `hub.js`가 판에 `.tight`를 붙여 카드 안 여백·줄 간격만 좁힌다(태블릿 세로는 표지 칸 33%). 좁혀도 안 들어가면 원래 크기로 둔다. 휴대폰 세로 목록은 제외. **표지 비율 3:4는 바꾸지 않는다** — 풍향계·13F·Stock·구구탑 SVG는 위아래 끝까지 글자가 있어 4:5로 자르면 잘린다. 높이 820px 이하 넓은 화면은 탭 막대 주변 여백도 줄인다.
- **읽음 표시**: 새 호를 안 눌렀으면 파란 점 + "새로 나왔어요/아직 안 봤어요", 누르면 "봤어요". '새로 나온 것' 탭과 '안 본 것' 알약.
- 다음 호 안내와 늦어짐 표시는 실제 발행 일정과 맞아야 한다. 일정이 바뀐 프로그램은 `schedule`을 바로 고친다.
- 휴대폰 홈 화면에 추가하면 앱처럼 열린다(manifest, icons). 서비스 워커는 두지 않는다(같은 주소의 다른 앱에 끼어들어서).

## 5. 할 일이 생겼을 때
- **새 프로그램 넣기**(선생님이 주소만 주면 끝까지 알아서):
  1. 그 사이트의 목록 JSON·호별 파일 구조를 읽고, 일정은 그 작업의 지침에서 확인한다(추측하지 않는다).
  2. `projects.json`에 한 덩어리: `id` `name` `kind` `desc` `group` `tab` `url` `schedule` `accent` `source` `cover` `read` `summaryTone`. 표지 그림이 없으면 그 프로그램다운 그림을 SVG로 그린다(풍향계 계기판, 13F 막대, Stock 곡선, 구구탑 탑, SEOKONOMY 지면처럼). 새 분야면 `tabs`에 탭과 `note`를 더하고, 그 탭 `note`도 고친다.
  3. 첫 호 요약을 직접 읽고 써서 `summaries.json`에 넣는다.
  4. 그 사이트 index.html 끝에 단추 한 줄(아래). 그 사이트가 다른 저장소·다른 작업 것이면 한 줄만 넣고 그 작업 지침에 "지우지 말 것"을 적어 둔다.
  5. `tools/check.py` → 커밋·푸시 → 실제 주소 확인 → README·인수인계서 표 갱신.
- **가판대 단추 한 줄**: `<!-- 석스 가판대로 돌아가는 단추: 가판대 저장소의 home.js (지우지 마세요) -->` + `<script src="https://hangseokemail-spec.github.io/home.js" defer></script>`. 아래쪽 단추와 겹치면 `data-lift="60"`. 넣지 않는 곳: 구구탑(아이들 전체 화면 게임 — 넣는다면 게임 🔧 메뉴 안), stock(머리에 '‹ 가판대' 링크가 있음). bios는 발행 때 news-data `seokscope/site/index.html`로 덮어쓰므로 그 원본에도 들어 있다.
- **요약**: 예약 「가판대 요약 쓰기 (매일 07:53·19:53·22:53)」(trig_01XA8qd26LEev9cTaikgUWeL)가 `tools/latest.py`에서 요약 없는 새 호만 읽고 써 넣는다(summaries.json만 고침). SEOKONOMY는 주간지 채팅이 직접 넣는다(이미 있으면 서로 건너뜀).
- **해마다 12월**: `projects.json`의 `usMarketClosed`에 다음 해 미국 휴장일을 더한다(news-data `config/us_market_holidays.json`과 같게). 지금 2026·2027년까지.
- **구구탑에 새 층이 열리면**: 구구탑의 `cover.reached`·`cover.floors`·`source.summary`.
- 예전 주소 `/?tab=…`은 `/seoks/`로 넘긴다(index.html 맨 앞 스크립트) — 지우지 않는다.
