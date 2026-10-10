import { useEffect, useMemo } from 'react'
import LandingPage from './landing/LandingPage'
import LegalPage from './LegalPage'
import ActivatePage from './ActivatePage'
import DownloadPage from './DownloadPage'
import AdminConsole from './AdminConsole'
import { webRoute } from './routes'
import { createBetaApi } from './betaApi'
import { getSupabase } from './supabaseClient'
import './web.css'

// The landing and legal pages are light; the funnel and admin pages are dark.
const LIGHT = '#FFFFFF'
const DARK = '#080A0F'

const PAGES = {
  '/': { title: 'Eudaimonai · Focus sessions for Mac', index: true, theme: LIGHT },
  '/activate': { title: 'Activate your beta access · Eudaimonai', index: false, theme: DARK },
  '/download': { title: 'Download · Eudaimonai', index: true, theme: DARK },
  '/admin': { title: 'Beta admin · Eudaimonai', index: false, theme: DARK },
  '/privacy': { title: 'Privacy Policy · Eudaimonai', index: true, theme: LIGHT },
  '/legal': { title: 'Legal Notice · Eudaimonai', index: true, theme: LIGHT },
}

function useDocumentMeta({ title, index, theme }) {
  useEffect(() => {
    document.title = title
    let themeColor = document.querySelector('meta[name="theme-color"]')
    themeColor ??= document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }))
    themeColor.content = theme
    let robots = document.querySelector('meta[name="robots"]')
    if (!index) {
      robots ??= Object.assign(document.createElement('meta'), { name: 'robots' })
      robots.content = 'noindex, nofollow'
      document.head.appendChild(robots)
    } else {
      robots?.remove()
    }
  }, [title, index, theme])
}

export default function Website({ api: injectedApi, pathname = window.location.pathname }) {
  const route = webRoute(pathname)
  const api = useMemo(() => {
    if (injectedApi) return injectedApi
    const client = getSupabase()
    return client ? createBetaApi(client) : { configured: false }
  }, [injectedApi])
  useDocumentMeta(PAGES[route])

  if (route === '/activate') return <ActivatePage api={api} />
  if (route === '/download') return <DownloadPage />
  if (route === '/admin') return <AdminConsole api={api} />
  if (route === '/privacy' || route === '/legal') return <LegalPage route={route} />
  return <LandingPage api={api} />
}
