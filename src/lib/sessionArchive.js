export const SESSION_ARCHIVE_SCHEMA_VERSION = 1

export const ARCHIVE_SETTING_KEYS = Object.freeze([
  'eudaimonia_onboarded',
  'eudaimonia_ambient_pref',
  'eudaimonia_gentle_reminder_pref',
  'eudaimonia_desk_hint_seen',
  'eudaimonia_focus_apps',
  'eudaimonia_focus_mode_enabled',
  'eudaimonia_protection_setups_v1',
  'eudaimonia_strict_mode',
  'eudaimonia_devices',
  'eudaimonia_workspaces_v1',
])

export function readArchiveSettings(storage = globalThis.localStorage) {
  const settings = {}
  for (const key of ARCHIVE_SETTING_KEYS) {
    const value = storage?.getItem(key)
    if (value != null) settings[key] = value
  }
  return settings
}

export function restoreArchiveSettings(settings, storage = globalThis.localStorage) {
  if (settings == null) return 0
  if (typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('The backup app settings are invalid.')
  }
  let restored = 0
  for (const key of ARCHIVE_SETTING_KEYS) {
    if (!(key in settings)) continue
    const value = settings[key]
    if (typeof value !== 'string' || value.length > 1_000_000) {
      throw new Error(`The backup setting ${key} is invalid.`)
    }
    storage.setItem(key, value)
    restored += 1
  }
  return restored
}

export function validateSessionArchive(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('This file is not an Eudaimonai backup.')
  }
  if (value.schemaVersion !== SESSION_ARCHIVE_SCHEMA_VERSION) {
    throw new Error(`Unsupported backup schema: ${String(value.schemaVersion ?? 'missing')}.`)
  }
  if (!Array.isArray(value.sessions)) {
    throw new Error('The backup does not contain a session list.')
  }

  const ids = new Set()
  for (const session of value.sessions) {
    const id = typeof session?.id === 'string' ? session.id.trim() : ''
    if (!id) throw new Error('The backup contains a session without an id.')
    if (ids.has(id)) throw new Error(`The backup contains a duplicate session id: ${id}.`)
    ids.add(id)
  }

  return {
    schemaVersion: SESSION_ARCHIVE_SCHEMA_VERSION,
    sessions: value.sessions,
    focusScoreSchedule: value.focusScoreSchedule,
    appSettings: value.appSettings,
  }
}
