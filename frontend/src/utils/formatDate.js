// Matches the "Sep 2, 2026" convention used throughout the admin (see
// AdminBlogPostsPage.jsx, AdminUsersPage.jsx, etc.) — takes a plain
// "YYYY-MM-DD" date (as returned by the analytics endpoints) and parses it
// as local midnight rather than UTC midnight, so it never lands on the
// previous day for timezones behind UTC.
export function formatAdminDate(isoDate) {
  if (!isoDate) return ''
  const d = new Date(`${isoDate}T00:00:00`)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// "MM/DD/YYYY" — used alongside a range label (e.g. "Last 7 days") so a
// reader can tell exactly which dates a set of numbers covers.
export function formatShortDate(isoDate) {
  if (!isoDate) return ''
  const d = new Date(`${isoDate}T00:00:00`)
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}

// Same convention plus a time-of-day — for a full ISO datetime (e.g. a
// BlogPost's publish_date), not a plain "YYYY-MM-DD" date.
export function formatAdminDateTime(isoDatetime) {
  if (!isoDatetime) return ''
  const d = new Date(isoDatetime)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}
