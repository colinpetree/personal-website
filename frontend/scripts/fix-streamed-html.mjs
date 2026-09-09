// Post-build step, run BEFORE inject-csp-hashes.mjs (which computes hashes
// over the final script tags, so it should see the corrected structure).
//
// React Router's ssr:false prerendering renders each route as a *streaming*
// response (root loader + route loader each resolve as a separate chunk,
// e.g. boundary "B:0" then "B:1") and writes the raw streamed bytes straight
// to a static .html file. The first chunk already contains a complete
// `</body></html>`; every later chunk — the deferred loaderData transfer
// scripts, the `<!--$?-->`/`<template>`/`<!--/$-->` Suspense-boundary
// markers, and the `$RC(...)` reveal calls — gets appended straight after
// that closing tag instead of before it.
//
// That's invalid HTML: content after `</html>` sends the parser through its
// error-recovery path, and empirically (reproduced on test633.org, in both
// real Edge and headless Chromium) this leaves a stray, VISIBLE "$" text
// node as the very first child of <body> — the first boundary's `<!--$?-->`
// marker, which is supposed to stay an invisible comment the whole time,
// instead surfaces as a literal rendered "$" glyph pinned to the top-left
// corner of every page.
//
// Fix: every one of these files has exactly one `</body></html>` pair,
// positioned too early — move it to the true end of the file so all the
// deferred content it was supposed to wrap ends up inside <body> like it
// would in a real (non-static) streaming response.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const BUILD_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'build', 'client')

const CLOSE_TAGS = '</body></html>'

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

const files = findHtmlFiles(BUILD_DIR)
let fixed = 0

for (const file of files) {
  const html = readFileSync(file, 'utf8')

  const idx = html.indexOf(CLOSE_TAGS)
  if (idx === -1) {
    throw new Error(`${file}: no "${CLOSE_TAGS}" found — unexpected HTML shape, refusing to guess.`)
  }
  // Already at (or right at) the true end — nothing to move.
  if (idx === html.length - CLOSE_TAGS.length) continue

  const before = html.slice(0, idx)
  const trailing = html.slice(idx + CLOSE_TAGS.length)
  const updated = before + trailing + CLOSE_TAGS
  writeFileSync(file, updated)

  // vite.config.js's compression() plugin already wrote .gz/.br siblings for
  // the pre-fix content during `react-router build`. Regenerate them here
  // (same settings: gzip level 9, brotli quality 11) rather than leaving
  // that to inject-csp-hashes.mjs, which only rewrites .gz/.br for pages
  // where it recognizes every inline script — if it ever hits a page it
  // doesn't recognize and warns instead of writing, this fix's own .gz/.br
  // must not be left stale (still pointing at the pre-fix, broken markup)
  // as a result of that unrelated script's own escape hatch.
  writeFileSync(`${file}.gz`, zlib.gzipSync(updated, { level: 9 }))
  writeFileSync(`${file}.br`, zlib.brotliCompressSync(updated, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 },
  }))

  fixed++
}

console.log(`[fix-streamed-html] Repositioned "</body></html>" in ${fixed}/${files.length} HTML file(s).`)
