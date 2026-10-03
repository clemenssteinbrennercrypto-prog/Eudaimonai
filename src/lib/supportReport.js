import { fetchCompanionDebug, fetchNativeCameraStatus } from './nativeCompanion'

function booleanOrNull(value) {
  return typeof value === 'boolean' ? value : null
}

function safeString(value, allowed = []) {
  const normalized = String(value || '').trim()
  return allowed.includes(normalized) ? normalized : null
}

export function buildSupportReport({
  debug = null,
  camera = null,
  generatedAt = new Date().toISOString(),
  platform = globalThis.navigator?.platform || 'unknown',
} = {}) {
  return {
    schemaVersion: 1,
    generatedAt,
    product: 'Eudaimonai',
    app: {
      companionVersion: String(debug?.companionVersion || 'unknown'),
      buildVersion: import.meta.env.VITE_EUDONOMIA_BUILD_VERSION || 'unknown',
      buildChannel: import.meta.env.VITE_EUDONOMIA_BUILD_CHANNEL || 'unknown',
      buildId: import.meta.env.VITE_EUDONOMIA_BUILD_ID || 'unknown',
    },
    system: {
      platform: String(platform).slice(0, 120),
      nativeRuntime: Boolean(globalThis.window?.__TAURI__?.core?.invoke),
    },
    companion: {
      connected: Boolean(debug),
      sessionState: safeString(debug?.sessionState, ['inactive', 'active', 'paused', 'ended']),
      helperInstalled: booleanOrNull(debug?.helperInstalled),
      hostBlockActive: booleanOrNull(debug?.hostBlockActive),
      permissionGapCount: Array.isArray(debug?.missingPermissions)
        ? debug.missingPermissions.length
        : debug?.permissionMissing ? 1 : 0,
      hostBlockErrorPresent: Boolean(debug?.hostBlockError),
      automationErrorPresent: Boolean(debug?.lastOsascriptError),
    },
    camera: {
      state: safeString(camera?.state, ['stopped', 'starting', 'running', 'faulted']),
      faultPresent: Boolean(camera?.fault),
      hasProducedFrames: Number(camera?.frameSequence || 0) > 0,
    },
    privacy: {
      excluded: [
        'camera frames and landmarks',
        'sessions and scores',
        'app names, URLs, window titles, and file paths',
        'credentials and keychain values',
      ],
    },
  }
}

export async function collectSupportReport() {
  const [debug, camera] = await Promise.all([
    fetchCompanionDebug(),
    fetchNativeCameraStatus(),
  ])
  return buildSupportReport({ debug, camera })
}
