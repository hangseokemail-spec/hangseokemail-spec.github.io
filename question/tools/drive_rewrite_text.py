#!/usr/bin/env python3
"""이미 올린 구글 문서(같은 링크)의 '질문~출처 앞' 구간을 고친 answer.md + body.md 로 통째로 바꾸는 1단계.

쓰는 때: 문장을 많이 고쳐서 replaceAllText로는 일이 많을 때(Q03 문장 다듬기, 2026.11.20).
순서:
  1. read_doc → 결과가 크면 저장 파일 경로가 나와요.
  2. python3 drive_rewrite_text.py <작업폴더> <read_doc 저장 파일> <출력 json> --text-only
     → 출력의 requests(지우기+넣기 두 개)와 writeControl을 update_doc에 그대로 보내요.
  3. 다시 read_doc → python3 drive_rewrite_style.py <작업폴더> <새 저장 파일> <출력 json>
     → 넣은 글이 기대한 글과 한 글자도 다르지 않은지 확인하고, 실제 위치로 제목·굵게·목록·문단 간격 요청을 만들어요.
     → 그 requests와 writeControl을 update_doc에 보내요. 끝나면 다시 읽어 docs_index.py outline으로 확인해요.
--text-only 없이 돌리면 한 번에 보낼 요청(지우기+넣기+모양)을 만들어요. 글을 손으로 옮길 때 한 글자만 틀려도 위치가 어긋나니 두 단계를 권해요.
- 문서 구조: [제목 H1][사이트 링크 문단][Q. 질문(굵게)][덧붙인 질문][답 문단들][본문 ...][출처 H2][출처 목록][기준일 문단]
- 'Q. '로 시작하는 문단부터 '출처' 제목 바로 앞까지 지우고 새 글을 넣는다. 출처 목록과 기준일 문단은 그대로 둔다.
"""
import json, re, sys

work, docpath, outpath = sys.argv[1:4]
TEXT_ONLY = '--text-only' in sys.argv

def u16(s):
    return len(s.encode('utf-16-le')) // 2

# ---------- 새 글을 문단 목록으로 ----------
paras = []  # (style, text, [(bold_start, bold_end) in utf16 offsets within text], bullet)

def add_md_para(text, style='NORMAL_TEXT', bullet=False, all_bold=False):
    out, bolds, pos = '', [], 0
    parts = re.split(r'(\*\*[^*]+\*\*)', text)
    for p in parts:
        if p.startswith('**') and p.endswith('**') and len(p) > 4:
            inner = p[2:-2]
            bolds.append((u16(out), u16(out) + u16(inner)))
            out += inner
        else:
            out += p
    if all_bold:
        bolds = [(0, u16(out))]
    paras.append((style, out, bolds, bullet))

ans = open(f'{work}/answer.md', encoding='utf-8').read().strip().split('\n')
q1, q2 = ans[0].strip(), ans[1].strip()
add_md_para('Q. ' + q1.replace('**', ''), all_bold=True)
if q2:
    add_md_para(q2.replace('**', ''))
for p in re.split(r'\n\s*\n', '\n'.join(ans[2:]).strip()):
    if p.strip():
        add_md_para(p.strip().replace('**', '').replace('\n', ' '))

body = open(f'{work}/body.md', encoding='utf-8').read()
body = body.split('\n### 출처')[0]
buf = []
def flush():
    if buf:
        add_md_para(' '.join(s.strip() for s in buf))
        buf.clear()
for line in body.split('\n'):
    s = line.rstrip()
    if not s.strip():
        flush(); continue
    if s.startswith('#### '):
        flush(); add_md_para(s[5:].strip(), 'HEADING_3'); continue
    if s.startswith('### '):
        flush(); add_md_para(s[4:].strip(), 'HEADING_2'); continue
    if re.match(r'^\s*[-*] ', s):
        flush(); add_md_para(re.sub(r'^\s*[-*] ', '', s), bullet=True); continue
    if re.match(r'^\*\*[^*]+\*\*$', s.strip()):   # 굵은 이름표 한 줄(예: **이번 주**)
        flush(); add_md_para(s.strip()); continue
    buf.append(s)
