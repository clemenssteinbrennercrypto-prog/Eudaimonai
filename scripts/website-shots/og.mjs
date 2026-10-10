// The link preview image (public/og.png, 1200 x 630) for shares on social and
// in messengers. Run after convert.py, since it uses the Lab score panel:
//
//   node scripts/website-shots/og.mjs
import { readFileSync } from 'node:fs'
import { webkit } from 'playwright-core'

const root = new URL('../../', import.meta.url)
const asset = name => `data:image/webp;base64,${readFileSync(new URL(`src/web/landing/assets/${name}`, root)).toString('base64')}`
const icon = `data:image/png;base64,${readFileSync(new URL('public/apple-touch-icon.png', root)).toString('base64')}`

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; margin: 0; }
  body { width: 1200px; height: 630px; background: #fff; color: #1D1D1F; overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Helvetica Neue", sans-serif; -webkit-font-smoothing: antialiased; }
  .brand { position: absolute; top: 56px; left: 72px; display: flex; align-items: center; gap: 14px;
    font-weight: 600; font-size: 16px; letter-spacing: .32em; text-transform: uppercase; }
  .brand img { width: 36px; height: 36px; border-radius: 9px; }
  h1 { position: absolute; top: 126px; left: 72px; font-size: 62px; line-height: 1; letter-spacing: -0.045em; font-weight: 700; white-space: nowrap; }
  h1 span { color: #86868B; }
  .shot { position: absolute; left: 72px; right: 72px; bottom: 56px; border-radius: 18px; overflow: hidden; box-shadow: 0 30px 70px rgba(0,0,0,.22); }
  .shot img { display: block; width: 100%; }
</style></head><body>
  <div class="brand"><img src="${icon}" alt="">Eudaimonai</div>
  <h1>Focus you can see. <span>Day after day.</span></h1>
  <div class="shot"><img src="${asset('lab-score.webp')}" alt=""></div>
</body></html>`

const browser = await webkit.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html)
await page.waitForTimeout(300)
const out = new URL('public/og.png', root)
await page.screenshot({ path: out.pathname })
await browser.close()
console.log('wrote public/og.png')
