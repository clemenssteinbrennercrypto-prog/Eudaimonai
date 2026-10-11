import { describe, expect, it } from 'vitest'
import { shouldRenderWebsite, webRoute } from './routes'

describe('webRoute', () => {
  it('normalizes known paths and sends everything else to the landing page', () => {
    expect(webRoute('/activate')).toBe('/activate')
    expect(webRoute('/activate/')).toBe('/activate')
    expect(webRoute('/download?x=1')).toBe('/download')
    expect(webRoute('/admin')).toBe('/admin')
    expect(webRoute('/privacy')).toBe('/privacy')
    expect(webRoute('/legal/')).toBe('/legal')
    expect(webRoute('/anything-else')).toBe('/')
    expect(webRoute('')).toBe('/')
  })
})

describe('shouldRenderWebsite', () => {
  const base = { isNative: false, isDev: false, pathname: '/', search: '' }

  it('never renders the website inside the native app, on any path', () => {
    for (const pathname of ['/', '/activate', '/download', '/admin', '/privacy', '/legal']) {
      expect(shouldRenderWebsite({ ...base, isNative: true, pathname })).toBe(false)
      expect(shouldRenderWebsite({ ...base, isNative: true, isDev: true, pathname })).toBe(false)
    }
  })

  it('renders the website for every path of a production web build', () => {
    expect(shouldRenderWebsite(base)).toBe(true)
    expect(shouldRenderWebsite({ ...base, pathname: '/admin' })).toBe(true)
    expect(shouldRenderWebsite({ ...base, pathname: '/unknown' })).toBe(true)
  })

  it('keeps / as the app in local dev, and reaches funnel pages by path or ?landing', () => {
    expect(shouldRenderWebsite({ ...base, isDev: true })).toBe(false)
    expect(shouldRenderWebsite({ ...base, isDev: true, search: '?landing' })).toBe(true)
    expect(shouldRenderWebsite({ ...base, isDev: true, pathname: '/activate' })).toBe(true)
  })

  it('honours ?onboarding only in local dev, never on the public website', () => {
    expect(shouldRenderWebsite({ ...base, isDev: true, search: '?onboarding=1' })).toBe(false)
    expect(shouldRenderWebsite({ ...base, search: '?onboarding=1' })).toBe(true)
  })
})
