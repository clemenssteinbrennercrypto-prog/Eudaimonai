import { describe, expect, it } from 'vitest'
import { isPrivilegedKey, readBackendConfig } from './config'

const jwt = payload => `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify(payload)).replace(/=+$/, '')}.sig`

describe('website backend config', () => {
  it('accepts the public URL and publishable key', () => {
    expect(readBackendConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abc' }))
      .toMatchObject({ configured: true, url: 'https://x.supabase.co', key: 'sb_publishable_abc' })
  })

  it('treats a missing value as not configured instead of guessing', () => {
    expect(readBackendConfig({}).configured).toBe(false)
    expect(readBackendConfig({ VITE_SUPABASE_URL: 'https://x.supabase.co' }).configured).toBe(false)
  })

  it('refuses a secret or service-role key in the website build', () => {
    expect(() => readBackendConfig({ VITE_SUPABASE_URL: 'u', VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_abc' })).toThrow(/privileged/)
    expect(isPrivilegedKey(jwt({ role: 'service_role' }))).toBe(true)
    expect(isPrivilegedKey(jwt({ role: 'anon' }))).toBe(false)
  })
})
