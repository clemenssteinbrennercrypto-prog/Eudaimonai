import { describe, expect, it } from 'vitest'
import { EVENTS, sanitizeUrl } from './analytics'

describe('website statistics', () => {
  it('never sends a query string or hash, so the invited email in /activate stays private', () => {
    expect(sanitizeUrl('https://eudaimonai.app/activate?email=ada%40example.com')).toBe('https://eudaimonai.app/activate')
    expect(sanitizeUrl('https://eudaimonai.app/?utm_source=x#faq')).toBe('https://eudaimonai.app/')
    expect(sanitizeUrl('not a url')).toBeNull()
  })

  it('names the funnel steps the privacy policy describes', () => {
    expect(EVENTS.betaRequested).toBe('Beta access requested')
    expect(EVENTS.downloadStarted).toBe('Download started')
  })
})
