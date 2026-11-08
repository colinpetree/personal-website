// Release check, run by CI after `npm run build` (.github/workflows/
// release.yml and build-instance.yml). Fails the build if any page would be
// blocked from hydrating in a real browser.
//
// Why: the site's CSP allows inline scripts only by hash, through a per-page
// <meta http-equiv="Content-Security-Policy"> that inject-csp-hashes.mjs
// writes (nginx's header deliberately has no script-src; see that script's
// header comment). If a page's meta tag misses the hash of one of its own
// inline scripts, the page builds fine but never hydrates in production.
// That has happened before, so this checks the finished files directly
// instead of trusting the step that wrote them.
//
// For every .html file under build/client:
//   1. hash each inline <script> (the same way a browser does: SHA-256 of
//      the exact text between the tags) and require that hash in the page's
//      CSP meta tag;
//   2. require at most one CSP meta tag, inside <head>;
//   3. require the precompressed .gz/.br siblings (served by nginx's
//      gzip_static/brotli_static to almost every browser) to decompress to
//      exactly the .html file, so nobody gets a stale copy without the tag.
//
// Usage: node scripts/verify-csp-hashes.mjs [buildDir]
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import zlib from 'node:zlib'

const BUILD_DIR = process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'client')

// Same pattern as inject-csp-hashes.mjs: inline scripts only (a <script
// src=...> is covered by 'self' and needs no hash).
const INLINE_SCRIPT_RE = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi
const CSP_META_RE = /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/gi

function findHtmlFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...findHtmlFiles(full))
    else if (entry.endsWith('.html')) out.push(full)
  }
  return out
}

const hashOf = (text) => `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`

if (!existsSync(BUILD_DIR)) {
  console.error(`::error::No build at ${BUILD_DIR}. Run npm run build first.`)
  process.exit(1)
}

const problems = []
const files = findHtmlFiles(BUILD_DIR)
let checkedScripts = 0

for (const file of files) {
  const name = relative(BUILD_DIR, file)
  const html = readFileSync(file, 'utf8')

  const metas = [...html.matchAll(CSP_META_RE)]
  const scripts = [...html.matchAll(INLINE_SCRIPT_RE)].map((m) => m[1])

  if (metas.length > 1) {
    problems.push(`${name}: ${metas.length} CSP meta tags (expected at most 1).`)
    continue
  }
  if (scripts.length > 0 && metas.length === 0) {
    problems.push(`${name}: ${scripts.length} inline script(s) but no CSP meta tag, so nothing allows them and the page will not hydrate.`)
    continue
  }
  if (metas.length === 1) {
    const headEnd = html.search(/<\/head>/i)
    if (headEnd === -1 || metas[0].index > headEnd) {
      problems.push(`${name}: the CSP meta tag is not inside <head>.`)
    }
    const policy = metas[0][1].replace(/&quot;/g, '"')
    const scriptSrc = policy.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src '))
    if (!scriptSrc) {
      problems.push(`${name}: the CSP meta tag has no script-src directive.`)
    } else {
      const allowed = new Set(scriptSrc.split(/\s+/).slice(1))
      for (const body of scripts) {
        checkedScripts++
        if (!allowed.has(hashOf(body))) {
          problems.push(`${name}: inline script not allowed by its CSP (${hashOf(body)}). First 120 chars: ${JSON.stringify(body.slice(0, 120))}`)
        }
      }
    }
  }

  for (const [ext, decode] of [['.gz', zlib.gunzipSync], ['.br', zlib.brotliDecompressSync]]) {
    const sibling = file + ext
    if (existsSync(sibling) && decode(readFileSync(sibling)).toString('utf8') !== html) {
      problems.push(`${name}${ext}: does not match ${name}, so browsers that accept ${ext === '.gz' ? 'gzip' : 'brotli'} would get a stale page.`)
    }
  }
}

if (problems.length > 0) {
  for (const p of problems) console.error(`::error::${p}`)
  console.error(`verify-csp-hashes: ${problems.length} problem(s) in ${files.length} HTML file(s).`)
  process.exit(1)
}
console.log(`verify-csp-hashes: OK. ${files.length} HTML file(s), ${checkedScripts} inline script(s), every one allowed by its page's CSP.`)
