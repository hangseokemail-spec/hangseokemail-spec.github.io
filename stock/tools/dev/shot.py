import sys, asyncio, json, time
from playwright.async_api import async_playwright
# usage: shot.py url out.png width height [js_before] [wait_ms]
async def main():
    url, out, w, h = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
    js = sys.argv[5] if len(sys.argv) > 5 else ''
    wait = int(sys.argv[6]) if len(sys.argv) > 6 else 4000
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        pg = await b.new_page(viewport={'width': w, 'height': h}, device_scale_factor=1)
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}'))
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        t0 = time.time()
        await pg.goto(url, wait_until='networkidle')
        if js:
            await pg.evaluate(js)
        await pg.wait_for_timeout(wait)
        await pg.screenshot(path=out, full_page=True)
        print('elapsed', round(time.time()-t0,2))
        for l in logs[-15:]: print(l)
        await b.close()
asyncio.run(main())
