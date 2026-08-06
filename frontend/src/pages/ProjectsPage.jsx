import { useState, useEffect } from 'react'
import { ExternalLink } from 'lucide-react'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { setMetaDescription } from '../utils/meta'

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

export default function ProjectsPage() {
  const { config } = useSiteConfig()
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (config?.site_title) {
      document.title = `${config.projects_page_name ?? 'Projects'} - ${config.site_title}`
    }
    setMetaDescription(config?.projects_meta_description)
  }, [config])

  useEffect(() => {
    fetch('/api/projects')
      .then(res => res.ok ? res.json() : [])
      .then(data => { setProjects(data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  return (
    <main className="max-w-4xl mx-auto px-6 py-16">
      {config?.projects_text && (
        <div
          className="prose prose-gray max-w-none blog-content mb-12"
          dangerouslySetInnerHTML={{ __html: config.projects_text }}
        />
      )}

      {loading ? (
        <div className="grid gap-6 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <ProjectCardSkeleton key={i} />)}
        </div>
      ) : projects.length === 0 ? (
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
