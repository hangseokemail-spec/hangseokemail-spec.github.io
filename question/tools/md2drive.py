#!/usr/bin/env python3
"""마크다운을 구글 문서용 HTML로 바꾼다. ```chart 블록은 표 + 설명으로 바꾼다.

사용: python3 md2drive.py in.md out.html "문서 제목" "웹 주소"
필요하면: pip install markdown --break-system-packages
만든 HTML은 Drive create_file(mimeType text/html → Google 문서로 변환)로 올린다.
"""
import json, re, sys
import markdown

src, out, title, url = sys.argv[1:5]
md = open(src, encoding='utf-8').read()

def chart2table(m):
    try:
        cfg = json.loads(m.group(1))
    except Exception:
        return ''
    labels = cfg['data']['labels']; ds = cfg['data']['datasets']
    rows = ["| 항목 | " + " | ".join(d.get('label', '') for d in ds) + " |", "|---|" + "---|" * len(ds)]
    for i, l in enumerate(labels):
        cells = []
        for d in ds:
            v = d['data'][i] if i < len(d['data']) else None
            cells.append('—' if v is None else (f"{v:,}" if isinstance(v, int) else str(v)))
        rows.append(f"| {l} | " + " | ".join(cells) + " |")
    return "\n".join(rows) + "\n\n*그래프 자료: " + cfg.get('caption', '') + " (웹사이트에서 그래프로 볼 수 있어요)*\n"

md = re.sub(r"```chart\n(.*?)\n```", chart2table, md, flags=re.S)
head = f"<h1>{title}</h1>" + (f"<p>Seok's Question · <a href='{url}'>웹사이트에서 보기</a></p>" if url else '')
html = "<html><head><meta charset='utf-8'></head><body>" + head + markdown.markdown(md, extensions=['tables']) + "</body></html>"
open(out, 'w', encoding='utf-8').write(html)
print(len(html))