flush()

# ---------- 기존 문서에서 지울 구간 ----------
d = json.load(open(docpath, encoding='utf-8'))
d = d.get('content', d)
rev = d['revisionId']
tab = d['tabs'][0]
tab_id = tab['tabProperties']['tabId']
content = tab['documentTab']['body']['content']
def ptext(el):
    return ''.join(r.get('textRun', {}).get('content', '') for r in el['paragraph']['elements'])
start = end = None
for el in content:
    if 'paragraph' not in el:
        continue
    t = ptext(el)
    if start is None and t.startswith('Q. '):
        start = el['startIndex']
    if start is not None and el['paragraph']['paragraphStyle'].get('namedStyleType') == 'HEADING_2' and t.strip() == '출처':
        end = el['startIndex']
        break
assert start and end, (start, end)

# ---------- 요청 만들기 ----------
full = ''.join(t + '\n' for _, t, _, _ in paras)
one_tab = len(d['tabs']) == 1 and not tab.get('childTabs')
def R(a, b):
    r = {'startIndex': a, 'endIndex': b}
    if not one_tab: r['tabId'] = tab_id
    return r
def L(i):
    r = {'index': i}
    if not one_tab: r['tabId'] = tab_id
    return r
reqs = [
    {'deleteContentRange': {'range': R(start, end)}},
    {'insertText': {'location': L(start), 'text': full}},
    {'updateTextStyle': {'range': R(start, start + u16(full)),
                         'textStyle': {}, 'fields': 'bold,italic,underline,link,foregroundColor'}},
]
if TEXT_ONLY:
    reqs = reqs[:2]
pos = start
spans = []
for style, t, bolds, bullet in paras:
    a, b = pos, pos + u16(t) + 1
    spans.append((a, b, style, t, bolds, bullet))
    pos = b
groups = []  # (a, b, key) 같은 문단 모양이 이어지면 한 요청으로
for i, (a, b, style, t, bolds, bullet) in enumerate(spans):
    nxt = spans[i + 1] if i + 1 < len(spans) else None
    gap = style == 'NORMAL_TEXT' and (not bullet or not (nxt and nxt[5]))  # 일반 문단·목록 마지막 항목 아래 8pt
    key = (style, gap)
    if groups and groups[-1][2] == key and groups[-1][1] == a:
        groups[-1][1] = b
    else:
        groups.append([a, b, key])
F = 'namedStyleType,spaceAbove,spaceBelow,indentStart,indentFirstLine'
for a, b, (style, gap) in ([] if TEXT_ONLY else groups):
    ps = {'namedStyleType': style}
    if gap:
        ps['spaceBelow'] = {'magnitude': 8, 'unit': 'PT'}
    reqs.append({'updateParagraphStyle': {'range': R(a, b), 'paragraphStyle': ps, 'fields': F}})
for a, b, style, t, bolds, bullet in ([] if TEXT_ONLY else spans):
    for x, y in bolds:
        reqs.append({'updateTextStyle': {'range': R(a + x, a + y), 'textStyle': {'bold': True}, 'fields': 'bold'}})
# 목록: 이어진 항목끼리 한 번에
i = 0
while not TEXT_ONLY and i < len(spans):
    if spans[i][5]:
        j = i
        while j + 1 < len(spans) and spans[j + 1][5]:
            j += 1
        reqs.append({'createParagraphBullets': {'range': R(spans[i][0], spans[j][1] - 1),
                     'bulletPreset': 'BULLET_DISC_CIRCLE_SQUARE'}})
        i = j + 1
    else:
        i += 1

out = {'documentId': d['documentId'], 'requests': reqs, 'writeControl': {'requiredRevisionId': rev}}
json.dump(out, open(outpath, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('paragraphs', len(paras), 'requests', len(reqs), 'delete', start, end, 'insert chars', len(full), 'json bytes', len(json.dumps(out, ensure_ascii=False, separators=(',', ':'))))
