import { useEffect, useMemo } from 'react'
import LandingPage from '../components/LandingPage'
import ActivatePage from './ActivatePage'
import DownloadPage from './DownloadPage'
import AdminConsole from './AdminConsole'
import { webRoute } from './routes'
import { createBetaApi } from './betaApi'
import { getSupabase } from './supabaseClient'
import './web.css'

const PAGES = {
  '/': { title: 'Eudaimonai · Focus sessions for Mac', index: true },
  '/activate': { title: 'Activate your beta access · Eudaimonai', index: false },
  '/download': { title: 'Download · Eudaimonai', index: true },
  '/admin': { title: 'Beta admin · Eudaimonai', index: false },
}

function useDocumentMeta({ title, index }) {
  useEffect(() => {
    document.title = title
    let robots = document.querySelector('meta[name="robots"]')
    if (!index) {
      robots ??= Object.assign(document.createElement('meta'), { name: 'robots' })
      robots.content = 'noindex, nofollow'
      document.head.appendChild(robots)
    } else {
      robots?.remove()
    }
  }, [title, index])
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
  return <LandingPage api={api} />
}
