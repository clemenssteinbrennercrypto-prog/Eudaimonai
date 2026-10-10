// Which pages the public website serves, and when the website (rather than
// the app) renders at all. Kept free of the Supabase client so the app's own
// entry can import it without pulling the web funnel into its bundle.

export const WEB_ROUTES = ['/', '/activate', '/download', '/admin', '/privacy', '/legal']

export function webRoute(pathname = '/') {
  const path = `/${String(pathname).split(/[?#]/)[0].replace(/^\/+|\/+$/g, '')}`
  return WEB_ROUTES.includes(path) ? path : '/'
}

// The native app never renders the website. In production web builds every
// path is the website (Vercel rewrites all paths to index.html). In local dev
// `/` stays the app, so the funnel pages are reached by path or `?landing`.
// `?onboarding` forces the app's intro flow in local dev only: on the public
// website it must never open the app.
export function shouldRenderWebsite({ isNative, isDev, pathname, search }) {
  if (isNative) return false
  const params = new URLSearchParams(search)
  if (isDev && params.has('onboarding')) return false
  if (webRoute(pathname) !== '/' ) return true
  return !isDev || params.has('landing')
}
