import { useState, useEffect, useRef } from 'react'
import { Share, Link, Mail } from 'lucide-react'
import { Tooltip } from './ui/Tooltip'
import { getPlatformMonoSvg } from './admin/editor/socialIcons'
import { useToast } from '../context/ToastContext'

function shareUrls(url, title) {
  const u = encodeURIComponent(url)
  const t = encodeURIComponent(title)
  return {
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${u}`,
    linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${u}`,
    x: `https://twitter.com/intent/tweet?url=${u}&text=${t}`,
    bluesky: `https://bsky.app/intent/compose?text=${t}%20${u}`,
  }
}

function SocialIcon({ platformKey }) {
  return (
    <span
      className="w-[18px] h-[18px] flex items-center justify-center shrink-0 text-current [&>svg]:w-full [&>svg]:h-full"
      dangerouslySetInnerHTML={{ __html: getPlatformMonoSvg(platformKey) }}
    />
  )
}

function trackShare(postId, platform) {
  if (!postId) return
  fetch('/api/analytics/track-share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ post_id: postId, platform }),
  }).catch(() => {})
}

export default function ShareButton({ url, title, siteTitle, postId }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const { addToast } = useToast()

  useEffect(() => {
    if (!open) return
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(url)
      addToast('Link copied')
      trackShare(postId, 'copy_link')
    } catch {}
  }

  function handleEmail() {
    const intro = siteTitle
      ? `I thought you'd like this article from ${siteTitle}: ${title}`
      : `I thought you'd like this article: ${title}`
    window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(`${intro}\n\n${url}`)}`
    trackShare(postId, 'email')
  }

  function handleSocial(href, platform) {
    const width = 600
    const height = 500
    const rect = ref.current?.getBoundingClientRect()
    // Anchor the popup over the share button (in screen coordinates) instead
    // of letting the browser default it to the top-left of the display.
    const left = rect ? Math.round(window.screenX + rect.left) : undefined
    const top = rect ? Math.round(window.screenY + rect.bottom + 8) : undefined
    const features = [`width=${width}`, `height=${height}`, ...(left !== undefined ? [`left=${left}`, `top=${top}`] : [])].join(',')
    window.open(href, '_blank', `noopener,noreferrer,${features}`)
    trackShare(postId, platform)
  }

  const social = shareUrls(url, title)

  const items = [
    { key: 'link', label: 'Copy link', icon: <Link size={18} />, onClick: handleCopyLink },
    { key: 'mail', label: 'Email link', icon: <Mail size={18} />, onClick: handleEmail },
    { key: 'linkedin', label: 'Share on LinkedIn', icon: <SocialIcon platformKey="linkedin" />, onClick: () => handleSocial(social.linkedin, 'linkedin') },
    { key: 'x', label: 'Share on X', icon: <SocialIcon platformKey="x" />, onClick: () => handleSocial(social.x, 'x') },
    { key: 'bluesky', label: 'Share on Bluesky', icon: <SocialIcon platformKey="bluesky" />, onClick: () => handleSocial(social.bluesky, 'bluesky') },
    { key: 'facebook', label: 'Share on Facebook', icon: <SocialIcon platformKey="facebook" />, onClick: () => handleSocial(social.facebook, 'facebook') },
  ]

  return (
    <div ref={ref} className="relative inline-block">
      <Tooltip content="Share">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center justify-center w-9 h-9 rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
          aria-label="Share"
        >
          <Share size={18} />
        </button>
      </Tooltip>
      {open && (
        <div className="absolute right-0 top-11 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1.5 min-w-[210px]">
          {items.map(item => (
            <div key={item.key}>
              <button
                onClick={() => { item.onClick(); if (item.key !== 'link') setOpen(false) }}
                className="w-full flex items-center gap-3 text-left px-4 py-2 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-50 transition-colors"
              >
                <span className="w-[18px] flex items-center justify-center shrink-0">{item.icon}</span>
                {item.label}
              </button>
              {(item.key === 'link' || item.key === 'mail') && (
                <div className="my-1.5 border-t border-gray-100" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
