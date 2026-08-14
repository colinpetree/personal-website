// Used for the `:slug` route instead of BlogPostPage.jsx when the build has
// zero published posts to prerender (see routes.ts's hasPublishedPosts
// check) — same page, but must NOT re-export `loader`: react-router's
// ssr:false validation rejects any `loader` export on a route with zero
// prerendered paths for that route id, even though `clientLoader` (still
// re-exported below, `.hydrate = true` included since it's a property on
// the same function object) is what actually runs and is completely valid
// on its own. Confirmed by reproducing the build failure locally against a
// freshly-seeded backend with zero blog posts, then confirming this module
// swap resolves it.
export { default, clientLoader, HydrateFallback } from './BlogPostPage.jsx'
