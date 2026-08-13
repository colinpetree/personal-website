import type { Config } from '@react-router/dev/config'

const PRERENDER_BASE_URL = process.env.PRERENDER_BASE_URL

export default {
  ssr: false,
  appDirectory: 'src',

  async prerender() {
    // No known-live production URL to fetch content from (e.g. the very
    // first build of this project, before a domain/DB exists, or the
    // generic/template build profile — see PLAN.md's two-build-profile
    // section) — build as a pure SPA, exactly matching pre-SSG behavior.
    if (!PRERENDER_BASE_URL) {
      console.warn(
        '[prerender] PRERENDER_BASE_URL not set — building with zero ' +
        'prerendered routes (pure SPA fallback).'
      )
      return []
    }

    const { getSlugs, listAllPublishedSlugs } = await import('./src/lib/prerenderData.js')

    const slugs = await getSlugs(PRERENDER_BASE_URL)
    const postSlugs = await listAllPublishedSlugs(PRERENDER_BASE_URL)

    // Deliberately excluded: /admin/*, /{payment}, /{ai_demo}(+subroutes),
    // /profile, /auth/magic — all session-gated or write-heavy; never valid
    // to serve a stale prerendered snapshot for these.
    return [
      '/',
      `/${slugs.about}`,
      `/${slugs.blog}`,       // page 1 only — pagination stays client-fetched
      `/${slugs.projects}`,
      `/${slugs.contact}`,
      ...postSlugs.map((slug) => `/${slug}`),
    ]
  },
} satisfies Config
