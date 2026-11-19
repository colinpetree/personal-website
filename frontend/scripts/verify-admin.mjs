// Release check, run by CI (.github/workflows/build-test.yml) after
// verify-hydration.mjs. Drives the admin side in a real Chromium: sign in,
// create a page in the Lexical editor, publish it, see it on the public site,
// sign out. The public-side checks cover reading; this covers writing.
//
// Needs the same setup as verify-hydration.mjs (a build in build/client, the
// fixture backend still running, Playwright's Chromium) and the manifest
// written by backend/ci_fixture.py, whose `admin` entry holds a one-off staff
// login.
//
// Usage:
//   node scripts/verify-admin.mjs --manifest f.json --api http://127.0.0.1:8099 [--artifacts dir]
//
// --artifacts: where to save a screenshot and a Playwright trace if a step
// fails (CI uploads that folder).
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const argValue = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback)
const manifest = JSON.parse(readFileSync(argValue('--manifest'), 'utf8'))
const API = argValue('--api', 'http://127.0.0.1:8099')
const PORT = Number(argValue('--port', '4174'))
const ARTIFACTS = argValue('--artifacts', null)
const BASE = `http://127.0.0.1:${PORT}`
const { email, password, new_page: newPage } = manifest.admin

const problems = []
const fail = (msg) => { problems.push(msg); console.error(`::error::${msg}`) }
const step = (name) => console.log(`verify-admin: ${name}`)

const preview = spawn(process.execPath, [join(dirname(fileURLToPath(import.meta.url)), 'preview-server.mjs')], {
  env: { ...process.env, PREVIEW_PORT: String(PORT), PREVIEW_API_TARGET: API },
  stdio: ['ignore', 'inherit', 'inherit'],
})

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/`)).ok) return
    } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`preview server did not start on ${BASE}`)
}

// Uncaught errors and CSP violations fail the run. Console errors are
// collected too, except failed network requests the admin UI expects (for
// example a 401 from /api/admin/me before signing in).
function watch(page) {
  page.on('pageerror', (err) => fail(`uncaught error on ${page.url()}: ${err.message}`))
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    if (/Failed to load resource: the server responded with a status of 40[134]/.test(text)) return
    fail(`console error on ${page.url()}: ${text}`)
  })
}

let browser
let context
let page
try {
  await waitForServer()
  browser = await chromium.launch()
  context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  if (ARTIFACTS) await context.tracing.start({ screenshots: true, snapshots: true })
  page = await context.newPage()
  watch(page)

  step('sign in')
  await page.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' })
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname.startsWith('/admin') && !url.pathname.startsWith('/admin/login'), { timeout: 15000 })

  step('create a page')
  await page.goto(`${BASE}/admin/pages`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '+ New page' }).click()
  await page.waitForURL(/\/admin\/pages\/\d+$/, { timeout: 15000 })

  step('write the title and body')
  await page.getByPlaceholder('Page title').fill(newPage.title)
  const body = page.locator('.page-editor-content [contenteditable="true"]').first()
  await body.click()
  await page.keyboard.type(newPage.text)

  step('publish')
  await page.getByRole('button', { name: 'Publish', exact: true }).locator('visible=true').first().click()
  await page.getByRole('button', { name: 'Publish page', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/admin/pages', { timeout: 15000 })

  step('see it on the public site, logged out')
  {
    const visitor = await browser.newContext()
    const publicPage = await visitor.newPage()
    watch(publicPage)
    await publicPage.goto(`${BASE}/${newPage.slug}`, { waitUntil: 'networkidle' })
    const shown = await publicPage.getByText(newPage.text).first()
      .waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false)
    if (!shown) fail(`/${newPage.slug} does not show "${newPage.text}" after publishing`)
    await visitor.close()
  }

  step('sign out')
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' })
  // "Sign out" lives in the account menu at the bottom of the sidebar.
  await page.getByRole('button', { name: 'Account menu' }).locator('visible=true').first().click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await page.waitForURL((url) => url.pathname.startsWith('/admin/login'), { timeout: 10000 })
  const me = await page.evaluate(async () => (await fetch('/api/admin/site-config', { credentials: 'include' })).status)
  if (me !== 401) fail(`still signed in after "Sign out" (/api/admin/site-config answered ${me})`)
} catch (err) {
  fail(`verify-admin stopped: ${err.message.split('\n')[0]}`)
} finally {
  if (problems.length && ARTIFACTS && page) {
    mkdirSync(ARTIFACTS, { recursive: true })
    await page.screenshot({ path: join(ARTIFACTS, 'verify-admin-failure.png'), fullPage: true }).catch(() => {})
    await context.tracing.stop({ path: join(ARTIFACTS, 'verify-admin-trace.zip') }).catch(() => {})
    console.error(`verify-admin: screenshot and trace saved to ${ARTIFACTS} (open the trace at https://trace.playwright.dev)`)
  }
  if (browser) await browser.close()
  preview.kill()
}

if (problems.length > 0) {
  console.error(`verify-admin: ${problems.length} problem(s).`)
  process.exit(1)
}
console.log('verify-admin: OK. Signed in, created and published a page in the editor, saw it publicly, signed out.')
