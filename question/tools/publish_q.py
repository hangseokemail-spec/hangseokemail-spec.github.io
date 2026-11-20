#!/usr/bin/env python3
"""answer.md + body.md 를 사이트 자료(question/data)에 넣는다.

사용:
  QDATE=2026-11-20 python3 publish_q.py <작업폴더> <번호> <분류> <제목> <탭 이름> <판> [드라이브 주소]
예:
  QDATE=2026-11-20 python3 publish_q.py /home/claude/seoks-app/q04 4 edu "제목: 부제" "탭 이름" "1판" "https://docs.google.com/document/d/<ID>/edit"

- answer.md: 첫 줄 다듬은 질문, 둘째 줄 덧붙인 질문(없으면 빈 줄), 그 뒤 빈 줄로 나눈 답 문단들.
- body.md: 본문 전체. data/q/qNN.md 로 그대로 들어간다.
- 분류(category)는 data/index.json 의 categories id (grand, edu ...).
- 날짜는 환경변수 QDATE (없으면 오늘).
"""
import datetime, json, os, re, sys
from pathlib import Path

work, no, cat, title, tab, version = sys.argv[1:7]
drive = sys.argv[7] if len(sys.argv) > 7 else ''
no = int(no); qid = f'q{no:02d}'
SITE = Path(__file__).resolve().parent.parent          # .../question
DATE = os.environ.get('QDATE', datetime.date.today().isoformat())

raw = open(f'{work}/answer.md', encoding='utf-8').read().strip().split('\n')
def clean(s):
    s = re.sub(r'^\s*(#+|>|Q\.|[-*])\s*', '', s).strip()
    return s.replace('**', '')
q1 = clean(raw[0]); q2 = clean(raw[1]) if len(raw) > 1 else ''
rest = '\n'.join(raw[2:]).strip()
paras = [p.replace('**', '').strip() for p in re.split(r'\n\s*\n', rest) if p.strip()]
answer = '\n\n'.join(paras)

body = open(f'{work}/body.md', encoding='utf-8').read().strip() + '\n'
(SITE / 'data' / 'q' / f'{qid}.md').write_text(body, encoding='utf-8')

p = SITE / 'data' / 'index.json'
idx = json.loads(p.read_text(encoding='utf-8'))
entry = next((x for x in idx['questions'] if x['id'] == qid), None)
if entry is None:
    entry = {'no': no, 'id': qid}
    idx['questions'].append(entry)
entry.update({'date': DATE, 'category': cat, 'title': title, 'tab': tab,
              'question': f'{q1}\n{q2}' if q2 else q1, 'answer': answer,
              'file': f'data/q/{qid}.md', 'version': version})
if drive:
    entry['drive'] = drive
idx['questions'].sort(key=lambda x: x['no'])
idx['updated'] = DATE
p.write_text(json.dumps(idx, ensure_ascii=False, indent=1) + '\n', encoding='utf-8')
print('Q1:', q1); print('Q2:', q2); print('ANSWER:', answer)
