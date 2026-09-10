import { useState, useEffect } from 'react'
import { Link } from 'react-router'
import { ArrowUp, ArrowDown } from 'lucide-react'
import { useAdminConfig } from '../../hooks/useAdminConfig'
import { PageShell, EditableCard, Field, Input, InputWithPrefix, Textarea, Toggle } from '../../components/admin/AdminPage'
import RoleGuard from '../../components/admin/RoleGuard'
import AvatarCropperModal from '../../components/AvatarCropperModal'

// Matches the public project card's computed proportions (w-full h-48 in a
// 2-column grid at the default wide page width) — object-cover still masks
// any residual mismatch across breakpoints, this just controls framing.
const PROJECT_IMAGE_ASPECT = 2.1

function DisplayValue({ value, fallback = '—' }) {
  return <p className="text-sm text-gray-900">{value || <span className="text-gray-400">{fallback}</span>}</p>
}

export default function AdminProjectsPage() {
  return (
    <RoleGuard minRole="editor" fallback="/admin/blog/posts">
      <AdminProjectsPageContent />
    </RoleGuard>
  )
}

function AdminProjectsPageContent() {
  const { config, loading: configLoading, save } = useAdminConfig()
  const [projects, setProjects] = useState([])
  const [projLoading, setProjLoading] = useState(true)
  const [editingProject, setEditingProject] = useState(null) // null | project object | 'new'
  const [projForm, setProjForm] = useState({ title: '', description: '', url: '', visible: true })
  const [projSaving, setProjSaving] = useState(false)
  const [projError, setProjError] = useState('')
  const [uploadingImg, setUploadingImg] = useState(false)
  const [imgFile, setImgFile] = useState(null)
  const [imgCropSrc, setImgCropSrc] = useState(null)

  useEffect(() => { fetchProjects() }, [])

  async function fetchProjects() {
    const res = await fetch('/api/admin/projects', { credentials: 'include' })
    if (res.ok) setProjects(await res.json())
    setProjLoading(false)
  }

  function openNew() {
    setEditingProject('new')
    setProjForm({ title: '', description: '', url: '', visible: true, image_filename: null })
    setProjError('')
    setImgFile(null)
    setImgCropSrc(null)
  }

  function openEdit(p) {
    setEditingProject(p)
    setProjForm({ title: p.title, description: p.description || '', url: p.url || '', visible: p.visible, image_filename: p.image_filename })
    setProjError('')
    setImgFile(null)
    setImgCropSrc(null)
  }

  function closeImgCropper() {
    if (imgCropSrc) URL.revokeObjectURL(imgCropSrc)
    setImgCropSrc(null)
  }

  function handleImgCropped(blob) {
    setImgFile(new File([blob], 'project.png', { type: 'image/png' }))
    closeImgCropper()
  }

  async function saveProject() {
    setProjSaving(true)
    setProjError('')
    try {
      let image_filename = projForm.image_filename
      if (imgFile) {
        setUploadingImg(true)
        const fd = new FormData()
        fd.append('file', imgFile)
        const up = await fetch('/api/admin/upload', { method: 'POST', credentials: 'include', body: fd })
        setUploadingImg(false)
        if (!up.ok) throw new Error('Image upload failed')
        image_filename = (await up.json()).filename
      }
      const payload = { ...projForm, image_filename }
      const isNew = editingProject === 'new'
      const res = await fetch(
        isNew ? '/api/admin/projects' : `/api/admin/projects/${editingProject.id}`,
        {
          method: isNew ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      if (isNew) setProjects(p => [...p, data])
      else setProjects(p => p.map(x => x.id === data.id ? data : x))
      setEditingProject(null)
    } catch (err) {
      setProjError(err.message)
    } finally {
      setProjSaving(false)
      setUploadingImg(false)
    }
  }

  async function deleteProject(id) {
    if (!confirm('Delete this project?')) return
    const res = await fetch(`/api/admin/projects/${id}`, { method: 'DELETE', credentials: 'include' })
    if (res.ok) setProjects(p => p.filter(x => x.id !== id))
  }

  async function move(index, direction) {
    const updated = [...projects]
    const target = index + direction
    if (target < 0 || target >= updated.length) return
    ;[updated[index], updated[target]] = [updated[target], updated[index]]
    const reordered = updated.map((p, i) => ({ ...p, order: i + 1 }))
    setProjects(reordered)
    await fetch('/api/admin/projects/reorder', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(reordered.map(p => ({ id: p.id, order: p.order }))),
    })
  }

  if (configLoading) return <div className="p-8 text-gray-400">Loading…</div>

  return (
    <PageShell title="Projects Page">
      <div className="flex flex-col gap-6">

        <EditableCard
          title="Page settings"
          description="Configure projects page visibility and content"
          savedValues={{
            projects_enabled: config?.projects_enabled ?? false,
            projects_page_name: config?.projects_page_name || 'Projects',
            projects_slug: config?.projects_slug || 'projects',
          }}
          onSave={values => save(values)}
        >
          {({ editing, local, set }) => editing ? (
            <>
              <Toggle label="Enable projects page" checked={local.projects_enabled} onChange={v => set('projects_enabled', v)} />
              <Field label="Link label">
                <Input value={local.projects_page_name} onChange={e => set('projects_page_name', e.target.value)} />
              </Field>
              <Field label="Page URL address" hint="Letters, numbers, and hyphens only. A page reload is needed for URL changes to take effect.">
                <InputWithPrefix prefix={`https://${config?.domain || 'example.com'}/`} value={local.projects_slug} onChange={e => set('projects_slug', e.target.value.replace(/^\/+/, ''))} placeholder="projects" />
              </Field>
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Status</p>
                <p className="text-sm">
                  {local.projects_enabled
                    ? <span className="text-[#30cf43] font-medium">Enabled</span>
                    : <span className="text-gray-400">Disabled</span>
                  }
                </p>
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">Link label</p>
                <DisplayValue value={local.projects_page_name} />
              </div>
              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-gray-500">URL</p>
                <DisplayValue value={local.projects_slug ? `/${local.projects_slug}` : ''} fallback="/projects" />
              </div>
            </>
          )}
        </EditableCard>

        <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Page intro text</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              {config?.projects_text ? 'Content set' : 'No intro text set'}
            </p>
          </div>
          <Link
            to="/admin/projects/edit"
            className="rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-700 transition-colors shrink-0"
          >
            Edit content
          </Link>
        </div>

        <hr className="border-gray-200" />
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-800">Projects</h2>
          <button onClick={openNew} className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 transition-colors">
            Add project
          </button>
        </div>

        {projLoading ? (
          <p className="text-gray-400 text-sm">Loading…</p>
        ) : projects.length === 0 ? (
          <p className="text-gray-400 text-sm">No projects yet.</p>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {projects.map((p, i) => (
              <div key={p.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-200' : ''}`}>
                {p.image_filename && (
                  <img src={`/api/uploads/${p.image_filename}`} alt="" className="w-10 h-10 rounded object-cover shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{p.title}</p>
                  {p.url && <p className="text-xs text-gray-500 truncate">{p.url}</p>}
                </div>
                <span className={`inline-flex items-center leading-none text-xs px-2 py-1 rounded-full ${p.visible ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  <span className="translate-y-px">{p.visible ? 'visible' : 'hidden'}</span>
                </span>
                <div className="flex gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                    <ArrowUp size={14} strokeWidth={1.5} />
                  </button>
                  <button onClick={() => move(i, 1)} disabled={i === projects.length - 1} className="p-1 text-gray-400 hover:text-gray-700 disabled:opacity-30">
                    <ArrowDown size={14} strokeWidth={1.5} />
                  </button>
                </div>
                <button onClick={() => openEdit(p)} className="text-sm text-blue-600 hover:underline">Edit</button>
                <button onClick={() => deleteProject(p.id)} className="text-sm text-red-500 hover:text-red-700">Delete</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit/New project dialog */}
      {editingProject !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg w-full max-w-md p-6 flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            <h2 className="font-semibold text-gray-900">{editingProject === 'new' ? 'Add Project' : 'Edit Project'}</h2>
            <Field label="Title">
              <Input value={projForm.title} onChange={e => setProjForm(f => ({ ...f, title: e.target.value }))} />
            </Field>
            <Field label="Description">
              <Textarea rows={3} value={projForm.description || ''} onChange={e => setProjForm(f => ({ ...f, description: e.target.value }))} />
            </Field>
            <Field label="URL">
              <Input value={projForm.url || ''} onChange={e => setProjForm(f => ({ ...f, url: e.target.value }))} placeholder="https://…" />
            </Field>
            <Field label="Image">
              {projForm.image_filename && (
                <img src={`/api/uploads/${projForm.image_filename}`} alt="" className="w-full h-32 object-cover rounded mb-2" />
              )}
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.gif,.webp"
                onChange={e => {
                  const file = e.target.files[0]
                  if (file) setImgCropSrc(URL.createObjectURL(file))
                  e.target.value = ''
                }}
                className="text-sm text-gray-700"
              />
              {imgCropSrc && (
                <AvatarCropperModal
                  imageSrc={imgCropSrc}
                  onCancel={closeImgCropper}
                  onCropped={handleImgCropped}
                  cropShape="rect"
                  aspect={PROJECT_IMAGE_ASPECT}
                  outputWidth={1200}
                  title="Crop project image"
                />
              )}
            </Field>
            <Toggle label="Visible on site" checked={projForm.visible} onChange={v => setProjForm(f => ({ ...f, visible: v }))} />
            {projError && <p className="text-sm text-red-600">{projError}</p>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => setEditingProject(null)} className="text-sm text-gray-500 hover:text-gray-700">Cancel</button>
              <button
                onClick={saveProject}
                disabled={projSaving || uploadingImg || !projForm.title}
                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {projSaving || uploadingImg ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  )
}
