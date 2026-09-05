// Post-build step, run after `react-router build`.
//
// React Router's ssr:false hydration protocol emits a handful of inline
// <script> tags on EVERY generated page (window.__reactRouterContext's
// bootstrap, the module-registration script, and one
// streamController.enqueue()/close() call per loader-data chunk) — without
// them the page never hydrates. The site's CSP forbids inline script
// execution outright (see deploy/nginx/personal-website.conf: it's a
// stored-XSS backstop for admin-authored blog content), which made every
// page permanently stuck on the empty root HydrateFallback shell in
// production (confirmed on test633.org: zero /api/site-config requests ever
// fired, console showed 4 blocked-inline-script CSP violations matching
// these exact 4 script categories).
//
// Fix: compute the exact SHA-256 hash of each page's own inline scripts here
// and inject a per-page <meta http-equiv="Content-Security-Policy"> tag
// listing those hashes. When a page is protected by multiple delivered CSP
// policies (an HTTP header AND a meta tag), browsers enforce the
// INTERSECTION of both for any directive present in either — so if nginx's
// header still declared its own script-src (even a permissive one lacking
// these hashes), it would keep blocking these scripts regardless of what
// this meta tag allows. That's why the nginx config's Content-Security-Policy
// header must not declare script-src/default-src at all: this per-page meta
// tag is the ONLY thing enforcing script-src, so it carries the complete
// policy rather than just the script-src piece. An attacker's script
// injected via stored XSS has different content -> a different hash -> still
// blocked, unlike a blanket 'unsafe-inline' fix would allow.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import zlib from 'node:zlib'

const BUILD_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'client')

// Every other directive from deploy/nginx/personal-website.conf's CSP,
// unchanged — only script-src moves here with page-specific hashes added,
// since these directives have nothing to do with the inline-script problem
// and don't need per-page computation.
const CSP_STATIC_DIRECTIVES = [
  "default-src 'self'",
  "frame-src https://js.stripe.com https://www.youtube.com https://player.vimeo.com https://open.spotify.com",
  "connect-src 'self' https://api.stripe.com",
  "img-src 'self' data: https:",
  "media-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "base-uri 'self'",
  "object-src 'none'",
]

// Deliberately excludes any <script src="...">: those already satisfy
// 'self' via the ordinary script-src host-source rule and need no hash.
// Requires a real attribute boundary (whitespace) right before "src=" —
// NOT a bare word boundary — so a hypothetical future attribute like
// "data-src=" (word boundary exists between "-" and "s" too) doesn't get
// misread as a real src and wrongly skipped.
const INLINE_SCRIPT_RE = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi

// Only these exact shapes are trusted enough to hash-allowlist — NOT "any
// inline <script> found anywhere in the file", and NOT a mere prefix check
// either. Prerendered pages also embed admin-authored blog content in the
// same HTML (BlogPostPage.jsx renders content_html via
// dangerouslySetInnerHTML, after backend/sanitize_html.py's server-side
// sanitization strips script-capable markup) — if a raw <script> tag ever
// slipped past that sanitizer, whoever controls its content also controls
// EVERY character of it.
//
// An earlier version of this file tried to validate the two variable-length
// scripts (the context bootstrap and the module-registration script) with a
// single regex using an unconstrained `[\s\S]*`/`[^{}]*` middle — anchored
// at both ends, but a wildcard is still a wildcard: a payload could satisfy
// the literal start/end text while smuggling an executable expression
// through the middle (confirmed by actually constructing and testing such
// payloads against those regexes — both matched). Fixed below by validating
// each variable region against what it's STRUCTURALLY supposed to contain,
// not just "some characters": the bootstrap's middle is build-emitted JSON
// (so JSON.parse must fully consume it — JSON syntax has no function calls,
// no arbitrary identifiers, nothing executable, so there is no expression
// to smuggle), and the registration script's route-modules object may only
// contain comma-separated `"key":routeN` entries (a bare `route<digits>`
// identifier reference — not an arbitrary expression — so no parens/
// operators/fetch calls fit there either).
//
// What these still do NOT protect against: the loaderData JSON string
// literal inside the enqueue(...) call (isStreamEnqueue below) can itself
// contain attacker-controlled bytes (e.g. an unsanitized field value) if
// React Router's OWN string-escaping of that payload were ever broken —
// that's a framework-level escaping guarantee this build step relies on but
// can't independently verify, not something checked here.

const STREAM_ENQUEUE_RE = /^window\.__reactRouterContext\.streamController\.enqueue\("(?:[^"\\]|\\.)*"\);$/
const STREAM_CLOSE_RE = /^window\.__reactRouterContext\.streamController\.close\(\);$/

const CONTEXT_PREFIX = 'window.__reactRouterContext = '
const CONTEXT_SUFFIX = ';window.__reactRouterContext.stream = new ReadableStream({start(controller){window.__reactRouterContext.streamController = controller;}}).pipeThrough(new TextEncoderStream());'

