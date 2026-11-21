import sys, asyncio, time, json
from playwright.async_api import async_playwright
async def main():
    url = sys.argv[1]; cpu = float(sys.argv[2]); net = sys.argv[3] if len(sys.argv)>3 else 'none'
    steps = [s.strip() for s in sys.stdin.read().split('\n---\n') if s.strip()]
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, device_scale_factor=2)
        pg = await ctx.new_page()
        cdp = await ctx.new_cdp_session(pg)
        await cdp.send('Emulation.setCPUThrottlingRate', {'rate': cpu})
        if net == '4g':
            await cdp.send('Network.enable'); await cdp.send('Network.emulateNetworkConditions', {'offline': False, 'latency': 150, 'downloadThroughput': 1.6e6/8*4, 'uploadThroughput': 750e3/8})
        logs=[]; pg.on('console', lambda m: logs.append(m.text)); pg.on('pageerror', lambda e: logs.append('ERR '+str(e)))
        t0=time.time(); await pg.goto(url, wait_until='load'); print('load', round(time.time()-t0,2))
        for s in steps:
            wait=800
            if s.startswith('WAIT '): wait=int(s.split()[1]); s=' '.join(s.split()[2:])
            t=time.time(); r = await pg.evaluate(s); print(round(time.time()-t,2), '=>', str(r)[:400])
            await pg.wait_for_timeout(wait)
        for l in logs[-10:]: print('log', l)
        await b.close()
asyncio.run(main())
