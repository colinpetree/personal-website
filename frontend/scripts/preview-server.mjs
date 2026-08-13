// Local preview server for the production build (build/client/), since
// Vite's own `vite preview` doesn't understand this framework-mode build's
// layout: per-route index.html files for prerendered pages, a distinct
// __spa-fallback.html for everything else, and /api/* needing to reach a
// real backend rather than 404ing.
//
// This exists specifically to test pages locally without hitting
// react-router@7.18.2's dev-server-only SingleFetchNoResultError bug on
// any route with its own loader (BlogPage/ProjectsPage/BlogPostPage) —
// confirmed via extensive testing to be a dev-server-only issue that does
// not reproduce against a real production build. Use this instead of
// `npm run dev` when testing those specific pages.
//
// Usage:
//   npm run build
//   npm run preview
//   (optionally: PRERENDER_BASE_URL=... npm run build   first, to preview
//   a build with real prerendered content instead of the pure-SPA shell)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'build', 'client')
const PORT = Number(process.env.PREVIEW_PORT) || 4173
const API_TARGET = process.env.PREVIEW_API_TARGET || 'http://127.0.0.1:5000'

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.data': 'text/plain',
}

if (!fs.existsSync(ROOT)) {
  console.error(`No build found at ${ROOT} — run \`npm run build\` first.`)
  process.exit(1)
}

function serveFile(res, filePath, statusCode = 200) {
  res.writeHead(statusCode, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
  fs.createReadStream(filePath).pipe(res)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://x`)

  // Mirrors deploy/nginx/personal-website.conf's `location /api/` proxy —
  // forwards method/body/cookies to the real local Flask backend so login,
  // uploads, and every loader's fetch() work exactly as in production.
  if (url.pathname.startsWith('/api/')) {
    let body
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks = []
      for await (const chunk of req) chunks.push(chunk)
      body = Buffer.concat(chunks)
    }
    // Forward the client's own content-type as-is (don't default to
    // application/json — that broke multipart/form-data uploads, e.g.
    // images through the admin panel).
    const headers = { cookie: req.headers.cookie || '' }
    if (req.headers['content-type']) headers['content-type'] = req.headers['content-type']
    const upstream = await fetch(API_TARGET + url.pathname + url.search, {
      method: req.method,
      headers,
      body,
    })
    // arrayBuffer(), not text() — text() corrupts binary responses (images,
    // videos served via /api/uploads/*), which is what broke media in blog
    // posts/pages through this proxy.
    const responseBody = Buffer.from(await upstream.arrayBuffer())
    const responseHeaders = { 'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream' }
    const setCookie = upstream.headers.get('set-cookie')
    if (setCookie) responseHeaders['set-cookie'] = setCookie
    res.writeHead(upstream.status, responseHeaders)
    res.end(responseBody)
    return
  }

  // Mirrors nginx's `try_files $uri $uri/ /__spa-fallback.html /index.html;`
  const uriPath = path.join(ROOT, decodeURIComponent(url.pathname))
  if (fs.existsSync(uriPath) && fs.statSync(uriPath).isFile()) {
    return serveFile(res, uriPath)
  }
  const indexPath = path.join(uriPath, 'index.html')
  if (fs.existsSync(indexPath)) {
    if (!url.pathname.endsWith('/')) {
      res.writeHead(301, { Location: url.pathname + '/' })
      return res.end()
    }
    return serveFile(res, indexPath)
  }
  const spaFallback = path.join(ROOT, '__spa-fallback.html')
  return serveFile(res, fs.existsSync(spaFallback) ? spaFallback : path.join(ROOT, 'index.html'))
})

server.listen(PORT, () => {
  console.log(`Preview server: http://localhost:${PORT}  (proxying /api/* -> ${API_TARGET})`)
})
