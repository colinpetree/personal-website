// Release check, run by CI (.github/workflows/build-test.yml) after
// verify-hydration.mjs. Drives the admin side in a real Chromium, as an
// administrator:
//   1. sign in
//   2. create and publish a Page in the editor, see it on the public site
//   3. create and publish a blog post (publish dialog + final review), see it
//   4. invite a Contributor on Staff Accounts, sign in as them in a separate
//      browser, and check their sidebar leaves out the admin-only screens
//   5. change the site title in Site Settings, see it survive a reload and
//      reach the public site
//   6. sign out, and confirm the session really ended
// Site Settings runs last because it renames the site. The public-side
// checks cover reading; this covers writing.
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
const { email, password, new_page: newPage, new_post: newPost, invitee, new_site_title: newSiteTitle } = manifest.admin

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

// Opens `path` as a logged-out visitor and waits for `text` to appear.
async function visitorSees(path, text) {
  const visitor = await browser.newContext()
  const publicPage = await visitor.newPage()
  watch(publicPage)
  await publicPage.goto(`${BASE}${path}`, { waitUntil: 'networkidle' })
  const shown = await publicPage.getByText(text).first()
    .waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false)
  await visitor.close()
  return shown
}

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
  if (!(await visitorSees(`/${newPage.slug}`, newPage.text))) {
    fail(`/${newPage.slug} does not show "${newPage.text}" after publishing`)
  }

  step('blog: create a post')
  await page.goto(`${BASE}/admin/blog/posts`, { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '+ New post' }).click()
  await page.waitForURL(/\/admin\/blog\/posts\/\d+$/, { timeout: 15000 })
  await page.getByPlaceholder('Post title').fill(newPost.title)
  await page.locator('[contenteditable="true"]').first().click()
  await page.keyboard.type(newPost.text)

  step('blog: publish right now')
  await page.getByRole('button', { name: 'Publish', exact: true }).locator('visible=true').first().click()
  await page.getByRole('button', { name: 'Publish Right Now' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Publish post, right now' }).click()
  await page.waitForURL((url) => url.pathname === '/admin/blog/posts', { timeout: 15000 })
  if (!(await visitorSees(`/${newPost.slug}`, newPost.text))) {
    fail(`/${newPost.slug} does not show "${newPost.text}" after publishing the post`)
  }

  step('staff: invite a contributor')
  await page.goto(`${BASE}/admin/accounts`, { waitUntil: 'networkidle' })
  // Control for the contributor check below: an administrator's sidebar
  // shows the "System Settings" group, so its absence there means hidden by
  // role. (Its links are inside a collapsed group, so check the heading.)
  const adminSeesSettings = await page.getByText('System Settings', { exact: true }).first()
    .waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false)
  if (!adminSeesSettings) fail('the administrator sidebar has no "System Settings" group, so the contributor check proves nothing')
  await page.getByRole('button', { name: 'Add account' }).click()
  const dialog = page.locator('form').filter({ has: page.locator('input[type="password"]') })
  await dialog.locator('input[type="text"]').fill(invitee.name)
  await dialog.locator('input[type="email"]').fill(invitee.email)
  await dialog.locator('input[type="password"]').fill(invitee.password)
  // The radio's name is its label plus the role description, and other
  // roles' descriptions mention Contributors, so match the start only.
  await dialog.getByRole('radio', { name: /^Contributor\b/ }).check()
  await dialog.getByRole('button', { name: 'Create' }).click()
  await dialog.waitFor({ state: 'detached', timeout: 10000 })
  await page.getByRole('button', { name: 'Contributors', exact: true }).click()
  const listed = await page.getByText(invitee.email).first()
    .waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false)
  if (!listed) fail(`the new contributor ${invitee.email} is not on the Contributors tab`)

  step('staff: the contributor signs in and sees only their screens')
  {
    const other = await browser.newContext({ viewport: { width: 1280, height: 900 } })
    const contributor = await other.newPage()
    watch(contributor)
    await contributor.goto(`${BASE}/admin/login`, { waitUntil: 'networkidle' })
    await contributor.getByLabel('Email').fill(invitee.email)
    await contributor.getByLabel('Password').fill(invitee.password)
    await contributor.getByRole('button', { name: 'Sign in' }).click()
    await contributor.waitForURL((url) => url.pathname.startsWith('/admin') && !url.pathname.startsWith('/admin/login'), { timeout: 15000 })
    await contributor.getByRole('link', { name: 'Pages', exact: true }).first().waitFor({ state: 'visible', timeout: 10000 })
    if (await contributor.getByText('System Settings', { exact: true }).count()) {
      fail('a contributor\'s sidebar shows the "System Settings" group')
    }
    // Typing an admin-only address directly sends a contributor back to
    // their own posts list (RoleGuard).
    for (const adminOnly of ['/admin/settings', '/admin/accounts', '/admin/users']) {
      await contributor.goto(`${BASE}${adminOnly}`, { waitUntil: 'networkidle' })
      const sentBack = await contributor.waitForURL((url) => url.pathname === '/admin/blog/posts', { timeout: 10000 })
        .then(() => true, () => false)
      if (!sentBack) fail(`a contributor can open ${adminOnly} (still at ${contributor.url()})`)
    }
    await other.close()
  }

  step('settings: rename the site')
  await page.goto(`${BASE}/admin/settings`, { waitUntil: 'networkidle' })
  // The whole Title card (EditableCard: heading > title block > header row >
  // card), so the Edit/Save buttons and the text box are all found inside it
  // rather than anywhere on the page.
  const titleCard = page.getByRole('heading', { name: 'Title', exact: true }).locator('xpath=../../..')
  await titleCard.getByRole('button', { name: 'Edit', exact: true }).click()
  await titleCard.getByRole('textbox').fill(newSiteTitle)
  await titleCard.getByRole('button', { name: 'Save', exact: true }).click()
  await titleCard.getByRole('button', { name: 'Saved' }).waitFor({ timeout: 10000 })
  await page.reload({ waitUntil: 'networkidle' })
  const kept = await page.getByText(newSiteTitle).first()
    .waitFor({ state: 'visible', timeout: 10000 }).then(() => true, () => false)
  if (!kept) fail(`Site Settings does not show "${newSiteTitle}" after a reload`)
  // The home page's prerendered HTML still has the old title; the browser
  // fetches the live settings when the page loads, so the new one appears.
  if (!(await visitorSees('/', newSiteTitle))) {
    fail(`the public site does not show the new title "${newSiteTitle}"`)
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
console.log('verify-admin: OK. Signed in; published a page and a blog post and saw both publicly; invited a contributor who sees only their screens; renamed the site; signed out.')
