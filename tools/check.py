#!/usr/bin/env python3
"""가판대 화면 점검 — 고친 뒤 올리기 전에 돌린다.

    python3 tools/check.py            # 기기 7가지 × 탭마다
    python3 tools/check.py market     # 한 탭만

이 저장소 맨 위를 작은 서버로 띄우고(가판대 파일은 내 컴퓨터 것, 각 프로그램 데이터는 실제 사이트 것),
휴대폰·태블릿·PC 크기마다 탭을 하나씩 눌러 아래를 확인한다.
  - 자바스크립트 오류가 없는가
  - 같은 탭 카드의 높이가 모두 같은가, 같은 줄 카드의 위쪽이 맞는가
  - 가로로 넘치지 않는가
  - 탭을 누른 뒤 카드가 한 화면(창 높이) 안에 들어오는가 — 안 들어오면 '넘침 N px'로 알려 줌(휴대폰 목록은 원래 내려 읽음)
화면은 /tmp/hub_check/<기기>_<탭>.png 로 남는다(Read로 열어 눈으로 본다).
필요한 것: pip install playwright && playwright install chromium
"""
import asyncio, functools, http.server, json, os, socketserver, sys, threading

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = '/tmp/hub_check'
DEVICES = [  # 이름, 너비, 높이, 휴대 기기
    ('pc', 1280, 900, False), ('laptop', 1366, 768, False), ('wide', 1536, 864, False),
    ('tab_v', 820, 1180, True), ('tab_h', 1180, 820, True), ('phone_v', 390, 844, True), ('phone_h', 844, 390, True),
]
MEASURE = """() => {
  const cards = [...document.querySelectorAll('#grid .card')].filter(c => !c.hidden);
  const rs = cards.map(c => c.getBoundingClientRect());
  const hs = [...new Set(rs.map(r => Math.round(r.height)))];
  const rows = {}; rs.forEach(r => { const k = Math.round(r.top / 40); (rows[k] = rows[k] || []).push(Math.round(r.top)); });
  const misaligned = Object.values(rows).filter(t => Math.max(...t) - Math.min(...t) > 8).length;
  return { n: cards.length, ids: cards.map(c => c.dataset.id), heights: hs, misaligned,
    bottom: rs.length ? Math.round(Math.max(...rs.map(r => r.bottom))) : 0, vh: innerHeight,
    hscroll: document.documentElement.scrollWidth > innerWidth + 1,
    cw: getComputedStyle(document.querySelector('#main')).getPropertyValue('--cw').trim() };
}"""


def serve():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=ROOT)
    httpd = socketserver.TCPServer(('127.0.0.1', 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return f'http://127.0.0.1:{httpd.server_address[1]}/'


async def main(only):
    from playwright.async_api import async_playwright
    os.makedirs(OUT, exist_ok=True)
    url = serve()
    async with async_playwright() as p:
        try:
            b = await p.chromium.launch(channel='chrome', args=['--no-sandbox'])
        except Exception:
            b = await p.chromium.launch(args=['--no-sandbox'])
        problems = 0
        for name, w, h, mobile in DEVICES:
            ctx = await b.new_context(viewport={'width': w, 'height': h}, is_mobile=mobile, has_touch=mobile,
                                      device_scale_factor=2 if mobile else 1, locale='ko-KR', timezone_id='Asia/Seoul')
            pg = await ctx.new_page()
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(url, wait_until='networkidle', timeout=60000)
            await pg.wait_for_timeout(1800)
            tabs = await pg.evaluate("() => [...document.querySelectorAll('.tab')].map(b => b.dataset.tab)")
            for t in tabs:
                if only and t != only:
                    continue
                await pg.evaluate('() => scrollTo(0, 0)')
                await pg.click(f'.tab[data-tab="{t}"]')
                await pg.wait_for_timeout(900)
                m = await pg.evaluate(MEASURE)
                await pg.mouse.move(1, 1)
                await pg.screenshot(path=f'{OUT}/{name}_{t}.png')
                flags = []
                if len(m['heights']) > 1: flags.append(f"높이 제각각 {m['heights']}")
                if m['misaligned']: flags.append(f"줄 어긋남 {m['misaligned']}줄")
                if m['hscroll']: flags.append('가로 넘침')
                over = m['bottom'] - m['vh']
                if over > 0 and not name.startswith('phone') and t not in ('all',): flags.append(f'넘침 {over}px')
                problems += bool([f for f in flags if not f.startswith('넘침')])
                print(f"{name:8} {t:9} 카드 {m['n']} 너비 {m['cw'] or '-':>6} 높이 {m['heights']} "
                      f"{'· ' + ' · '.join(flags) if flags else '· 좋음'}")
            if errs:
                problems += 1
                print(f'{name:8} 오류: {errs[:3]}')
            await ctx.close()
        await b.close()
    print(f'\n화면: {OUT}/  ·  꼭 고칠 문제 {problems}건 (넘침은 참고)')


if __name__ == '__main__':
    asyncio.run(main(sys.argv[1] if len(sys.argv) > 1 else None))
