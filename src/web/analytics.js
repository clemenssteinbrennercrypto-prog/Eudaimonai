import { inject, track } from '@vercel/analytics'

// Website statistics, as the privacy policy describes them ("Website
// statistics"): Vercel Web Analytics, cookieless and without device storage.
// Only the public website calls this; the native app never renders it.
//
// Every page view is sent without its query string or hash, because /activate
// carries the invited email address in `?email=`. Events carry names and a
// short place or outcome, never anything a visitor typed.

let started = false

export function sanitizeUrl(url) {
  try {
    const parsed = new URL(url)
    return `${parsed.origin}${parsed.pathname}`
  } catch {
    return null
  }
}

export function startAnalytics({ dev = import.meta.env.DEV } = {}) {
  if (started || typeof window === 'undefined' || /jsdom/i.test(navigator.userAgent)) return
  started = true
  inject({
    mode: dev ? 'development' : 'production',
    beforeSend: event => {
      const url = sanitizeUrl(event.url)
      return url ? { ...event, url } : null
    },
  })
}

// Named steps of the funnel. Kept in one place so the dashboard's event names
// stay stable.
export const EVENTS = {
  betaRequested: 'Beta access requested',
  betaRequestFailed: 'Beta request failed',
  activationCodeSent: 'Activation code sent',
  activated: 'Beta activated',
  activationRefused: 'Activation refused',
  downloadStarted: 'Download started',
}

export function trackEvent(name, properties) {
  if (typeof window === 'undefined' || /jsdom/i.test(navigator.userAgent)) return
  try {
    track(name, properties)
  } catch {
    // Statistics must never break the page.
  }
}
