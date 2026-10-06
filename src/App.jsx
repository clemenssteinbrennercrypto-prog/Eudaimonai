import { useState, useEffect, useCallback, useRef } from 'react'
import ErrorBoundary from './components/ErrorBoundary'
import Onboarding from './components/Onboarding'
import SessionIntentScreen from './components/SessionIntentScreen'
import LabDashboard from './components/LabDashboard'
import LabQuickStart from './components/LabQuickStart'
import AppShell from './components/AppShell'
import { AppRefreshControl, BuildIdentity } from './components/AppChrome'
import WorkspaceManager from './components/WorkspaceManager'
import FocusAppsScreen from './components/FocusAppsScreen'
import SessionScreen from './components/SessionScreen'
import EndScreen from './components/EndScreen'
import AnalyticsShell from './components/analytics/AnalyticsShell'
import HistoryStorageAlerts from './components/HistoryStorageAlerts'
import { loadFocusModeEnabled, loadProtectionSetups, saveFocusModeEnabled, saveProtectionSetups, disableOptionalModelProviders, loadOutputFolder, saveOutputFolder, pickOutputFolder } from './lib/storage'
import { activateProtectionSetup, getActiveProtectionSetup } from './lib/protectionSetups'
import { deleteCloudApiKey, sendNativeNotification } from './lib/nativeCompanion'
import { dueWeekReviewNotification } from './lib/weeklyReview'
import LegalModal from './components/LegalModal'
import BetaAccess from './components/access/BetaAccess'
import AccessScreen from './components/access/AccessScreen'
import AccessBanner from './components/access/AccessBanner'
import { useBetaAccess } from './lib/betaAccess'
import { LOCKED_WHEN_READ_ONLY, accessView, confirmSessionAccess, mayNavigate } from './lib/accessGate'
import { sessionRepository } from './lib/sessionRepository'
import { createSessionPersister } from './lib/sessionPersistence'
import {
  getActiveWorkspace,
  loadWorkspaceState,
  saveWorkspaceState,
  workspaceDevices,
  workspaceSnapshot,
} from './lib/workspaceStore'
import { useAppUpdateStatus } from './lib/useUpdateAvailable'
import { emptyFocusLedger, withSessionFocusMetric } from './lib/focusMetric'
import { durationFromSetup } from './lib/sessionDuration'
import { playSessionEndChime } from './lib/signatureSound'
import { useCompanionStatus } from './lib/useCompanionStatus'
import { getProtectionReadiness } from './lib/protectionReadiness'
import { useNativeAppMenu } from './lib/nativeAppMenu'
import { ENERGY_LEVEL_VERSION } from './lib/sessionIntent'

const isNativeRuntime = () => Boolean(window.__TAURI__?.core?.invoke)

function getInitialFlow() {
  // The public website renders from main.jsx (src/web) and never reaches App,
  // so ?onboarding cannot open the app there (see src/web/routes.js).
  // ?onboarding=1 forces the intro flow — lets you re-experience the first-run
  // moment even after you've onboarded (handy for demos/testing).
  if (new URLSearchParams(window.location.search).has('onboarding')) return 'onboarding'
  try {
    return localStorage.getItem('eudaimonia_onboarded') === 'true' ? 'app' : 'onboarding'
  } catch {
    return 'onboarding'
  }
}

