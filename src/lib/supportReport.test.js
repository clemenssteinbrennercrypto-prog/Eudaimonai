import { describe, expect, it } from 'vitest'
import { buildSupportReport } from './supportReport'

describe('support report privacy boundary', () => {
  it('keeps operational state but excludes private activity and secret-bearing details', () => {
    const report = buildSupportReport({
      generatedAt: '2026-10-03T15:00:00.000Z',
      platform: 'MacIntel',
      debug: {
        companionVersion: '0.1.261003',
        sessionState: 'inactive',
        helperInstalled: true,
        hostBlockActive: false,
        missingPermissions: ['Safari'],
        lastActivity: { app: 'Secret Project', url: 'https://private.example', title: 'Private title' },
        lastOsascriptError: 'private browser detail',
        hostBlockError: '/private/path',
        apiKey: 'sk-secret',
      },
      camera: { state: 'running', frameSequence: 42, fault: null, landmarks: [{ x: 1 }] },
    })

    expect(report.companion).toMatchObject({
      connected: true,
      sessionState: 'inactive',
      helperInstalled: true,
      permissionGapCount: 1,
      automationErrorPresent: true,
      hostBlockErrorPresent: true,
    })
    expect(report.camera).toEqual({ state: 'running', faultPresent: false, hasProducedFrames: true })
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain('Secret Project')
    expect(serialized).not.toContain('private.example')
    expect(serialized).not.toContain('Private title')
    expect(serialized).not.toContain('/private/path')
    expect(serialized).not.toContain('sk-secret')
    expect(serialized).not.toContain('"landmarks":')
  })

  it('degrades safely outside the native runtime', () => {
    const report = buildSupportReport({ generatedAt: 'now', platform: 'unknown' })
    expect(report.companion.connected).toBe(false)
    expect(report.companion.helperInstalled).toBeNull()
    expect(report.camera.state).toBeNull()
  })
})
