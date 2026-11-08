// Release check, run by the release workflow (.github/workflows/release.yml)
// against the prerendered fixture build. Opens the built pages in a real
// Chromium and fails if any of them does not come to life in the browser.
//
// Why: a page can build, prerender and look right as HTML yet never
// hydrate: a CSP hash missing (see inject-csp-hashes.mjs), a hydration
// mismatch that makes React throw the page away, a React upgrade changing
// behaviour (React 19 dropped the old `inert` handling the mobile menu used).
// None of that shows up until a browser runs the page.
//
// Needs: a build in build/client (from `npm run build` with
// PRERENDER_BASE_URL pointing at the fixture backend), that backend still
// running, `npx playwright install chromium`, and the manifest written by
// backend/ci_fixture.py.
//
// Usage:
//   node scripts/verify-hydration.mjs --manifest f.json --api http://127.0.0.1:8099
//
// For each page in the manifest it fails on: a CSP violation, an uncaught
// page error, or any console error (React reports hydration mismatches as
// console errors). Then it checks hydration really happened by clicking an
// internal nav link and confirming the route changed WITHOUT a full page
// load, and that the mobile menu opens on a phone-sized screen.
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const argValue = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const manifest = JSON.parse(readFileSync(argValue('--manifest'), 'utf8'))
const API = argValue('--api', 'http://127.0.0.1:8099')
const PORT = Number(argValue('--port', '4173'))
const BASE = `http://127.0.0.1:${PORT}`

const problems = []
const fail = (msg) => { problems.push(msg); console.error(`::error::${msg}`) }

// ---- Start the preview server (serves build/client like nginx does, and
// ---- proxies /api to the fixture backend) --------------------------------
const preview = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'preview-server.mjs')], {
  env: { ...process.env, PREVIEW_PORT: String(PORT), PREVIEW_API_TARGET: API },
  stdio: ['ignore', 'inherit', 'inherit'],
})

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`${BASE}/`)
      if (res.ok) return
    } catch {}
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`preview server did not start on ${BASE}`)
}

// Collects every problem a page reports while loading and running.
function watch(page, label) {
  const seen = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') seen.push(`console error: ${msg.text()}`)
  })
  page.on('pageerror', (err) => seen.push(`uncaught error: ${err.message}`))
  return {
    seen,
    report: () => seen.forEach((s) => fail(`${label}: ${s}`)),
  }
}

let browser
try {
  await waitForServer()
  browser = await chromium.launch()

  // ---- 1. Every prerendered fixture page loads with no errors ----------
  for (const { path } of manifest.expect) {
    const context = await browser.newContext()
    await context.addInitScript(() => {
      window.__cspViolations = []
      document.addEventListener('securitypolicyviolation', (e) => {
        window.__cspViolations.push(`${e.violatedDirective} blocked ${e.blockedURI || 'an inline script'}`)
      })
    })
    const page = await context.newPage()
    const w = watch(page, path)
    const response = await page.goto(BASE + path, { waitUntil: 'networkidle' })
    if (!response || !response.ok()) w.seen.push(`HTTP ${response ? response.status() : 'no response'}`)
    const violations = await page.evaluate(() => window.__cspViolations)
    violations.forEach((v) => w.seen.push(`CSP violation: ${v}`))
    w.report()
    await context.close()
  }

  // ---- 2. Hydration: clicking a nav link is a client-side route change --
  {
    const { from, label, to } = manifest.nav_click
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const page = await context.newPage()
    const w = watch(page, `nav click ${from} -> ${to}`)
    await page.goto(BASE + from, { waitUntil: 'networkidle' })
    // A full page load would wipe this; a hydrated React Router app keeps it.
    await page.evaluate(() => { window.__noFullReload = true })
    await page.getByRole('link', { name: label, exact: true }).first().click()
    await page.waitForURL((url) => url.pathname.replace(/\/$/, '') === to, { timeout: 10000 })
      .catch(() => w.seen.push(`clicking "${label}" did not reach ${to} (still at ${page.url()})`))
    const kept = await page.evaluate(() => window.__noFullReload === true)
    if (!kept) w.seen.push(`clicking "${label}" did a full page load, so the page never hydrated`)
    w.report()
    await context.close()
  }

  // ---- 3. Mobile menu opens on a phone-sized screen ---------------------
  {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
    const page = await context.newPage()
    const w = watch(page, 'mobile menu')
    await page.goto(BASE + '/', { waitUntil: 'networkidle' })
    const toggle = page.getByRole('button', { name: 'Toggle menu' })
    await toggle.click()
    // With the menu closed it is display:none and inert, so a nav link
    // inside it is only visible once it really opened. Wait for a VISIBLE
    // match (isVisible() checks once and ignores its timeout, and the hidden
    // desktop nav has a link with the same name).
    const opened = await page.getByRole('link', { name: manifest.nav_click.label, exact: true })
      .locator('visible=true').first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true, () => false)
    if (!opened) w.seen.push('tapping "Toggle menu" did not show the menu links')
    w.report()
    await context.close()
  }
} catch (err) {
  fail(`verify-hydration could not run: ${err.message}`)
} finally {
  if (browser) await browser.close()
  preview.kill()
}

if (problems.length > 0) {
  console.error(`verify-hydration: ${problems.length} problem(s).`)
  process.exit(1)
}
console.log(`verify-hydration: OK. ${manifest.expect.length} page(s) loaded cleanly, client-side navigation works, mobile menu opens.`)
