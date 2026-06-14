import { createContext, useContext } from 'react'

const SiteConfigContext = createContext(null)

export function SiteConfigProvider({ config, children }) {
  return (
    <SiteConfigContext.Provider value={config}>
      {children}
    </SiteConfigContext.Provider>
  )
}

export function useSiteConfig() {
  return { config: useContext(SiteConfigContext), loading: false }
}
