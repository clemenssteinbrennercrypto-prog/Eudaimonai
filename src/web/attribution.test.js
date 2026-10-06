import { describe, expect, it } from 'vitest'
import { attributionFromSearch } from './attribution'

describe('attributionFromSearch', () => {
  it('reads utm_source / utm_campaign as slugs the database accepts', () => {
    expect(attributionFromSearch('?utm_source=Reddit&utm_campaign=Launch Week!')).toEqual({ source: 'reddit', campaign: 'launch-week' })
  })

  it('falls back to ref, then to "direct"', () => {
    expect(attributionFromSearch('?ref=friend_list')).toEqual({ source: 'friend_list', campaign: null })
    expect(attributionFromSearch('')).toEqual({ source: 'direct', campaign: null })
  })

  it('never passes anything outside [a-z0-9_.-]{1,64}', () => {
    const { source } = attributionFromSearch(`?utm_source=${encodeURIComponent('<script>alert(1)</script>' + 'x'.repeat(100))}`)
    expect(source).toMatch(/^[a-z0-9_.-]{1,64}$/)
  })
})
