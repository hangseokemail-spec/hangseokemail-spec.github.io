#!/usr/bin/env python3
"""가판대 요약 도우미: 각 프로그램의 '지금 최신 호'와 그 호 키를 hub.js와 같은 방식으로 계산하고,
summaries.json에 요약이 있는지 알려 준다.  사용: python3 tools/latest.py  (저장소 맨 위에서)"""
import json, re, sys, urllib.request
from datetime import datetime, timezone

SITE = 'https://hangseokemail-spec.github.io'

def get(u):
    url = u if u.startswith('http') else SITE + u
    with urllib.request.urlopen(urllib.request.Request(url, headers={'Cache-Control': 'no-cache'}), timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))

def path(o, p):
    if not p: return o
    for k in str(p).split('.'):
        if o is None: return None
        o = o[int(k)] if isinstance(o, list) and k.isdigit() else (o.get(k) if isinstance(o, dict) else None)
    return o

def fill(tpl, ctx):
    if tpl is None: return None
    def rep(m):
        v = path(ctx, m.group(1))
        if v is None: return ''
        return str(v).zfill(int(m.group(2))) if m.group(2) else str(v)
    return re.sub(r'\{([\w.]+)(?:\|pad(\d))?\}', rep, str(tpl))

def latest(p):
    s = p.get('source', {}); t = s.get('type', 'static')
    if t == 'index':
        raw = get(s['index']); lst = path(raw, s.get('list')) or []
        now = datetime.now(timezone.utc); dk = s.get('dateKey', 'date')
        if s.get('publishAt'):
            lst = [e for e in lst if not e.get(s['publishAt']) or datetime.fromisoformat(e[s['publishAt']]) <= now]
        lst = [e for e in lst if e and e.get(dk)]
        if not lst: return None
        lst.sort(key=lambda e: (str(e[dk]), float(e.get('no') or 0)), reverse=True)
        e = lst[0]; date = str(e[dk])[:10]; label = fill(s.get('label'), e) or ''
        return {'key': f'{date}|{label}', 'date': date, 'label': label, 'entry': e}
    if t == 'seoks-wind':
        w = get(s['wind']); vals = w['w']; i = len(vals) - 1
        while i >= 0 and vals[i] is None: i -= 1
        d = w['dates'][i + (len(w['dates']) - len(vals))]
        return {'key': d, 'date': d, 'label': f'미국 {d} 마감', 'entry': {'date': d}}
    if t == 'hub':
        d = get(s['feed']); return {'key': d.get('key') or d.get('date'), 'date': d.get('date'), 'label': d.get('label'), 'entry': d}
    return None  # static: 요약은 projects.json에 고정

def main():
    cfg = json.load(open('projects.json', encoding='utf-8'))
    sums = json.load(open('summaries.json', encoding='utf-8'))
    out = []
    for p in cfg['projects']:
        try: L = latest(p)
        except Exception as ex: out.append({'id': p['id'], 'error': str(ex)}); continue
        if not L: continue
        e = L['entry']
        out.append({
            'id': p['id'], 'name': p['name'], 'key': L['key'], 'label': L['label'],
            'has_summary': bool((sums.get(p['id']) or {}).get(L['key'])),
            'read': fill(p.get('read', ''), e),
            'tone': p.get('summaryTone', '한다체'),
        })
    print(json.dumps(out, ensure_ascii=False, indent=2))

if __name__ == '__main__':
    main()