function isContextBootstrap(trimmed) {
  if (!trimmed.startsWith(CONTEXT_PREFIX) || !trimmed.endsWith(CONTEXT_SUFFIX)) return false
  const jsonPart = trimmed.slice(CONTEXT_PREFIX.length, trimmed.length - CONTEXT_SUFFIX.length)
  try {
    // Must be the ENTIRE remaining content, not a prefix of it — JSON.parse
    // throws on any trailing non-whitespace garbage, which is exactly what
    // rules out "valid JSON followed by more attacker-supplied text".
    JSON.parse(jsonPart)
    return true
  } catch {
    return false
  }
}

// One route-modules entry: a JSON-safe quoted key mapped to a bare
// `route<digits>` identifier — never an arbitrary expression, so there's no
// syntax slot here for a function call or operator.
const ROUTE_ENTRY = '"(?:[^"\\\\]|\\\\.)*":route\\d+'
const MODULE_REGISTRATION_RE = new RegExp(
  '^import "\\/assets\\/[\\w.-]+\\.js";\\n' +
  '(?:import \\* as route\\d+ from "\\/assets\\/[\\w.-]+\\.js";\\n)*' +
  '\\s*\\n\\s*window\\.__reactRouterRouteModules = ' +
  `\\{(?:${ROUTE_ENTRY}(?:,${ROUTE_ENTRY})*)?\\};` +
  '\\n\\nimport\\("\\/assets\\/[\\w.-]+\\.js"\\);$'
)

function isFrameworkScript(content) {
  const trimmed = content.trim()
  return (
    isContextBootstrap(trimmed) ||
    MODULE_REGISTRATION_RE.test(trimmed) ||
    STREAM_ENQUEUE_RE.test(trimmed) ||
    STREAM_CLOSE_RE.test(trimmed)
  )
}

function findHtmlFiles(dir) {
  const out = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...findHtmlFiles(full))
    else if (entry.endsWith('.html')) out.push(full)
  }
  return out
}

function hashOf(content) {
  return `'sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}'`
}

const files = findHtmlFiles(BUILD_DIR)
let injected = 0

for (const file of files) {
  const html = readFileSync(file, 'utf8')

  const hashes = new Set()
  const unrecognized = []
  let match
  INLINE_SCRIPT_RE.lastIndex = 0
  while ((match = INLINE_SCRIPT_RE.exec(html))) {
    if (isFrameworkScript(match[1])) {
      hashes.add(hashOf(match[1]))
    } else {
      unrecognized.push(match[1])
    }
  }

  // Fail loudly rather than either silently allowing (hashing it would
  // defeat the whole point) or silently leaving it CSP-blocked (breaks the
  // page with no visible signal at build time) — either this is a new React
  // Router internal script pattern that needs a new check added above (see
  // isFrameworkScript), or it's unexpected content that needs a human
  // looking at it before this ships.
  if (unrecognized.length > 0) {
    throw new Error(
      `${file}: found ${unrecognized.length} inline <script> tag(s) not matching ` +
      `any known React Router bootstrap pattern — refusing to guess. First 200 ` +
      `chars: ${JSON.stringify(unrecognized[0].slice(0, 200))}`
    )
  }

  // No inline scripts recognized on this page at all — every page React
  // Router's ssr:false build emits should have at least the bootstrap
  // scripts, so this is unexpected rather than routine; warn instead of
  // silently moving on, since (with no header-level script-src left either,
  // per deploy/nginx/personal-website.conf) skipping the meta tag here means
  // this page ships with NO script-src restriction whatsoever.
  if (hashes.size === 0) {
    console.warn(`[inject-csp-hashes] WARNING: ${file} has no recognized inline scripts — shipping with no script-src restriction.`)
    continue
  }

  const scriptSrc = `script-src 'self' https://js.stripe.com ${[...hashes].join(' ')}`
  const csp = [scriptSrc, ...CSP_STATIC_DIRECTIVES].join('; ')
  const metaTag = `<meta http-equiv="Content-Security-Policy" content="${csp.replace(/"/g, '&quot;')}">`

  // Must land inside <head>, as early as possible — CSP via meta only
  // governs content parsed AFTER the tag, and every inline script here is in
  // <body>, well after any reasonable <head> placement.
  if (!/<head[^>]*>/i.test(html)) {
    throw new Error(`${file}: no <head> tag found — can't inject CSP meta tag`)
  }
  const updated = html.replace(/<head([^>]*)>/i, `<head$1>${metaTag}`)

  writeFileSync(file, updated)

  // vite.config.js's compression() plugin already wrote .gz/.br siblings for
  // the pre-injection content during `react-router build` — regenerate them
  // here (same settings: gzip level 9, brotli quality 11) so nginx's
  // gzip_static/brotli_static don't keep serving stale HTML missing this
  // meta tag to any client that prefers a precompressed encoding, which in
  // practice is nearly every real browser.
  writeFileSync(`${file}.gz`, zlib.gzipSync(updated, { level: 9 }))
  writeFileSync(`${file}.br`, zlib.brotliCompressSync(updated, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  }))

  injected++
}

console.log(`[inject-csp-hashes] Injected per-page CSP into ${injected}/${files.length} HTML file(s).`)
