// Release check, run by CI after `npm run build`. Makes sure the prerender
// really produced pages instead of quietly falling back to the bare SPA
// shell.
//
// Why: react-router.config.ts's prerender() returns zero routes on ANY
// fetch failure (site down, Cloudflare challenge, API error) and the build
// still succeeds. Publishing that would replace every prerendered page with
// an empty shell, so CI must turn that silence into a failure.
//
// Usage:
//   node scripts/verify-prerender.mjs                     # at least one real page
//   node scripts/verify-prerender.mjs --manifest f.json   # also the fixture's exact pages
//
// The no-flag rule matches publish-release.sh's HTML_COUNT check: a build with
// no prerendered routes emits exactly one .html file, and any real prerender
// emits several (/, blog, projects, contact, plus posts and pages).
//
// --manifest takes the JSON written by backend/ci_fixture.py:
//   expect: [{path, text}]  each path must be prerendered and contain text
//   absent: [path]          each path must NOT be prerendered (drafts)
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const manifestPath = args.includes('--manifest') ? args[args.indexOf('--manifest') + 1] : null
const BUILD_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'client')

function countHtml(dir) {
  let n = 0
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) n += countHtml(full)
    else if (entry.endsWith('.html')) n++
  }
  return n
}

// '/' -> index.html, '/blog' -> blog/index.html (React Router's prerender
// layout, served by nginx's try_files $uri/ and by preview-server.mjs).
const fileFor = (path) => join(BUILD_DIR, ...path.split('/').filter(Boolean), 'index.html')

if (!existsSync(BUILD_DIR)) {
  console.error(`::error::No build at ${BUILD_DIR}. Run npm run build first.`)
  process.exit(1)
}

const problems = []
const total = countHtml(BUILD_DIR)
if (total <= 1) {
  problems.push(
    `Only ${total} HTML file(s) were built, so nothing was prerendered. The site was ` +
    'unreachable during the build, or its API failed (see the "[prerender]" and ' +
    '"[routes]" warnings in the build log above).'
  )
}

if (manifestPath) {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  for (const { path, text } of manifest.expect ?? []) {
    const file = fileFor(path)
    if (!existsSync(file)) {
      problems.push(`${path} was not prerendered (no ${file}).`)
    } else if (!readFileSync(file, 'utf8').includes(text)) {
      problems.push(`${path} was prerendered but does not contain "${text}", so it may hold an error page.`)
    }
  }
  for (const path of manifest.absent ?? []) {
    if (existsSync(fileFor(path))) {
      problems.push(`${path} was prerendered but must not be (it is a draft).`)
    }
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`::error::${p}`)
  process.exit(1)
}
console.log(`verify-prerender: OK. ${total} HTML file(s)${manifestPath ? ', every fixture page present and every draft absent' : ''}.`)