export default function App() {
  useEffect(() => {
    // Optional model providers are hidden until their result can be made
    // visible and useful. Remove both legacy WebView credentials and the
    // native Keychain copy so disabling the feature leaves no dormant secret.
    disableOptionalModelProviders()
    deleteCloudApiKey().catch(() => {})
  }, [])
  // The public website renders from main.jsx (src/web); App is the app only.
  const [flow, setFlow] = useState(getInitialFlow)
  const [screen,   setScreen]   = useState(() => getActiveWorkspace(loadWorkspaceState()) ? 'lab' : 'setup')
  const [task,     setTask]     = useState('')
  const [goal,     setGoal]     = useState('')
  // null = not asked. A default here was stored as the user's answer: every
  // quick-start session recorded "medium" energy nobody reported.
  const [energyLevel, setEnergyLevel] = useState(null)
  const [duration, setDuration] = useState(30)
  const [tags,     setTags]     = useState([])
  const [sessionData, setSessionData] = useState(null)
  const [saveError, setSaveError] = useState(null)
  const [migrationError, setMigrationError] = useState(null)
  const [deletionCleanupError, setDeletionCleanupError] = useState(null)
  const [historyLoadError, setHistoryLoadError] = useState(null)
  const [sessionRevision, setSessionRevision] = useState(0)
  const [workspaceState, setWorkspaceStateRaw] = useState(loadWorkspaceState)
  const [focusModeEnabled, setFocusModeEnabledRaw] = useState(loadFocusModeEnabled)
  const [protectionState, setProtectionState] = useState(loadProtectionSetups)
  const [protectionReturnScreen, setProtectionReturnScreen] = useState('lab')
  const [outputFolder, setOutputFolder] = useState(loadOutputFolder)
  const updateStatus = useAppUpdateStatus()
  // Beta access (native app only; Rust decides and also gates session and
  // camera start itself). Without access the app shows the access step, or,
  // when chosen, a strictly read-only history view.
  const access = useBetaAccess()
  const [viewingHistory, setViewingHistory] = useState(false)

  // Session history lives here rather than inside each screen: App already
  // owned `sessionRevision` to tell the dashboard when to re-read, so it is
  // the natural owner of the data that revision refers to. LabDashboard and
  // SessionIntentScreen render whatever they are handed.
  const [history, setHistory] = useState({ sessions: [], ledger: emptyFocusLedger() })
  const [legalTab, setLegalTab] = useState(null)
  // Declared before the landing/onboarding early returns (rules of hooks);
  // navigateRef.current is filled in once the app shell's navigate exists.
  const nativeStatus = useCompanionStatus()
  const navigateRef = useRef(() => {})
  useNativeAppMenu({
    onNavigate: destination => navigateRef.current(destination),
    onLegal: () => setLegalTab('impressum'),
    enabled: flow === 'app' && screen !== 'session',
  })
  useEffect(() => {
    let cancelled = false
    Promise.all([sessionRepository.loadAll(), sessionRepository.loadFocusLedger()])
      .then(([sessions, ledger]) => {
        if (!cancelled) {
          setHistory({ sessions, ledger })
          setHistoryLoadError(null)
        }
      })
      .catch(error => {
        if (!cancelled) setHistoryLoadError(String(error?.message || error))
      })
    return () => { cancelled = true }
  }, [sessionRevision])

  // Runs once per app start — catches up any already-stored session that
  // qualifies for the score but never made it into the ledger (e.g. saved by
  // a build older than this ledger). Bumping the revision on completion makes
  // the load above pick the caught-up ledger back up.
  // On the native build this first imports any localStorage history into
  // SQLite (idempotent, and it never deletes the old copy), then catches the
  // ledger up. Both are no-ops once there is nothing left to do.
  const backfilledRef = useRef(false)
  useEffect(() => {
    if (backfilledRef.current) return
    backfilledRef.current = true
    let cancelled = false
    sessionRepository.migrateLegacyIfNeeded()
      .then(result => {
        // A refused or unverified import is not a detail to swallow: it means
        // history is still only in the old store, and the user needs to know
        // why rather than being shown an app that looks empty.
        //
        // A leftover copy after a deletion is the opposite situation and must
        // not borrow that wording: there the history really was deleted, so
        // "nothing has been deleted" would be exactly backwards.
        if (!cancelled && result?.deletionCleanupError) {
          setDeletionCleanupError(result.deletionCleanupError)
        } else if (!cancelled && result && result.verified === false) {
          setMigrationError(result.reason || 'the import could not be verified')
        }
        return sessionRepository.backfillFocusLedger()
      })
      .then(() => { if (!cancelled) setSessionRevision(value => value + 1) })
      .catch(error => {
        if (!cancelled) setMigrationError(String(error?.message || error))
      })
    return () => { cancelled = true }
  }, [])

  // One notification a week, when last week's review is ready (weeklyReview.js
  // decides when). Checked on launch and every half hour; never while a
  // session runs. The week is remembered only once the native side accepted
  // the notification, so a failed send is retried.
  const screenRef = useRef(screen)
  screenRef.current = screen
  useEffect(() => {
    if (flow !== 'app' || !isNativeRuntime()) return undefined
    const NOTIFIED_KEY = 'eudaimonai_week_review_notified'
    const check = () => {
      let lastNotifiedWeekKey = null
      try { lastNotifiedWeekKey = localStorage.getItem(NOTIFIED_KEY) } catch { /* treat as never */ }
      const due = dueWeekReviewNotification({
        ledger: history.ledger,
        sessions: history.sessions,
        now: Date.now(),
        lastNotifiedWeekKey,
        sessionRunning: screenRef.current === 'session',
      })
      if (!due) return
      sendNativeNotification(due).then(sent => {
        if (!sent) return
        try { localStorage.setItem(NOTIFIED_KEY, due.weekKey) } catch { /* may repeat once */ }
      })
    }
    check()
    const timer = setInterval(check, 30 * 60 * 1000)
    return () => clearInterval(timer)
  }, [flow, history])

  const activeWorkspace = getActiveWorkspace(workspaceState)
  const devices = workspaceDevices(activeWorkspace)

  const setWorkspaceState = useCallback((next) => {
    const result = saveWorkspaceState(next)
    if (result.ok) setWorkspaceStateRaw(result.state)
    return result
  }, [])

  const setFocusModeEnabled = useCallback((val) => {
    setFocusModeEnabledRaw(prev => {
      const next = typeof val === 'function' ? val(prev) : val
      return saveFocusModeEnabled(next)
    })
  }, [])

  const handleHistoryCleared = useCallback((cleanupError) => {
    // A committed delete permanently ends the legacy-import state. Clear any
    // earlier banner before it can keep asserting that the old store is still
    // authoritative, and preserve only a real residual-copy warning.
    setMigrationError(null)
    setDeletionCleanupError(cleanupError || null)
    setHistoryLoadError(null)
    setSessionRevision(value => value + 1)
  }, [])

  const handleStart = async () => {
    if (!(await confirmSessionAccess(access))) {
      setViewingHistory(false)
      return
    }
    if (activeWorkspace) setScreen('session')
    else setScreen('setup')
  }

  const openProtection = (returnScreen) => {
    setProtectionReturnScreen(returnScreen)
    setScreen('focus-apps')
  }

  // Protection edits a draft that is saved explicitly. Leaving it through the
  // sidebar, a shortcut or the Go menu asks the screen first, so unsaved rules
  // are never dropped silently; it shows its own Save & leave / Discard choice
  // and remembers where the user was heading.
  const protectionLeaveGuardRef = useRef(null)
  const [pendingDestination, setPendingDestination] = useState(null)

  // Owns the save and the check-in answers together, because only one place
  // can know whether the session has a stored row yet. See sessionPersistence.js.
  const persisterRef = useRef(null)
  if (!persisterRef.current) {
    persisterRef.current = createSessionPersister(sessionRepository)
  }

  // A finished session must never be lost to a failed write. The record is put
  // on screen from memory first; persistence is attempted after, and a failure
  // leaves a retry rather than silently discarding work the user just did.
  const persistSession = useCallback(async (enriched) => {
    try {
      // Comes back with any answers given while the write was in flight.
      setSessionData(await persisterRef.current.save(enriched))
      setSaveError(null)
      // LabDashboard caches its storage snapshot while mounted. Bump this after
      // every completed session so returning to Lab cannot show a stale ledger.
      setSessionRevision(value => value + 1)
      return true
    } catch (error) {
      setSaveError({ pending: enriched, message: String(error?.message || error) })
      return false
    }
  }, [])

  // The post-session check-in. Owned here rather than in EndScreen because a
  // component holding its own copy of the record cannot see the storage id
  // arrive — which is precisely how these answers used to get dropped.
  const handleOutcomeChange = useCallback(async (patch) => {
    setSessionData(previous => (previous ? { ...previous, ...patch } : previous))
    try {
      await persisterRef.current.edit(patch)
      // Before the initial insert lands, edit() only queues the answer. Keep an
      // existing insert error visible until the idempotent save retry succeeds.
      if (persisterRef.current.savedId) setSaveError(null)
    } catch (error) {
      // The row may already exist; persistSession/save is idempotent and will
      // flush the queued patch into that same row when the user retries.
      setSaveError({ pending: null, message: String(error?.message || error) })
    }
  }, [])

  const handleEnd = useCallback((data) => {
    playSessionEndChime()
    const enriched = withSessionFocusMetric({
      ...data,
      task,
      goal,
      energyLevel,
      energyLevelVersion: ENERGY_LEVEL_VERSION,
      tags,
      workspace: workspaceSnapshot(activeWorkspace),
    })
    // A new session starts with no stored row and no carried-over answers.
    persisterRef.current.reset()
    setSessionData(enriched)
    setScreen('end')
    persistSession(enriched)
  }, [task, goal, energyLevel, tags, activeWorkspace, persistSession])

  const handleRestart = (prefill = null) => {
    setTask(prefill?.task ?? '')
    setGoal(prefill?.goal ?? '')
    setEnergyLevel(prefill?.energyLevel ?? null)
    setDuration(durationFromSetup(prefill))
    setTags(prefill?.tags ?? [])
    setSessionData(null)
    setScreen('session-setup')
  }

  if (flow === 'onboarding') {
    return (
      <>
        <Onboarding
          renderAccessStep={access.native ? ({ onDone }) => (
            <BetaAccess
              access={access}
              onContinue={onDone}
              onOpenPrivacy={() => setLegalTab('datenschutz')}
            />
          ) : null}
          onComplete={() => {
            setFlow('app')
            if (!getActiveWorkspace(loadWorkspaceState())) setScreen('setup')
            else setScreen('lab')
          }}
          // The camera slide is where the user decides; the policy that backs
          // its privacy claims has to be one click away there, not only after.
          onOpenPrivacy={() => setLegalTab('datenschutz')}
        />
        {/* No Reload here: a "Reload current app" pill on the welcome screen
            read as a fault to first-time users, and onboarding can no longer
            get stuck (every camera failure has a way out). Updates install
            from the sidebar once the app is open. The build identity stays so
            testers can say which build they saw; it is drawn above the intro
            and after it in tab order. */}
        <div className="onboarding-chrome">
          <BuildIdentity />
        </div>
        <LegalModal
          open={legalTab !== null}
          onClose={() => setLegalTab(null)}
          initialTab={legalTab ?? 'datenschutz'}
        />
      </>
    )
  }

  // Without beta access, and never in the middle of a running session (it is
  // never interrupted): the access step, or the strictly read-only history
  // view chosen from it. Rust refuses session and camera start regardless.
  const view = accessView({ native: access.native, status: access.status, screen, viewingHistory })
  const readOnly = view === 'read_only'
  if (view === 'access') {
    return (
      <>
        <AccessScreen
          access={access}
          hasHistory={history.sessions.length > 0}
          onViewHistory={() => { setViewingHistory(true); setScreen('analytics') }}
          onOpenPrivacy={() => setLegalTab('datenschutz')}
        />
        <div className="onboarding-chrome">
          <BuildIdentity />
        </div>
        <LegalModal
          open={legalTab !== null}
          onClose={() => setLegalTab(null)}
          initialTab={legalTab ?? 'datenschutz'}
        />
      </>
    )
  }

  const content = (
    <div key={screen} className="screen-enter">
      {screen === 'lab' && (
        <LabDashboard
          focusModeEnabled={focusModeEnabled}
          sessions={history.sessions}
          ledger={history.ledger}
          quickStart={(
            <LabQuickStart
              defaultDuration={duration}
              protection={getProtectionReadiness({ enabled: focusModeEnabled, setup: getActiveProtectionSetup(protectionState), nativeStatus })}
              onEditProtection={() => openProtection('lab')}
              onOpenPlanner={() => setScreen('session-setup')}
              onStart={({ task: quickTask, duration: quickDuration }) => {
                // A quick session is a fresh brief: no leftover plan or tags
                // from an earlier planning screen.
                setTask(quickTask)
                setGoal('')
                setTags([])
                setEnergyLevel(null)
                setDuration(quickDuration)
                handleStart()
              }}
            />
          )}
          onAnalytics={() => setScreen('analytics')}
        />
      )}
      {screen === 'session-setup' && (
        <SessionIntentScreen
          recentSessions={history.sessions}
          task={task}
          setTask={setTask}
          goal={goal}
          setGoal={setGoal}
          energyLevel={energyLevel}
          setEnergyLevel={setEnergyLevel}
          duration={duration}
          setDuration={setDuration}
          tags={tags}
          setTags={setTags}
          workspaces={workspaceState.workspaces}
          activeWorkspaceId={workspaceState.activeWorkspaceId}
          protectionSetup={getActiveProtectionSetup(protectionState)}
          protectionSetups={protectionState.setups}
          protectionEnabled={focusModeEnabled}
          onProtectionSetupChange={(setupId) => setProtectionState(current => {
            const next = activateProtectionSetup(current, setupId)
            return saveProtectionSetups(next)
          })}
          onEditProtection={() => openProtection('session-setup')}
          onWorkspaceChange={(id) => setWorkspaceState({ ...workspaceState, activeWorkspaceId: id })}
          onEditWorkspaces={() => setScreen('setup')}
          // The picker is a native dialog; outside the app there is nothing
          // to open, so the row is not offered at all.
          outputFolder={isNativeRuntime() ? outputFolder : null}
          onChooseOutputFolder={isNativeRuntime() ? async () => {
            const picked = await pickOutputFolder()
            if (picked) setOutputFolder(saveOutputFolder(picked))
          } : null}
          onClearOutputFolder={() => setOutputFolder(saveOutputFolder(''))}
          onStart={handleStart}
        />
      )}
      {screen === 'focus-apps' && (
        <FocusAppsScreen
          protectionState={protectionState}
          onProtectionStateChange={setProtectionState}
          focusModeEnabled={focusModeEnabled}
          setFocusModeEnabled={setFocusModeEnabled}
          onBack={() => {
            setScreen(pendingDestination ?? protectionReturnScreen)
            setPendingDestination(null)
          }}
          onRegisterLeaveGuard={guard => { protectionLeaveGuardRef.current = guard }}
        />
      )}
      {screen === 'setup' && (
        <WorkspaceManager
          state={workspaceState}
          onChange={setWorkspaceState}
          onContinue={() => setScreen('lab')}
        />
      )}
      {screen === 'session' && (
        <SessionScreen
          task={task}
          goal={goal}
          energyLevel={energyLevel}
          tags={tags}
          duration={duration}
          devices={devices}
          workspace={activeWorkspace}
          focusModeEnabled={focusModeEnabled}
          onEnd={handleEnd}
        />
      )}
      {screen === 'end' && (
        <>
          {saveError && (
            <div className="session-save-error" role="alert">
              <span>
                Some session data could not be saved ({saveError.message}). It is still
                here, but unsaved changes will be lost if you close the app.
              </span>
              <button type="button" onClick={() => persistSession(saveError.pending)}>
                Retry save
              </button>
            </div>
          )}
          <EndScreen
            sessionData={sessionData}
            onOutcomeChange={handleOutcomeChange}
            onRestart={handleRestart}
            onPrimaryAction={() => setScreen('analytics')}
          />
        </>
      )}
      {screen === 'analytics' && (
        <AnalyticsShell
          onHistoryCleared={handleHistoryCleared}
          readOnly={readOnly}
        />
      )}
    </div>
  )

  const navigate = (destination) => {
    if (!['lab', 'session-setup', 'setup', 'focus-apps', 'analytics'].includes(destination)) return
    // Read-only history: analytics (view and export) is the only destination.
    if (!mayNavigate(view, destination)) return
    // A running session owns the window; menu shortcuts must never end it.
    if (screen === 'session' || destination === screen) return
    if (screen === 'focus-apps' && protectionLeaveGuardRef.current && !protectionLeaveGuardRef.current()) {
      setPendingDestination(destination)
      return
    }
    if (destination === 'focus-apps') setProtectionReturnScreen(screen)
    setScreen(destination)
  }
  navigateRef.current = navigate

  const protectionReadiness = getProtectionReadiness({
    enabled: focusModeEnabled,
    setup: getActiveProtectionSetup(protectionState),
    nativeStatus,
  })
  // No rules yet is a normal state, not a fault: sessions without blocking are
  // a first-class choice, so a fresh install must not open on an amber
  // "needs attention" dot for a feature nobody has set up.
  const protectionStatus = protectionReadiness.state === 'off' || protectionReadiness.state === 'empty'
    ? null
    : protectionReadiness.state === 'ready'
      ? { tone: 'good', label: 'Protection ready' }
      : { tone: 'warn', label: 'Protection needs attention' }

  return (
    <>
      <HistoryStorageAlerts
        migrationError={migrationError}
        deletionCleanupError={deletionCleanupError}
        screen={screen}
      />
      {historyLoadError && screen !== 'session' && (
        <div className="session-save-error" role="alert">
          <span>
            Your session history could not be loaded ({historyLoadError}). No data
            has been deleted. Retry after the local database becomes available.
          </span>
          <button type="button" onClick={() => setSessionRevision(value => value + 1)}>
            Retry history
          </button>
        </div>
      )}
      {/* Hidden during a session: a reload tears down all in-memory session
          state (scores, streaks, timers live in refs), so hitting it mid-session
          silently destroys the run. There is no reason to reload while tracking,
          and an update can always wait until the session ends. */}
      {screen === 'session'
        ? content
        : (
          <AppShell
            active={screen}
            onNavigate={navigate}
            onLegal={() => setLegalTab('datenschutz')}
            utility={<AppRefreshControl updateStatus={updateStatus} />}
            footer={(
              <>
                {access.native && access.status?.signedIn && (
                  <button
                    type="button"
                    className="app-sidebar-link"
                    title={access.status.email ? `Signed in as ${access.status.email}` : undefined}
                    onClick={() => access.signOut()}
                  >
                    Sign out of beta
                  </button>
                )}
                <BuildIdentity />
              </>
            )}
            protectionStatus={protectionStatus}
            lockedItems={readOnly ? LOCKED_WHEN_READ_ONLY : []}
          >
            <AccessBanner status={access.status} readOnly={readOnly} onSignIn={() => setViewingHistory(false)} />
            {content}
          </AppShell>
        )}
      <LegalModal
        open={legalTab !== null}
        onClose={() => setLegalTab(null)}
        initialTab={legalTab ?? 'datenschutz'}
      />
    </>
  )
}
