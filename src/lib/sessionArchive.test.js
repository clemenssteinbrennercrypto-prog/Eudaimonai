import { describe, expect, it } from 'vitest'
import { readArchiveSettings, restoreArchiveSettings, validateSessionArchive } from './sessionArchive'

describe('session archive validation', () => {
  it('accepts a versioned archive with unique session ids', () => {
    expect(validateSessionArchive({
      schemaVersion: 1,
      sessions: [{ id: 'a' }, { id: 'b' }],
      focusScoreSchedule: { version: 1, plans: [] },
    })).toMatchObject({ sessions: [{ id: 'a' }, { id: 'b' }] })
  })

  it('rejects unknown schemas before any restore can start', () => {
    expect(() => validateSessionArchive({ schemaVersion: 2, sessions: [] }))
      .toThrow('Unsupported backup schema')
  })

  it('rejects missing and duplicate ids', () => {
    expect(() => validateSessionArchive({ schemaVersion: 1, sessions: [{}] }))
      .toThrow('without an id')
    expect(() => validateSessionArchive({ schemaVersion: 1, sessions: [{ id: 'same' }, { id: 'same' }] }))
      .toThrow('duplicate session id')
  })
})

describe('archive settings', () => {
  it('exports and restores only the explicit non-secret allowlist', () => {
    const source = new Map([
      ['eudaimonia_ambient_pref', 'true'],
      ['eudaimonia_output_folder', '/private/work'],
      ['secret', 'never'],
    ])
    const target = new Map()
    const sourceStorage = { getItem: key => source.get(key) ?? null }
    const targetStorage = { setItem: (key, value) => target.set(key, value) }

    expect(readArchiveSettings(sourceStorage)).toEqual({ eudaimonia_ambient_pref: 'true' })
    expect(restoreArchiveSettings({ eudaimonia_ambient_pref: 'false', secret: 'never' }, targetStorage)).toBe(1)
    expect(Object.fromEntries(target)).toEqual({ eudaimonia_ambient_pref: 'false' })
  })

  it('rejects oversized or non-string settings', () => {
    expect(() => restoreArchiveSettings({ eudaimonia_ambient_pref: false }, { setItem() {} })).toThrow('invalid')
  })
})
