# Seok's Question

석스님의 질문에 다섯 분야 전문가(과학·역사·경제·인문·세상)가 각자 답하고 함께 의논해 하나로 모은 답을 모아 보는 사이트입니다. https://hangseokemail-spec.github.io/question/

## 구조
- `index.html`, `assets/`: 웹앱 (휴대폰·태블릿·PC 자동 배치)
- `data/index.json`: 분류와 질문 목록 (번호, 날짜, 분류, 제목, 탭 이름, 원래 질문, 5문장 압축 답, 보고서 파일, 드라이브 문서, 서재 링크)
- `data/q/qNN.md`: 보고서 본문 (마크다운. ```chart 블록은 Chart.js 그래프로 그려짐)

## 탭 규칙
- 첫 탭은 '질문 리스트': 분류별(맨 위 '거대 담론')로 모든 질문과 5문장 압축 답.
- 그다음 탭은 최근 질문 5개. 번호가 큰 순서로 자동 선택됩니다.
- 6번째 질문이 올라오면 가장 오래된 질문이 탭에서 빠져 '지난 질문'으로 옮겨집니다. 질문 리스트와 '지난 질문' 패널에서 계속 볼 수 있습니다.

## 새 질문 올리기
1. `data/q/qNN.md`에 보고서를 넣는다.
2. `data/index.json`의 `questions`에 항목을 더한다. 새 분류가 필요하면 `categories`에 더한다.
3. 원본은 구글 드라이브 `AI/Seok's Question DB` 폴더의 시트와 문서에 함께 보관한다.

## 도구 (`tools/`)
작업 순서와 규칙은 claude.ai 프로젝트 문서 '석스 질문 작업 지침'과 '석스 질문 세부 작업지침'에 있어요.
- `publish_q.py`: answer.md·body.md를 `data/q/qNN.md`와 `data/index.json`에 넣어요.
- `make_drive_md.py`, `md2drive.py`: 드라이브 문서용 마크다운과 HTML을 만들어요.
- `lint_text.py`: 지적받았던 문장 버릇(‘○○의 눈은’, ‘가운데 주제’, 새 말 만들기 등)을 찾아요.
- `check_site.py`: 로컬에서 PC·휴대폰 화면과 오류를 확인해요.
