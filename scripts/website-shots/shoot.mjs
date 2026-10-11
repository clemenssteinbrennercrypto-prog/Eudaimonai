// Product screenshots for the public website, taken from the real app with
// sample data. seed.js builds the history in the page through the app's own
// scoring and save code, so every number on a screen is one the app computed.
//
// It runs in an isolated WebKit profile against the Vite dev server and only
// ever touches that profile's localStorage, never a real history.
//
//   npm install --no-save playwright-core@1.63.0
//   npx playwright-core install webkit
//   npm run dev -- --port 5191            (in another terminal)
//   node scripts/website-shots/shoot.mjs   (PNG files into .website-shots/)
//   python3 scripts/website-shots/convert.py   (WebP into src/web/landing/assets/)
//
// After a UI change, rerun all three and check that the numbers quoted in
// src/web/landing/LandingPage.jsx (DEMO_DAY) still match the Lab screenshot.
// The page.evaluate callbacks below run in the browser.
/* global document, location, localStorage, scrollX, scrollY, window */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { webkit } from 'playwright-core'

const BASE = process.env.SHOTS_BASE || 'http://localhost:5191'
const OUT = process.argv[2] || '.website-shots'
const TODAY = '2026-10-08T17:40:00'
const seedSource = readFileSync(new URL('./seed.js', import.meta.url), 'utf8')

mkdirSync(OUT, { recursive: true })
const browser = await webkit.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, colorScheme: 'dark' })
const page = await context.newPage()
await page.clock.setFixedTime(new Date(TODAY))
page.on('pageerror', error => console.error('pageerror', error.message))

await page.goto(`${BASE}/`)
const seeded = await page.evaluate(async ({ source, today }) => {
  // A blob module cannot resolve root paths, so point them at the dev server.
  const code = source.replaceAll("import('/src/", `import('${location.origin}/src/`)
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))
  return (await import(url)).seed({ today })
}, { source: seedSource, today: TODAY })
console.log('seeded', seeded)

// The landing page draws one real session's attention trace (the same session
// as the report screenshot), so export its timeline next to the images.
const trace = await page.evaluate(task => {
  const session = JSON.parse(localStorage.getItem('eudaimonia_sessions') || '[]').find(item => item.task === task)
  return {
    task: session.task,
    startedAt: session.startedAt,
    intervalSeconds: 5,
    scores: session.timeline.map(sample => sample.score),
  }
}, seeded.today[1])
writeFileSync(new URL('../../src/web/landing/assets/demo-session.json', import.meta.url), `${JSON.stringify(trace)}\n`)



// The unreleased "AI Companion · Soon" item and the dev build tag are not
// product, so they stay out of the pictures.
async function tidy() {
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('button, a, li')) {
      if (/^\s*AI Companion/.test(element.textContent || '')) element.style.visibility = 'hidden'
    }
    for (const element of document.querySelectorAll('*')) {
      if (element.childElementCount === 0 && /vdev/.test(element.textContent)) element.style.visibility = 'hidden'
    }
    // The amber dot on Protection means the dev build has no companion running.
    for (const link of document.querySelectorAll('button, a')) {
      if (!/^\s*Protection\s*$/.test(link.textContent || '')) continue
      for (const dot of link.querySelectorAll('*')) {
        const box = dot.getBoundingClientRect()
        if (box.width > 0 && box.width <= 10 && box.height <= 10 && !dot.querySelector('*') && !(dot.textContent || '').trim()) dot.style.visibility = 'hidden'
      }
    }
  })
}

// The nearest ancestor of a text that looks like a panel.
async function panelBox(text, { minWidth = 600, minHeight = 160, last = false } = {}) {
  const matcher = typeof text === 'string' ? new RegExp(`^\\s*${text}\\s*$`, 'i') : text
  const matches = page.getByText(matcher)
  const box = await (last ? matches.last() : matches.first()).evaluate((node, min) => {
    let element = node
    while (element && element !== document.body) {
      const rect = element.getBoundingClientRect()
      if (rect.width >= min.minWidth && rect.height >= min.minHeight) {
        return { x: rect.x + scrollX, y: rect.y + scrollY, width: rect.width, height: rect.height }
      }
      element = element.parentElement
    }
    return null
  }, { minWidth, minHeight })
  if (!box) throw new Error(`No panel around "${text}"`)
  return box
}

