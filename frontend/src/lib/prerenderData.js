// Node-only helpers used by react-router.config.ts (prerender()) and
// routes.ts (dynamic route paths) — both need the same admin-configured
// slugs, so this is the single fetch both import rather than each doing
// its own request against the same endpoint.

export async function getSlugs(baseUrl) {
  const res = await fetch(`${baseUrl}/api/site-config`)
  if (!res.ok) throw new Error(`Failed to fetch site-config for prerender: HTTP ${res.status}`)
  const config = await res.json()
  const {
    blog = 'blog', projects = 'projects', about = 'about',
    contact = 'contact', ai_demo = 'demo', payment = 'payment',
  } = config.slugs ?? {}
  return { blog, projects, about, contact, ai_demo, payment }
}

export async function listAllPublishedSlugs(baseUrl) {
  const slugs = []
  let page = 1
  while (true) {
    const res = await fetch(`${baseUrl}/api/blog?page=${page}&per_page=50`)
    if (!res.ok) throw new Error(`Failed to fetch /api/blog page ${page} for prerender: HTTP ${res.status}`)
    const data = await res.json()
    slugs.push(...data.posts.map((p) => p.slug))
    if (page >= data.pages) break
    page += 1
  }
  return slugs
}
