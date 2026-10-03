import { useEffect, useState } from 'react'

const bundledBuildInfo = {
  version: import.meta.env.VITE_EUDONOMIA_BUILD_VERSION || '',
  channel: import.meta.env.VITE_EUDONOMIA_BUILD_CHANNEL || '',
  buildId: import.meta.env.VITE_EUDONOMIA_BUILD_ID || '',
  shortSha: import.meta.env.VITE_EUDONOMIA_BUILD_SHORT_SHA || '',
}

export function AppRefreshControl({ updateStatus }) {
  const {
    runtime,
    checking,
    installing,
    updateAvailable,
    updateVersion,
    error,
    reloadCurrentApp,
    reloadOrUpdate,
  } = updateStatus

  const isNative = runtime === 'native'
  const versionText = updateVersion ? ` ${updateVersion}` : ''
  const primaryAction = isNative ? reloadOrUpdate : reloadCurrentApp
  const primaryLabel = installing ? 'Installing' : 'Reload'
  const statusText = installing
    ? 'Installing update...'
    : updateAvailable
      ? `${isNative ? 'Native' : 'Web'} update${versionText}`
      : checking
        ? 'Checking updates...'
        : error
          ? 'Reload unavailable'
          : isNative
            ? 'Native app up to date'
            : 'Reload current app'

  const title = updateAvailable
    ? isNative
      ? 'Reload installs the available native app update and restarts Eudaimonai.'
      : 'Reload refreshes this local development build.'
    : error
      ? `Update check unavailable: ${error}. Reload refreshes the current app only.`
      : 'Reload refreshes the current app without claiming a new version.'

  return (
    <div className="app-refresh-control" title={title}>
      <button
        className="app-refresh-button"
        type="button"
        onClick={primaryAction}
        disabled={installing}
        aria-label={isNative ? 'Reload Eudaimonai and install any available update' : 'Reload current Eudaimonai app'}
      >
        <span className="app-refresh-icon" aria-hidden="true">↻</span>
        <span>{primaryLabel}</span>
      </button>
      <span className={`app-refresh-status ${updateAvailable ? 'is-update' : ''}`}>
        {statusText}
      </span>
    </div>
  )
}

export function BuildIdentity() {
  const [info, setInfo] = useState(bundledBuildInfo)
  const [justUpdatedFrom, setJustUpdatedFrom] = useState(null)

  useEffect(() => {
    let cancelled = false

    fetch('./build-info.json', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.version) {
          setInfo({
            version: data.version,
            channel: data.channel || bundledBuildInfo.channel,
            buildId: data.buildId || bundledBuildInfo.buildId,
            shortSha: data.shortSha || bundledBuildInfo.shortSha,
          })
        }
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const version = info.version
    if (!version) return

    const storageKey = 'eudonomia_last_seen_build_version'
    const lastSeen = localStorage.getItem(storageKey)

    if (lastSeen && lastSeen !== version) {
      setJustUpdatedFrom(lastSeen)
      const timeoutId = window.setTimeout(() => setJustUpdatedFrom(null), 12000)
      localStorage.setItem(storageKey, version)
      return () => window.clearTimeout(timeoutId)
    }

    if (!lastSeen) {
      localStorage.setItem(storageKey, version)
    }
  }, [info.version])

  const version = info.version || 'dev'
  const build = info.shortSha || info.buildId || 'local'
  const channel = info.channel ? `${info.channel} ` : ''

  return (
    <>
      <div className="app-build-identity" title={info.buildId || build}>
        {channel}v{version} · {build}
      </div>
      {justUpdatedFrom && (
        <div className="app-update-toast" role="status" aria-live="polite">
          Updated from v{justUpdatedFrom} to v{version}
        </div>
      )}
    </>
  )
}
