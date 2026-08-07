import { useState } from 'react'
import { useUserAuth } from '../context/UserAuthContext'
import { useSiteConfig } from './useSiteConfig'

// Shared gate for actions that require a signed-in user. Returns whether the
// action is even available (so callers can hide/disable the trigger when user
// accounts are turned off site-wide) plus a `requireSignIn()` guard and modal
// visibility state to render <SignInRequiredModal>.
export function useRequireSignIn() {
  const { user } = useUserAuth()
  const { config } = useSiteConfig()
  const [showSignInModal, setShowSignInModal] = useState(false)
  const signInAvailable = !!config?.users_enabled

  function requireSignIn() {
    if (user) return true
    if (signInAvailable) setShowSignInModal(true)
    return false
  }

  return { user, signInAvailable, showSignInModal, setShowSignInModal, requireSignIn }
}
