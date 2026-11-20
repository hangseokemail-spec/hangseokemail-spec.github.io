#!/usr/bin/env python3
"""answer.md + body.md 를 드라이브 문서용 마크다운(drive.md)으로 합친다.

사용:
  python3 make_drive_md.py <작업폴더> <판> [날짜 YYYY-MM-DD]
결과: <작업폴더>/drive.md  →  다음에 md2drive.py 로 HTML을 만든다.

순서: **Q. 다듬은 질문** → 덧붙인 질문 → 답 문단 → --- → 본문(제목 한 단계 올림) → --- → 기준일·판 안내.
"""
import datetime, re, sys

work, version = sys.argv[1:3]
date = sys.argv[3] if len(sys.argv) > 3 else datetime.date.today().isoformat()
y, m, d = (int(x) for x in date.split('-'))

raw = open(f'{work}/answer.md', encoding='utf-8').read().strip().split('\n')
clean = lambda s: re.sub(r'^\s*(#+|>|Q\.|[-*])\s*', '', s).strip().replace('**', '')
q1 = clean(raw[0]); q2 = clean(raw[1]) if len(raw) > 1 else ''
rest = '\n'.join(raw[2:]).strip()
paras = [p.replace('**', '').strip() for p in re.split(r'\n\s*\n', rest) if p.strip()]

body = open(f'{work}/body.md', encoding='utf-8').read().strip()
body = re.sub(r'^(#{2,6}) ', lambda mo: mo.group(1)[1:] + ' ', body, flags=re.M)  # ### -> ##

parts = [f'**Q. {q1}**']
if q2:
    parts.append(q2)
parts += paras + ['---', body, '', '---',
                  f'*{y}년 {m}월 {d}일 기준 · {version}. 다섯 전문가(과학·역사·경제·인문·세상)가 각자 답하고 협의한 뒤, '
                  '윤문 전문가가 글을 쓰고 한 번의 검토를 거쳐 다듬었어요.*']
open(f'{work}/drive.md', 'w', encoding='utf-8').write('\n\n'.join(parts) + '\n')
print('saved', f'{work}/drive.md')
