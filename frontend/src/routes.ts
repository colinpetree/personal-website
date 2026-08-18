import { type RouteConfig, index, route, layout } from '@react-router/dev/routes'
import { getSlugs, listAllPublishedSlugs } from './lib/prerenderData.js'

// Deployment-time flag — lets forks of this project exclude the AI demo
// feature (its own API keys/spend) entirely from the build. Vite inlines
// import.meta.env.* as literals at build time, so the branches below are
// dead-code-eliminated when it's set to 'false'.
const AI_DEMOS_ENABLED = import.meta.env.VITE_ENABLE_AI_DEMOS !== 'false'

// Same "unset -> sane defaults" fallback the old createRouter(slugs = {})
// used, for local dev before any site-config exists in a fresh DB.
const FALLBACK_SLUGS = { blog: 'blog', projects: 'projects', about: 'about', contact: 'contact', ai_demo: 'demo', payment: 'payment' }

export default (async () => {
  let slugs = FALLBACK_SLUGS
  // Whether the ':slug' route below should use the real BlogPostPage.jsx
  // (loader + clientLoader) or BlogPostPageClientOnly.jsx (clientLoader
  // only). Must mirror react-router.config.ts's prerender() exactly: that
  // file only ever adds individual post paths to the prerendered set when
  // postSlugs is non-empty, and react-router's ssr:false build hard-fails
  // (validateSsrFalsePrerenderExports) if a route exports `loader` but has
  // zero prerendered paths for its route id — even though clientLoader is
  // what actually serves those posts at runtime. Defaults to true (the
  // pre-existing behavior, and what local dev with PRERENDER_BASE_URL unset
  // wants — that branch never touches this flag, and BlogPostPage.jsx's
  // `loader` is harmless there since ssr:false validation only runs at
  // build time). Only flipped false below once a reachable PRERENDER_BASE_URL
  // positively confirms zero published posts — a fetch failure leaves this
  // true, which is safe either way since react-router.config.ts's prerender()
  // independently skips its own validation whenever nothing is prerendered.
  let hasPublishedPosts = true
  // Dev server: relative fetch works via vite's dev proxy (server.proxy
  // ['/api']) forwarding to localhost:5000. Build time: PRERENDER_BASE_URL
  // -based absolute fetch, same source of truth as react-router.config.ts.
  const base = process.env.PRERENDER_BASE_URL ?? 'http://localhost:5000'
  if (process.env.PRERENDER_BASE_URL) {
    // PRERENDER_BASE_URL being *set* doesn't guarantee it's reachable or
    // configured yet — react-router.config.ts's prerender() now falls back
    // to zero prerendered routes on exactly this failure (a wrong/dead
    // domain, DB not seeded, etc.) rather than crashing the build. This file
    // must match that fallback, not just avoid crashing outright: if this
    // stayed on FALLBACK_SLUGS while prerender() failed differently, the two
    // could disagree on route paths — but since prerender() prerenders
    // NOTHING when the fetch fails, there's nothing for these fallback slugs
    // to disagree with in that case. They only need to agree when the fetch
    // actually succeeds, which both call sites do independently but
    // identically off the same live PRERENDER_BASE_URL.
    try {
      slugs = await getSlugs(base)
      hasPublishedPosts = (await listAllPublishedSlugs(base)).length > 0
    } catch (err) {
      console.warn(
        `[routes] Failed to fetch site-config from PRERENDER_BASE_URL (${base}) — ` +
        `falling back to default route slugs. Cause: ${err.message}`
      )
    }
  } else {
    // No PRERENDER_BASE_URL configured at all (local dev, or a fresh clone
    // before the dev backend is even seeded) — a fetch failure here is
    // expected/routine, not a build-breaking problem, so fall back to
    // defaults exactly matching today's createRouter(slugs = {}).
    try {
      slugs = await getSlugs(base)
    } catch {}
  }

  return [
    // Public site — Navbar layout
    layout('./App.jsx', [
      index('./pages/HomePage.jsx'),
      route(slugs.blog, './pages/BlogPage.jsx'),
      route(slugs.projects, './pages/ProjectsPage.jsx'),
      route(slugs.about, './pages/AboutPage.jsx'),
      route(slugs.contact, './pages/ContactPage.jsx'),
      ...(AI_DEMOS_ENABLED ? [
        route(slugs.ai_demo, './pages/AIDemoPage.jsx'),
        route(`${slugs.ai_demo}/conversation-basics`, './pages/ai-demos/ConversationBasicsPage.jsx'),
        route(`${slugs.ai_demo}/tool-use`, './pages/ai-demos/ToolUsePage.jsx'),
        route(`${slugs.ai_demo}/mcp`, './pages/ai-demos/McpPage.jsx'),
        route(`${slugs.ai_demo}/prompt-evaluation`, './pages/ai-demos/PromptEvaluationPage.jsx'),
        route(`${slugs.ai_demo}/prompt-engineering`, './pages/ai-demos/PromptEngineeringPage.jsx'),
        route(`${slugs.ai_demo}/web-search`, './pages/ai-demos/WebSearchPage.jsx'),
        route(`${slugs.ai_demo}/rag`, './pages/ai-demos/RagPage.jsx'),
        route(`${slugs.ai_demo}/vision`, './pages/ai-demos/VisionPage.jsx'),
      ] : []),
      route(slugs.payment, './pages/PaymentPage.jsx'),
      route('profile', './pages/UserProfilePage.jsx'),
      route('auth/magic', './pages/MagicLinkVerifyPage.jsx'),
      route('search', './pages/SearchPage.jsx'),
      route(':slug', hasPublishedPosts ? './pages/BlogPostPage.jsx' : './pages/BlogPostPageClientOnly.jsx'),
      route('*', './pages/NotFoundPage.jsx'),
    ]),

    // Admin login — standalone pages (no sidebar)
    route('admin/login', './pages/admin/AdminLoginPage.jsx'),
    route('admin/forgot-password', './pages/admin/ForgotPasswordPage.jsx'),
    route('admin/reset-password', './pages/admin/ResetPasswordPage.jsx'),

    // Admin panel — sidebar layout with auth guard built into AdminLayout.
    // RoleGuard per-route wrapping now lives INSIDE each target page
    // component (see PLAN.md §4) since route-config files can't carry JSX
    // children the way router.jsx's inline `element: (<RoleGuard>...)` did.
    //
    // route('admin', ..., children) — NOT layout(...) — is load-bearing
    // here: layout() is pathless (contributes no URL segment), so an
    // earlier version of this file using layout() silently registered
    // every child at e.g. /home, /users instead of /admin/home,
    // /admin/users, with literal /admin matching nothing and falling
    // through to the public :slug catch-all instead. Confirmed broken via
    // an actual logged-in browser session before this fix.
    route('admin', './components/admin/AdminLayout.jsx', [
      index('./pages/admin/AdminSettingsPage.jsx'),
      route('users', './pages/admin/AdminUsersPage.jsx'),
      route('home', './pages/admin/AdminHomePage.jsx'),
      route('home/edit', './pages/admin/AdminHomeEditRoute.jsx'),
      route('blog', './pages/admin/AdminBlogPage.jsx'),
      route('blog/edit', './pages/admin/AdminBlogEditRoute.jsx'),
      route('blog/comments', './pages/admin/AdminBlogCommentsPage.jsx'),
      route('projects', './pages/admin/AdminProjectsPage.jsx'),
      route('projects/edit', './pages/admin/AdminProjectsEditRoute.jsx'),
      route('about', './pages/admin/AdminAboutPage.jsx'),
      route('about/edit', './pages/admin/AdminAboutEditRoute.jsx'),
      route('contact', './pages/admin/AdminContactPage.jsx'),
      route('contact/edit', './pages/admin/AdminContactEditRoute.jsx'),
      ...(AI_DEMOS_ENABLED ? [
        route('demo', './pages/admin/AdminAIDemoPage.jsx'),
        route('demo/edit', './pages/admin/AdminDemoEditRoute.jsx'),
      ] : []),
      route('payment', './pages/admin/AdminPaymentPage.jsx'),
      route('payment/edit', './pages/admin/AdminPaymentEditRoute.jsx'),
      route('accounts', './pages/admin/AdminAccountsPage.jsx'),
      // All roles — no RoleGuard
      route('blog/posts', './pages/admin/AdminBlogPostsPage.jsx'),
      route('blog/posts/:id', './pages/admin/AdminBlogEditorPage.jsx'),
    ]),
  ] satisfies RouteConfig
})()
