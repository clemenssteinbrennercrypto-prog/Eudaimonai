import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { shouldRenderWebsite } from './web/routes'
import './App.css'

// The public website (landing, beta funnel, admin) is a separate lazy chunk
// and renders without App, so a website visit never runs the app's local
// history code and the native app never loads the website's network client.
const Website = lazy(() => import('./web/Website'))

const website = shouldRenderWebsite({
  isNative: Boolean(window.__TAURI__?.core?.invoke),
  isDev: import.meta.env.DEV,
  pathname: window.location.pathname,
  search: window.location.search,
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      {website
        ? <Suspense fallback={<div style={{ minHeight: '100vh', background: '#080A0F' }} />}><Website /></Suspense>
        : <App />}
    </ErrorBoundary>
  </React.StrictMode>
)
