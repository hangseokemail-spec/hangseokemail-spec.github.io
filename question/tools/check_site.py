#!/usr/bin/env python3
"""사이트를 로컬에서 띄워 PC(1280)·휴대폰(390) 화면을 확인한다.

사용 (저장소 맨 위 폴더에서):
  python3 -m http.server 8765 >/dev/null 2>&1 &
  python3 question/tools/check_site.py q03 /tmp/shots
확인: 첫 화면 글, '자세히 보고 싶다면 클릭' 뒤 본문 소제목·차례 수, 굵은 글씨, 남은 '**', 콘솔 오류, 가로 넘침.
필요: pip install playwright --break-system-packages (브라우저는 /usr/bin/google-chrome 사용)
"""
import asyncio, os, sys
from playwright.async_api import async_playwright

qid = sys.argv[1] if len(sys.argv) > 1 else 'q01'
out = sys.argv[2] if len(sys.argv) > 2 else '/tmp/shots'
os.makedirs(out, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome')
        for name, vp in [('pc', {'width': 1280, 'height': 900}), ('m', {'width': 390, 'height': 844})]:
            pg = await b.new_page(viewport=vp)
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto(f'http://localhost:8765/question/#/t/{qid}')
            await pg.wait_for_timeout(1500)
            await pg.screenshot(path=f'{out}/{qid}_{name}_front.png')
            print(name, 'front:', (await pg.inner_text('.rfront'))[:300].replace('\n', ' | '))
            await pg.click('[data-readmore]')
            await pg.wait_for_timeout(1500)
            h3 = await pg.eval_on_selector_all('.prose h3', 'els=>els.map(e=>e.textContent)')
            toc = await pg.eval_on_selector_all('.rtoc li', 'els=>els.length')
            strong = await pg.eval_on_selector_all('.prose strong', 'els=>els.length')
            raw = await pg.eval_on_selector('.prose', 'e=>(e.innerText.match(/\\*\\*/g)||[]).length')
            wide = await pg.evaluate('document.documentElement.scrollWidth > window.innerWidth')
            print(name, 'h3:', h3, '\n   toc:', toc, 'strong:', strong, 'raw**:', raw, 'overflow:', wide, 'errs:', errs)
            await pg.screenshot(path=f'{out}/{qid}_{name}_body.png', full_page=False)
            await pg.close()
        await b.close()

asyncio.run(main())
