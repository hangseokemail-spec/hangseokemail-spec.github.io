# Seok's Stock — Claude Code 작업 안내

한국·미국 주식·ETF 백테스트, 전략 찾기, 목표·노후 설계, 내 자산 관리 웹앱(정적 사이트, 빌드 없음). 자세한 구조는 README.md. **작업을 이어받을 때는 `HANDOFF.md`(세부 지침서: 현재 상태·대기 중인 일·계산 규칙·보안 규칙)를 먼저 읽는다.**

## 규칙
- 화면 글은 한국어. 마이너스는 U+2212(−), 상승 빨강·하락 파랑(한국식). 색은 `css/app.css` 토큰만 쓴다.
- 계산을 바꾸면 반드시 `node tests/run.mjs`(96개), `node tests/timing_check.mjs`, `node tests/finder_check.mjs`를 돌려 통과를 확인한다.
- 개인 데이터는 계정별 암호화 저장소(`js/core/auth.js`)로만. 비밀번호·키 원문을 저장소에 커밋하지 않는다.
- 커밋 전 `git pull --rebase`(시세 봇이 자주 커밋함).

## GPT(Codex CLI)와 협업하기
이 PC에는 Codex CLI(`codex`)가 있다. 두 번째 의견이 필요할 때(색·디자인 제안, 코드 검토, 다른 해법) Codex에게 물어 결과를 받아 쓴다.

- 짧은 질문: `codex exec --skip-git-repo-check "질문"` — 마지막 답이 표준출력으로 나온다.
- 긴 질문: 질문을 파일로 쓰고 PowerShell에서 `codex exec --skip-git-repo-check (Get-Content .\tools\agents\ask.md -Raw)` 또는 `-o .\tools\agents\answer.md`로 답을 파일에 받는다.
- 제안만 받을 때는 질문 첫 줄에 "파일을 고치지 말고 제안만 해 줘"를 넣고, 가능하면 `--sandbox read-only`를 붙인다(옵션 이름은 `codex exec --help`로 확인).
- 받은 답은 제안일 뿐이다. 수치(대비비·색각이상 구분)는 `node tools/design_check/verify.mjs`로 직접 계산해 확인하고, 통과한 것만 반영한다.
- 색 제안 받기: `tools/agents/gpt_color_brief.md`를 그대로 보내고, 받은 안은 같은 파일 아래쪽 '받아들이는 규칙'으로 판정한다.

## Codex가 Claude에게 물을 때
Codex 쪽에서는 `claude -p "질문"`(출력만 받는 모드)으로 이 저장소에 대해 Claude에게 물을 수 있다. 같은 내용이 `AGENTS.md`에 있다.
