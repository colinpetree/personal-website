// Avatar-circle fallback initials: first letter of the first two words in
// the name (e.g. "John Doe" -> "JD"), or just the first letter if there's
// only one word.
export function getInitials(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return (words[0]?.[0] || '?').toUpperCase()
}
