# Seok's Stock — 에이전트(Codex) 작업 안내

한국·미국 주식·ETF 백테스트 웹앱(정적 사이트, ES 모듈 + ECharts). 구조는 README.md, 규칙은 CLAUDE.md와 같다.

- 화면 글은 한국어, 마이너스 U+2212, 상승 빨강·하락 파랑. 색은 `css/app.css` 토큰만.
- 계산을 바꾸면 `node tests/run.mjs`, `node tests/timing_check.mjs`, `node tests/finder_check.mjs` 통과 확인.
- Claude(Claude Code)에게 묻기: `claude -p "질문"` — 출력만 받는 비대화 모드. 긴 질문은 파일 내용을 넘긴다.
- 색·디자인 제안을 요청받으면 `tools/agents/gpt_color_brief.md`의 형식(토큰 이름 그대로, 밝은·어두운 테마 HEX 표)으로 답한다.
