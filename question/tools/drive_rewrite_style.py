#!/usr/bin/env python3
"""drive_rewrite_text.py 2단계. 새 글을 넣은 뒤 다시 읽은 문서에서, 실제 위치로 문단 모양·굵게·목록 요청을 만든다.
사용: python3 drive_rewrite_style.py <작업폴더> <read_doc 저장 파일> <출력 json>
'Q. '로 시작하는 문단부터 새 글 문단 수만큼을 기대한 글과 하나씩 맞춰 보고, 다르면 멈춘다."""
import json, re, sys
src = open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(sys.argv[0])), 'drive_rewrite_text.py'), encoding='utf-8').read()
parse = src.split('# ---------- 기존 문서에서 지울 구간 ----------')[0]
work, docpath, outpath = sys.argv[1:4]
sys.argv = [sys.argv[0], work, docpath, outpath]
exec(parse)   # paras, u16 정의
d = json.load(open(docpath, encoding='utf-8')); d = d.get('content', d)
rev = d['revisionId']; tab = d['tabs'][0]
content = tab['documentTab']['body']['content']
ps_ = [el for el in content if 'paragraph' in el]
txt = lambda el: ''.join(r.get('textRun', {}).get('content', '') for r in el['paragraph']['elements'])
i0 = next(i for i, el in enumerate(ps_) if txt(el).startswith('Q. '))
spans = []
bad = 0
for k, (style, t, bolds, bullet) in enumerate(paras):
    el = ps_[i0 + k]
    if txt(el) != t + '\n':
        bad += 1; print('MISMATCH', k, repr(txt(el)[:60]), '!=', repr(t[:60]))
    spans.append((el['startIndex'], el['endIndex'], style, t, bolds, bullet))
nxt_el = ps_[i0 + len(paras)]
print('next paragraph after new text:', repr(txt(nxt_el)[:20]), nxt_el['paragraph']['paragraphStyle'].get('namedStyleType'))
if bad: sys.exit('text mismatch: fix before styling')
R = lambda a, b: {'startIndex': a, 'endIndex': b}
start, end = spans[0][0], spans[-1][1]
reqs = [{'updateTextStyle': {'range': R(start, end), 'textStyle': {}, 'fields': 'bold,italic,underline,link,foregroundColor'}}]
groups = []
for i, (a, b, style, t, bolds, bullet) in enumerate(spans):
    nx = spans[i + 1] if i + 1 < len(spans) else None
    gap = style == 'NORMAL_TEXT' and (not bullet or not (nx and nx[5]))
    key = (style, gap)
    if groups and groups[-1][2] == key and groups[-1][1] == a: groups[-1][1] = b
    else: groups.append([a, b, key])
F = 'namedStyleType,spaceAbove,spaceBelow,indentStart,indentFirstLine'
for a, b, (style, gap) in groups:
    ps = {'namedStyleType': style}
    if gap: ps['spaceBelow'] = {'magnitude': 8, 'unit': 'PT'}
    reqs.append({'updateParagraphStyle': {'range': R(a, b), 'paragraphStyle': ps, 'fields': F}})
for a, b, style, t, bolds, bullet in spans:
    for x, y in bolds:
        reqs.append({'updateTextStyle': {'range': R(a + x, a + y), 'textStyle': {'bold': True}, 'fields': 'bold'}})
i = 0
while i < len(spans):
    if spans[i][5]:
        j = i
        while j + 1 < len(spans) and spans[j + 1][5]: j += 1
        reqs.append({'createParagraphBullets': {'range': R(spans[i][0], spans[j][1] - 1), 'bulletPreset': 'BULLET_DISC_CIRCLE_SQUARE'}})
        i = j + 1
    else: i += 1
out = {'requests': reqs, 'writeControl': {'requiredRevisionId': rev}}
json.dump(out, open(outpath, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('ok', len(reqs), 'requests', len(json.dumps(out, ensure_ascii=False, separators=(',', ':'))), 'bytes')
