// localStorage-backed repository adapter.
//
// A thin async wrapper over storage.js, which keeps its existing behaviour
// unchanged — including the MAX_SESSIONS = 100 cap. That cap is the reason a
// native adapter exists at all; this adapter stays as the browser/dev/test
// backend where a bounded, synchronous store is fine.
//
// Every method is async even though nothing here awaits: the interface has to
// be identical to the native adapter's, or swapping them would change caller
// code, which is the entire point of having the abstraction.

import {
  loadSessions,
  loadFocusLedger,
  saveSession as saveSessionSync,
  updateSession as updateSessionSync,
  deleteSession as deleteSessionSync,
  clearAllSessions,
  backfillFocusLedgerFromSessions,
} from './storage'
import { filterSessions, paginate } from './sessionQuery'
import { loadFocusScoreSchedule, saveFocusScoreSchedule } from './focusScoreSchedule'
import { analyzeSession } from './sessionAnalysis'
import { readArchiveSettings, restoreArchiveSettings, validateSessionArchive } from './sessionArchive'

export const ARCHIVE_SCHEMA_VERSION = 1

export function createLocalSessionRepository() {
  return {
    kind: 'local',

    async loadAll() {
      return loadSessions()
    },

    async listSessionSummaries(query = {}) {
      const filtered = filterSessions(loadSessions(), query)
      return paginate(filtered, query)
    },

    async getSession(id) {
      return loadSessions().find(session => session.id === id) || null
    },

    async saveSession(sessionData) {
      return saveSessionSync({
        ...sessionData,
        analysisSnapshot: analyzeSession(sessionData),
      })
    },

    async updateSession(id, patch) {
      const existing = loadSessions().find(session => session.id === id)
      if (!existing) return null
      const merged = { ...existing, ...patch }
      updateSessionSync(id, {
        ...patch,
        analysisSnapshot: analyzeSession(merged),
      })
      return loadSessions().find(session => session.id === id) || null
    },

    async deleteSession(id) {
      deleteSessionSync(id)
    },

    async clearAll() {
      clearAllSessions()
    },

    async loadFocusLedger() {
      return loadFocusLedger()
    },

    async backfillFocusLedger() {
      return backfillFocusLedgerFromSessions()
    },

    async exportArchive() {
      return {
        schemaVersion: ARCHIVE_SCHEMA_VERSION,
        exportedAt: new Date().toISOString(),
        sessions: loadSessions(),
        focusLedger: loadFocusLedger(),
        focusScoreSchedule: loadFocusScoreSchedule(),
        appSettings: readArchiveSettings(),
      }
    },

    async restoreArchive(archive) {
      const validated = validateSessionArchive(archive)
      const existing = loadSessions()
      const existingIds = new Set(existing.map(session => session?.id).filter(Boolean))
      const additions = validated.sessions.filter(session => !existingIds.has(session.id))
      if (existing.length + additions.length > 100) {
        throw new Error('This browser-only build cannot safely restore more than 100 sessions. Use the native app instead.')
      }
      for (const session of additions) {
        saveSessionSync({ ...session, analysisSnapshot: analyzeSession(session) })
      }
      backfillFocusLedgerFromSessions()
      let settingsWarning = null
      try {
        if (validated.focusScoreSchedule) saveFocusScoreSchedule(validated.focusScoreSchedule)
        restoreArchiveSettings(validated.appSettings)
      } catch (error) { settingsWarning = String(error?.message || error) }
      return {
        importedCount: additions.length,
        skippedDuplicateCount: validated.sessions.length - additions.length,
        verified: true,
        settingsWarning,
      }
    },

    // Nothing to migrate: this adapter IS the legacy store. Reported as a
    // no-op rather than throwing so the app's startup path is adapter-agnostic.
    async migrateLegacyIfNeeded() {
      return { migrated: false, importedCount: 0, reason: 'local_adapter_is_source' }
    },
  }
}
