import { useRef, useState } from 'react'
import { useSiteConfig } from '../hooks/useSiteConfig'
import { useTrackPageView } from '../hooks/useTrackPageView'
import { fetchSiteConfig } from '../lib/apiFetch'
import { buildMeta, siteFallbackImage, notFoundMeta, isNavEnabled } from '../utils/meta'
import ScrollableHeaderNav from '../components/ScrollableHeaderNav'
import CodeBlockCopyToast from '../components/CodeBlockCopyToast'
import HeaderImageLqip from '../components/HeaderImageLqip'
import FullscreenHeaderNav from '../components/FullscreenHeaderNav'
import NotFoundPage from './NotFoundPage'

const INITIAL = { name: '', email: '', subject: '', message: '' }

// Purely for meta() below — see HomePage.jsx for why this route needs its
// own directly-awaited config fetch. Page body still reads from context.
export async function loader() {
  return fetchSiteConfig()
}

export async function clientLoader() {
  return fetchSiteConfig()
}
clientLoader.hydrate = true

export function meta({ data }) {
  if (!isNavEnabled(data, 'contact')) return notFoundMeta(data)
  return buildMeta({
    title: data?.site_title ? `${data.contact_page_name ?? 'Contact'} - ${data.site_title}` : undefined,
    description: data?.contact_meta_description,
    image: siteFallbackImage(data),
  })
}

export default function ContactPage() {
  const { config } = useSiteConfig()
  const contentRef = useRef(null)
  const [form, setForm] = useState(INITIAL)
  const [status, setStatus] = useState(null) // 'sending' | 'success' | 'error'
  const [errorMsg, setErrorMsg] = useState('')
  const isFormFilled = Object.values(form).every(v => v.trim() !== '')
  useTrackPageView('page', isNavEnabled(config, 'contact') ? 'contact' : null)

  function handleChange(e) {
    setForm(f => ({ ...f, [e.target.name]: e.target.value }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setStatus('sending')
    setErrorMsg('')

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (res.ok) {
        setStatus('success')
        setForm(INITIAL)
      } else {
        setStatus('error')
        setErrorMsg(data.error || 'Something went wrong.')
      }
    } catch {
      setStatus('error')
      setErrorMsg('Network error. Please try again.')
    }
  }

  if (!isNavEnabled(config, 'contact')) return <NotFoundPage />

  return (
    <main className={`mx-auto px-6 pt-10 pb-16 ${config?.contact_page_width === 'narrow' ? 'max-w-[524px]' : 'max-w-2xl'}`}>
      {config?.contact_text && (
        <>
          <div
            ref={contentRef}
            className={`prose prose-gray max-w-none blog-content page-header-content ${config?.contact_font_family === 'sans' ? 'font-sans' : 'font-serif'} mb-8`}
            data-page-width={config?.contact_page_width === 'narrow' ? 'narrow' : 'regular'}
            data-font-family={config?.contact_font_family || 'default'}
            dangerouslySetInnerHTML={{ __html: config.contact_text }}
          />
          {config.contact_scrollable_nav_enabled && (
            <ScrollableHeaderNav containerRef={contentRef} contentKey={config.contact_text} />
          )}
          <CodeBlockCopyToast containerRef={contentRef} contentKey={config.contact_text} />
          <HeaderImageLqip containerRef={contentRef} contentKey={config.contact_text} />
          <FullscreenHeaderNav containerRef={contentRef} contentKey={config.contact_text} />
        </>
      )}

      {status === 'success' ? (
        <div className="rounded-lg bg-green-50 border border-green-200 px-6 py-5">
          <p className="text-green-800 font-medium">Message sent. Thanks for reaching out!</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Field label="Name" name="name" value={form.name} onChange={handleChange} required />
            <Field label="Email" name="email" type="email" value={form.email} onChange={handleChange} required />
          </div>
          <Field label="Subject" name="subject" value={form.subject} onChange={handleChange} required />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-gray-700" htmlFor="message">Message</label>
            <textarea
              id="message"
              name="message"
              rows={6}
              value={form.message}
              onChange={handleChange}
              required
              className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400 resize-y"
            />
          </div>

          {status === 'error' && (
            <p className="text-sm text-red-600">{errorMsg}</p>
          )}

          <button
            type="submit"
            disabled={!isFormFilled || status === 'sending'}
            className={`self-start rounded-md border px-5 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 ${
              isFormFilled
                ? 'bg-blue-600 border-blue-600 text-white hover:bg-blue-700'
                : 'bg-white border-gray-300 text-gray-400'
            }`}
          >
            {status === 'sending' ? 'Sending…' : 'Send message'}
          </button>
        </form>
      )}
    </main>
  )
}

function Field({ label, name, type = 'text', value, onChange, required }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700" htmlFor={name}>{label}</label>
      <input
        id={name}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        required={required}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400"
      />
    </div>
  )
}
