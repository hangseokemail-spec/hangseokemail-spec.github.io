import os, sys, asyncio, time
from playwright.async_api import async_playwright
# flow.py url w h outprefix ; LOGIN uses env SS_ID / SS_PW (never commit credentials); steps on stdin separated by '\n---\n'; 'SHOT name' takes screenshot
async def main():
    url, w, h, pre = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
    steps = [s.strip() for s in sys.stdin.read().split('\n---\n') if s.strip()]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1)
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(f'{m.type}: {m.text}') if m.type in ('error','warning') else None)
        pg.on('pageerror', lambda e: logs.append(f'PAGEERROR: {e}'))
        await pg.goto(url, wait_until='networkidle'); await pg.wait_for_timeout(1200)
        for s in steps:
            if s.startswith('SHOT '):
                name = s.split()[1]; full = 'full' in s
                await pg.screenshot(path=f'{pre}_{name}.png', full_page=full); print('shot', name); continue
            if s.startswith('LOGIN'):
                await pg.fill('#lg_id', os.environ['SS_ID']); await pg.fill('#lg_pw', os.environ['SS_PW']); await pg.click('#lg_go')
                await pg.wait_for_timeout(3500); print('login done', await pg.evaluate("document.querySelector('#accountBtn')?.textContent")); continue
            wait = 1500
            if s.startswith('WAIT '): wait = int(s.split()[1]); s = ' '.join(s.split()[2:])
            try:
                r = await pg.evaluate(s)
                if r is not None: print('=>', str(r)[:800])
            except Exception as e: print('STEP ERR', str(e)[:300])
            await pg.wait_for_timeout(wait)
        for l in logs[-30:]: print(l)
        await b.close()
asyncio.run(main())
