import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { LOCKED_WHEN_READ_ONLY, accessView, confirmSessionAccess, mayNavigate } from './accessGate'

const active = { phase: 'active', mayStartSessions: true, source: 'verified' }
const lapsed = { phase: 'lapsed', mayStartSessions: false }

describe('accessView', () => {
  it('never gates outside the native app (browser dev view)', () => {
    expect(accessView({ native: false, status: lapsed, screen: 'lab', viewingHistory: false })).toBe('app')
  })

  it('shows the access step without access, and while the first status is loading', () => {
    expect(accessView({ native: true, status: lapsed, screen: 'lab', viewingHistory: false })).toBe('access')
    expect(accessView({ native: true, status: null, screen: 'lab', viewingHistory: false })).toBe('access')
  })

  it('offers read-only history only when chosen', () => {
    expect(accessView({ native: true, status: lapsed, screen: 'analytics', viewingHistory: true })).toBe('read_only')
  })

  it('never interrupts a running session, whatever access says', () => {
    expect(accessView({ native: true, status: lapsed, screen: 'session', viewingHistory: false })).toBe('app')
  })

  it('opens the app with access', () => {
    expect(accessView({ native: true, status: active, screen: 'lab', viewingHistory: true })).toBe('app')
  })
})

describe('read-only navigation', () => {
  it('allows only analytics (view and export); session, workspace calibration and protection stay locked', () => {
    expect(mayNavigate('read_only', 'analytics')).toBe(true)
    for (const destination of ['lab', 'session-setup', 'setup', 'focus-apps']) {
      expect(mayNavigate('read_only', destination)).toBe(false)
    }
    expect(LOCKED_WHEN_READ_ONLY).not.toContain('analytics')
    expect(mayNavigate('app', 'setup')).toBe(true)
  })
})

describe('confirmSessionAccess', () => {
  it('uses a fresh verification without asking the server again', async () => {
    const access = { native: true, status: active, check: vi.fn() }
    expect(await confirmSessionAccess(access)).toBe(true)
    expect(access.check).not.toHaveBeenCalled()
  })

  it('re-checks an older verification right before a session, so a revocation applies', async () => {
    const access = {
      native: true,
      status: { ...active, source: 'offline_grace' },
      check: vi.fn().mockResolvedValue({ status: lapsed, error: null }),
    }
    expect(await confirmSessionAccess(access)).toBe(false)
    expect(access.check).toHaveBeenCalledTimes(1)
  })

  it('falls back to the grace decision when the check cannot reach the server', async () => {
    const grace = { phase: 'active', mayStartSessions: true, source: 'offline_grace' }
    const access = { native: true, status: grace, check: vi.fn().mockResolvedValue({ status: null, error: 'network' }) }
    expect(await confirmSessionAccess(access)).toBe(true)
  })

  it('refuses without access', async () => {
    const access = { native: true, status: null, check: vi.fn().mockResolvedValue({ status: lapsed, error: null }) }
    expect(await confirmSessionAccess(access)).toBe(false)
  })
})

describe('the access UI never touches session history', () => {
  it('does not import history storage or clear anything', () => {
    const files = [
      'betaAccess.js',
      'accessGate.js',
      '../components/access/BetaAccess.jsx',
      '../components/access/AccessScreen.jsx',
      '../components/access/AccessBanner.jsx',
    ]
    for (const file of files) {
      const source = readFileSync(join(import.meta.dirname, file), 'utf8')
      for (const forbidden of ['sessionRepository', 'storage', 'clearAll', 'removeItem', 'localStorage', 'db_']) {
        expect(source, `${file} must not reference ${forbidden}`).not.toContain(forbidden)
      }
    }
  })
})
