import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useUserAuth } from '../context/UserAuthContext'

export default function MagicLinkVerifyPage() {
  const [searchParams] = useSearchParams()
  const { verifyMagicLink } = useUserAuth()
  const [status, setStatus] = useState('verifying') // 'verifying' | 'error'
  const ranRef = useRef(false)

  useEffect(() => {
    if (ranRef.current) return
    ranRef.current = true

    const token = searchParams.get('token')
    const next = searchParams.get('next') || '/'

    if (!token) {
      setStatus('error')
      return
    }

    verifyMagicLink(token)
      .then(() => {
        // A full page load (not client-side navigate) so every context —
        // AdminAuthContext included — re-fetches fresh identity from the
        // server, matching how the Google OAuth redirect flow already
        // behaves. Without this, a stale admin session already loaded into
        // AdminAuthContext in this tab would keep showing as logged in even
        // though the backend just ended it (magic_link_verify() logs out
        // any active admin session, same as google_callback()).
        window.location.href = next
      })
      .catch(() => setStatus('error'))
  }, [searchParams, verifyMagicLink])

  if (status === 'error') {
    return (
      <main className="max-w-xl mx-auto px-6 pt-10 pb-16 text-center">
        <h1 className="text-xl font-semibold text-gray-900 mb-2">This link is invalid or has expired</h1>
        <p className="text-gray-500">Please request a new sign-in link and try again.</p>
      </main>
    )
  }

  return (
    <main className="max-w-xl mx-auto px-6 pt-10 pb-16 text-center">
      <p className="text-gray-400">Signing you in…</p>
    </main>
  )
}
