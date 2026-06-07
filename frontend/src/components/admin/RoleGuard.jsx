import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminAuth, isAtLeast } from '../../context/AdminAuthContext'

/**
 * Wraps a route element and redirects if the current admin doesn't meet minRole.
 * fallback: string path, or function (admin) => string for role-dependent destinations.
 * Returns null while loading or when access is denied (prevents content flash).
 */
export default function RoleGuard({ minRole, fallback, children }) {
  const { admin, loading } = useAdminAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (!loading && admin && !isAtLeast(admin, minRole)) {
      const dest = typeof fallback === 'function' ? fallback(admin) : fallback
      navigate(dest, { replace: true })
    }
  }, [admin?.role, loading])

  if (loading || !admin || !isAtLeast(admin, minRole)) return null
  return children
}
