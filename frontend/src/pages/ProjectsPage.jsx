import { useRef } from 'react'
import { useLoaderData } from 'react-router'
import { ExternalLink } from 'lucide-react'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { useTrackPageView } from '../hooks/useTrackPageView'
import { buildMeta, siteFallbackImage, notFoundMeta, isNavEnabled } from '../utils/meta'
import { apiUrl, fetchSiteConfig, getCachedSiteConfig } from '../lib/apiFetch'
import ScrollableHeaderNav from '../components/ScrollableHeaderNav'
import CodeBlockCopyToast from '../components/CodeBlockCopyToast'
import NotFoundPage from './NotFoundPage'

// fetchSiteConfig() runs alongside the project fetch purely to populate
// getCachedSiteConfig()'s cache in time for meta() below (see its usage
// there for why) — its resolved value isn't otherwise part of this route's
// own data (the component reads config from context, not this).
async function fetchProjects() {
  const [projectsRes] = await Promise.all([
    fetch(apiUrl('/api/projects')),
    fetchSiteConfig(),
  ])
  const projects = projectsRes.ok ? await projectsRes.json() : []
  return { projects }
}

// Prerendered at build time.
export async function loader() {
  return fetchProjects()
}

// Required in addition to loader — under ssr:false, loader only runs for
// prerendered paths (no server exists to run it otherwise, and no .data
// file exists for an unprerendered route). clientLoader.hydrate=true makes
// this run in-browser on the very first hard load too, covering both the
// generic/no-prerendering build profile and this page not having been
// prerendered for some other reason.
export async function clientLoader() {
  return fetchProjects()
}
clientLoader.hydrate = true

function ProjectCardSkeleton() {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden animate-pulse">
      <div className="w-full h-48 bg-gray-100" />
      <div className="p-5 flex flex-col gap-2">
        <div className="h-5 bg-gray-100 rounded w-2/3" />
        <div className="h-3 bg-gray-100 rounded w-full" />
        <div className="h-3 bg-gray-100 rounded w-4/5" />
      </div>
    </div>
  )
}

// data.config would be the natural source here, but this route's component
// also calls useLoaderData() — confirmed that combination makes meta()'s
// `data` param unreliable at prerender time (see getCachedSiteConfig in
// apiFetch.js). Read the synchronous cache instead.
export function meta() {
  const config = getCachedSiteConfig()
  if (!isNavEnabled(config, 'projects')) return notFoundMeta(config)
  return buildMeta({
    title: config?.site_title ? `${config.projects_page_name ?? 'Projects'} - ${config.site_title}` : undefined,
    description: config?.projects_meta_description,
    image: siteFallbackImage(config),
  })
}

// Shown only while clientLoader is resolving on a hard load with nothing
// prerendered yet.
export function HydrateFallback() {
  return (
    <main className="max-w-4xl mx-auto px-6 pt-10 pb-16">
      <div className="grid gap-6 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <ProjectCardSkeleton key={i} />)}
      </div>
    </main>
  )
}

export default function ProjectsPage() {
  const { config } = useSiteConfig()
  const { projects } = useLoaderData()
  const contentRef = useRef(null)
  const enabled = isNavEnabled(config, 'projects')
  useTrackPageView('page', enabled ? 'projects' : null)

  if (!enabled) return <NotFoundPage />

  return (
    <main className={`mx-auto px-6 pt-10 pb-16 ${config?.projects_page_width === 'narrow' ? 'max-w-[524px]' : 'max-w-4xl'}`}>
      {config?.projects_text && (
        <>
          <div
            ref={contentRef}
            className="prose prose-gray max-w-none blog-content page-header-content font-serif mb-12"
            data-page-width={config?.projects_page_width === 'narrow' ? 'narrow' : 'regular'}
            dangerouslySetInnerHTML={{ __html: config.projects_text }}
          />
          {config.projects_scrollable_nav_enabled && (
            <ScrollableHeaderNav containerRef={contentRef} contentKey={config.projects_text} />
          )}
          <CodeBlockCopyToast containerRef={contentRef} contentKey={config.projects_text} />
        </>
      )}

      {projects.length === 0 ? (
        <p className="text-gray-400">No projects yet.</p>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2">
          {projects.map(project => (
            <div key={project.id} className="border border-gray-200 rounded-lg overflow-hidden">
              {project.image_filename && (
                <img
                  src={`/api/uploads/${project.image_filename}`}
                  alt={project.title}
                  className="w-full h-48 object-cover"
                />
              )}
              <div className="p-5">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">{project.title}</h2>
                {project.description && (
                  <p className="text-gray-600 text-sm mb-4">{project.description}</p>
                )}
                {project.url && (
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline"
                  >
                    View project<ExternalLink size={13} strokeWidth={1.5} />
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
