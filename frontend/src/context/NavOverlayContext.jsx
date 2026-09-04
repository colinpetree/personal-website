import { createContext, useContext, useState } from 'react'

const NavOverlayContext = createContext(null)

export function useNavOverlay() {
  return useContext(NavOverlayContext)
}

// Lets a page tell Navbar "my first content node is a fullscreen HeaderNode
// — overlay yourself transparently on top of it instead of pushing it down,
// with white text, until the user scrolls" (see useFullscreenHeaderNav).
// Only one route renders at a time, so a single boolean is enough — no need
// to key it per-page.
export function NavOverlayProvider({ children }) {
  const [overlay, setOverlay] = useState(false)
  return (
    <NavOverlayContext.Provider value={{ overlay, setOverlay }}>
      {children}
    </NavOverlayContext.Provider>
  )
}
