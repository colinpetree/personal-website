// Used for the ':slug' route instead of SlugResolverPage.jsx when the build
// has zero published pages/posts to prerender (see routes.ts's
// hasPrerenderedSlugItems check) — same page, but must NOT re-export
// `loader`: react-router's ssr:false validation rejects any `loader` export
// on a route with zero prerendered paths for that route id, even though
// `clientLoader` (still re-exported below, `.hydrate = true` included since
// it's a property on the same function object) is what actually runs and is
// completely valid on its own. Same pattern as the old
// BlogPostPageClientOnly.jsx. `meta` is exempt from that restriction (it's
// not in react-router's SERVER_ONLY_ROUTE_EXPORTS list), so it's re-exported
// unconditionally alongside clientLoader.
export { default, clientLoader, HydrateFallback, meta } from './SlugResolverPage.jsx'