const pad = (box, by = 0) => ({ x: box.x - by, y: box.y - by, width: box.width + 2 * by, height: box.height + 2 * by })
const settle = (ms = 1500) => page.waitForTimeout(ms)
const shot = (name, options = {}) => page.screenshot({ path: `${OUT}/${name}.png`, ...options })

// Workspace: the two-display preset, shown in the 3D editor before saving.
await page.goto(`${BASE}/`)
await settle(1200)
await page.getByText('Two displays').click()
await settle(1500)
await tidy()
await shot('workspace')
await page.getByRole('button', { name: 'Save workspace' }).click()
await settle(1000)

// Lab, today.
await page.getByText('Lab', { exact: true }).first().click()
await settle(2500)
await tidy()
await shot('lab')
await shot('lab-score', { clip: pad(await panelBox('Focus score'), 0) })

// Week in review (last week).
await page.getByText('View week').click()
await settle()
await shot('week-review', { fullPage: true, clip: await panelBox('Week in review') })
await tidy()
await shot('mac-week')

// Session planner, with a name typed in.
await page.getByText('Session', { exact: true }).first().click()
await settle()
await page.getByPlaceholder(/Draft the launch narrative/).fill('Investor update draft')
await page.getByText('1h', { exact: true }).first().click()
await settle(600)
await tidy()
await shot('session-planner')

// Protection: the optional blocking setup.
await page.getByText('Protection', { exact: true }).first().click()
await settle()
for (const name of ['VS Code', 'Notion', 'Figma', 'YouTube', 'Instagram', 'TikTok', 'Reddit']) {
  await page.getByRole('button', { name: `+ ${name}` }).first().click()
  await page.waitForTimeout(200)
}
await settle(800)
await tidy()
// The rules only; the status row above them reports the dev build's missing
// companion, which no installed app shows.
await shot('protection', { clip: { x: 500, y: 300, width: 880, height: 500 } })
// The whole window for the website's Mac, without that dev-only status row.
await page.getByText('Companion not connected').first().evaluate(node => {
  let row = node
  while (row.parentElement && row.parentElement.getBoundingClientRect().height < 140) row = row.parentElement
  row.style.display = 'none'
})
await shot('mac-protection')
// Protection edits a draft; save it so leaving the screen isn't held up.
await page.getByRole('button', { name: 'Save setup' }).click()
await settle(800)

// Analytics: time of day, and one session's report.
await page.getByText('Analytics', { exact: true }).first().click()
await settle()
await page.getByText('Details', { exact: true }).first().click()
await settle(2000)
await shot('best-hours', { fullPage: true, clip: pad(await panelBox('Time of day', { minWidth: 1000, minHeight: 300 }), 28) })
// Details as whole windows for the website's Mac: the trend at the top, then
// scrolled to the time-of-day clock.
await page.evaluate(() => window.scrollTo(0, 0))
await settle(500)
await tidy()
await shot('mac-analytics')
const conditions = await panelBox('Where and when focus is strongest', { minWidth: 1000, minHeight: 300 })
// The filter bar stays pinned at the top, so leave room for it.
await page.evaluate(y => window.scrollTo(0, y - 200), conditions.y)
await settle(600)
await tidy()
await shot('mac-best-hours')
await page.getByText('Overview', { exact: true }).first().click()
await settle()
await page.evaluate(() => window.scrollTo(0, 0))
await settle(400)
await tidy()
await shot('analytics')
const reportTask = seeded.today[1]
await page.getByText(reportTask).first().scrollIntoViewIfNeeded()
await page.getByText(reportTask).first().click()
await settle(2000)
const title = await page.getByText(reportTask, { exact: true }).last().evaluate(node => {
  const rect = node.getBoundingClientRect()
  return { y: rect.y + scrollY }
})
// Personal records also has this label; the report's row is the last one.
const lapses = await panelBox('Longest Deep Focus block', { minWidth: 1000, minHeight: 60, last: true })
await shot('session-report', {
  fullPage: true,
  clip: { x: lapses.x - 4, y: title.y - 60, width: lapses.width + 8, height: lapses.y + lapses.height - title.y + 64 },
})
// The report as a whole window, scrolled to its title, for the website's Mac.
await page.evaluate(y => window.scrollTo(0, y - 110), title.y)
await settle(600)
await tidy()
await shot('mac-report')

await browser.close()
console.log(`screenshots in ${OUT}/`)
