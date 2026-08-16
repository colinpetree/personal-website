import { useState } from 'react'
import { useUserAuth } from '../context/UserAuthContext'

// Shared gate for demo actions that require a user account to have been granted
// ai_demo_access (staff accounts get this implicitly, see /api/auth/me). Mirrors
// useRequireSignIn's shape so demo pages can chain both checks the same way.
export function useRequireAiDemoAccess() {
  const { user } = useUserAuth()
  const [showAccessModal, setShowAccessModal] = useState(false)
  const hasAccess = !!user?.ai_demo_access

  function requireAccess() {
    if (hasAccess) return true
    setShowAccessModal(true)
    return false
  }

  return { hasAccess, showAccessModal, setShowAccessModal, requireAccess }
}
