파일을 고치지 말고 제안만 해 줘.

너는 금융 대시보드 웹앱의 시니어 UI 컬러 디자이너야. 이 저장소의 `stock/` 앱(Seok's Stock: 한국어 투자 웹앱 — 백테스트, 전략 찾기, 목표·노후, 내 자산)의 색을 검토해 줘. 현재 토큰은 `stock/css/app.css` 맨 위 `:root`(밝은)와 `:root[data-theme="dark"]`(어두운, 기본)에 있어. 사용자는 "전체 색이 약간 더 밝았으면" 했고, 지금은 어두운 테마를 한 단계 밝힌 '딤 다크'가 기본이야.

조건
- 한국식 등락색 유지(상승 빨강, 하락 파랑)
- 숫자가 많은 화면이라 본문 대비 WCAG AA 이상
- 그래프 계열색: 포트폴리오 3개 + 비교 대상 최대 6개가 한 그래프에 겹쳐도 구분, 색각이상자도 구분
- 상태색(좋음/주의/경고)은 계열색과 겹치지 않게, 차분하고 신뢰감 있는 톤

출력: 아래 이름 그대로, 밝은 테마와 어두운 테마 각각 HEX 값을 표로.
bg-page, bg-surface, bg-sunken, bg-hover, bg-selected, border, border-strong, text-1, text-2, text-3, accent, accent-hover, on-accent, up, down, st-caution, st-caution-bg, st-warning, st-warning-bg, st-good, st-good-bg, series-1, series-2, series-3, series-bm, compare-1~6, cat-1~8
그리고 지금 값과 비교해 무엇이 왜 나은지 5줄, 주요 텍스트 대비비.

---
## 받아들이는 규칙(Claude가 판정, Fable 컨펌 2026-11-21)
변수 이름은 그대로, HEX만 바꾼다. `node tools/design_check/verify.mjs <제안을 반영한 css 경로>`로 계산해 전부 통과한 묶음만 교체한다.
- 글자 대비: text-1·2·3 × bg-surface·page·sunken ≥ 4.5:1, text-3/bg-hover ≥ 4.5:1
- 등락색: up·down × bg-surface·sunken ≥ 4.5:1, up은 빨강(OKLCH 색상각 10~35°), down은 파랑(250~275°)
- 강조색: accent/bg-surface ≥ 4.5:1, on-accent/accent ≥ 4.5:1
- 선·테두리: 계열·비교색, border-strong × bg-surface ≥ 3:1
- 계열 구분: P1 + 비교 1~3 모든 쌍 일반 ΔE ≥ 15, 색각이상 ≥ 8. 9색 전체는 지금(13.0 / 7.0)보다 나빠지지 않을 것. 계열·비교색 × up·down ΔE ≥ 12
- 어두운 바탕: bg-page OKLCH L 0.24~0.32
- 바꾸는 단위: 가(바탕·글자) / 나(강조) / 다(계열·비교 10색 한 세트) / 라(등락·상태, 같은 색 계열 안에서만). 글꼴·간격·크기는 받지 않는다.
- 못 넘은 묶음은 어느 쌍이 몇 대 몇으로 떨어졌는지와 가장 가까운 통과 값을 사용자에게 돌려준다.
