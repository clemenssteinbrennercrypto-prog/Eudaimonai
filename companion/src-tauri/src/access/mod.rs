//! Closed-beta access inside the app.
//!
//! Rust owns the whole beta identity: it talks to Supabase (client.rs),
//! keeps the session in the Keychain (store.rs), decides access from the
//! last server answer and the clock (grace.rs), and refuses to start
//! sessions or the camera without it (gate.rs). The WebView only ever sees
//! an `AccessStatus`; no token crosses IPC.
//!
//! Data boundary: this module never touches session history. It does not
//! read or write SQLite or the WebView's storage, and signing out or losing
//! access deletes nothing but its own two Keychain items. A test reads this
//! module's source to keep it that way.

pub mod client;
pub mod config;
pub mod gate;
pub mod grace;
pub mod store;

use std::sync::{Arc, Mutex, MutexGuard};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use client::{AccessAnswer, AuthSession, Transport};
use grace::{Decision, Denial, Source, Verification};
use store::{SecretStore, CACHE_ACCOUNT, SESSION_ACCOUNT};

pub const ACCESS_STATE_EVENT: &str = "access-state-changed";
pub const ACCESS_REQUIRED: &str = "access_required";

const HIGH_WATER_PERSIST_MS: i64 = 60 * 60 * 1000;
const NETWORK_RETRY_MS: i64 = 2 * 60 * 1000;
const REFRESH_MARGIN_MS: i64 = 60 * 1000;

/// Persisted next to the session. Nothing in it grants access on its own:
/// the verification is only honoured through `grace::decide`.
#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
struct Cache {
    email: Option<String>,
    waitlist_pending: bool,
    verification: Option<Verification>,
    high_water_ms: i64,
}

#[derive(Default)]
struct Inner {
    session: Option<AuthSession>,
    cache: Cache,
    last_error: Option<&'static str>,
    high_water_saved_ms: i64,
    last_check_ms: i64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessStatus {
    /// signed_out | waitlist_pending | active | no_access | lapsed |
    /// needs_check | network_error
    pub phase: &'static str,
    pub may_start_sessions: bool,
    /// The server's derived state (INTERNAL, BETA, TRIAL, PAID, WAITLIST,
    /// INVITED, LAPSED, NONE) from the last verification.
    pub state: Option<String>,
    pub source: Option<Source>,
    pub until_ms: Option<i64>,
    pub denial: Option<Denial>,
    pub email: Option<String>,
    pub signed_in: bool,
    pub waitlist_pending: bool,
    pub last_error: Option<&'static str>,
    pub environment: &'static str,
}

pub struct AccessManager {
    transport: Box<dyn Transport>,
    store: Box<dyn SecretStore>,
    now_ms: Box<dyn Fn() -> i64 + Send + Sync>,
    inner: Mutex<Inner>,
    /// One network conversation at a time: Supabase rotates refresh tokens,
    /// so two parallel refreshes would invalidate each other.
    network: Mutex<()>,
}

fn lock<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn normalize_email(raw: &str) -> Result<String, &'static str> {
    let email = raw.trim().to_lowercase();
    let valid = (3..=254).contains(&email.len())
        && !email.chars().any(char::is_whitespace)
        && email.split('@').count() == 2
        && email.split('@').next().is_some_and(|local| !local.is_empty())
        && email.rsplit('@').next().is_some_and(|domain| {
            domain.contains('.') && !domain.starts_with('.') && !domain.ends_with('.')
        });
    if valid { Ok(email) } else { Err("invalid_email") }
}

fn normalize_code(raw: &str) -> Result<String, &'static str> {
    let code: String = raw.chars().filter(|c| !c.is_whitespace()).collect();
    if code.len() == 8 && code.chars().all(|c| c.is_ascii_digit()) { Ok(code) } else { Err("code_invalid") }
}

impl AccessManager {
    pub fn new(
        transport: Box<dyn Transport>,
        store: Box<dyn SecretStore>,
        now_ms: Box<dyn Fn() -> i64 + Send + Sync>,
    ) -> Self {
        // An unreadable or corrupted Keychain item is treated as absent: the
        // user signs in again. Nothing else depends on it.
        let session = store.get(SESSION_ACCOUNT).ok().flatten()
            .and_then(|text| serde_json::from_str::<AuthSession>(&text).ok());
        let cache = store.get(CACHE_ACCOUNT).ok().flatten()
            .and_then(|text| serde_json::from_str::<Cache>(&text).ok())
            .unwrap_or_default();
        let high_water_saved_ms = cache.high_water_ms;
        Self {
            transport,
            store,
            now_ms,
            inner: Mutex::new(Inner { session, cache, high_water_saved_ms, ..Inner::default() }),
            network: Mutex::new(()),
        }
    }

    fn now(&self) -> i64 {
        (self.now_ms)()
    }

    fn save_cache(&self, inner: &Inner) {
        if let Ok(text) = serde_json::to_string(&inner.cache) {
            let _ = self.store.set(CACHE_ACCOUNT, &text);
        }
    }

    fn save_session(&self, session: Option<&AuthSession>) {
        match session.and_then(|session| serde_json::to_string(session).ok()) {
            Some(text) => { let _ = self.store.set(SESSION_ACCOUNT, &text); }
            None => { let _ = self.store.delete(SESSION_ACCOUNT); }
        }
    }

    /// Decide first, then remember the time: a clock that went backwards
    /// must be judged against the old high-water mark, not raise it.
    fn decide(&self, inner: &mut Inner) -> Decision {
        let now = self.now();
        let decision = grace::decide(inner.cache.verification.as_ref(), now, inner.cache.high_water_ms);
        if now > inner.cache.high_water_ms {
            inner.cache.high_water_ms = now;
            // Only a verification can be stretched by rewinding the clock, so
            // without one there is nothing to protect (and after sign-out
            // nothing may be written back).
            if inner.cache.verification.is_some() && now - inner.high_water_saved_ms >= HIGH_WATER_PERSIST_MS {
                inner.high_water_saved_ms = now;
                self.save_cache(inner);
            }
        }
        decision
    }

    fn status_of(&self, inner: &mut Inner) -> AccessStatus {
        let decision = self.decide(inner);
        let signed_in = inner.session.is_some();
        let state = inner.cache.verification.as_ref().map(|v| v.state.clone());
        let phase = match decision {
            Decision::Allowed { .. } => "active",
            _ if !signed_in => if inner.cache.waitlist_pending { "waitlist_pending" } else { "signed_out" },
            Decision::Denied(Denial::ServerDenied) =>
                if state.as_deref() == Some("LAPSED") { "lapsed" } else { "no_access" },
            Decision::Denied(Denial::AccessEnded) => "lapsed",
            Decision::Denied(_) => match inner.last_error {
                Some(client::NETWORK) | Some("server_error") => "network_error",
                _ => "needs_check",
            },
        };
        let (source, until_ms, denial) = match decision {
            Decision::Allowed { source, until_ms } => (Some(source), until_ms, None),
            Decision::Denied(denial) => (None, None, Some(denial)),
        };
        AccessStatus {
            phase,
            may_start_sessions: decision.allowed(),
            state,
            source,
            until_ms,
            denial,
            email: inner.cache.email.clone(),
            signed_in,
            waitlist_pending: inner.cache.waitlist_pending,
            last_error: inner.last_error,
            environment: config::ENVIRONMENT,
        }
    }

    pub fn status(&self) -> AccessStatus {
        let mut inner = lock(&self.inner);
        self.status_of(&mut inner)
    }

    /// The gate's question. No network: it judges the last verification.
    pub fn may_start(&self) -> bool {
        let mut inner = lock(&self.inner);
        self.decide(&mut inner).allowed()
    }

    pub fn due_for_check(&self) -> bool {
        let inner = lock(&self.inner);
        if inner.session.is_none() {
            return false;
        }
        let since = self.now() - inner.last_check_ms;
        since >= config::RECHECK_INTERVAL_MS
            || (inner.last_error == Some(client::NETWORK) && since >= NETWORK_RETRY_MS)
    }

    fn record(&self, answer: &AccessAnswer) {
        let now = self.now();
        let mut inner = lock(&self.inner);
        inner.cache.verification = Some(Verification {
            server_time_ms: answer.server_time_ms,
            local_time_ms: now,
            has_access: answer.has_access,
            access_until_ms: answer.access_until_ms,
            state: answer.state.clone(),
        });
        // The server just vouched for the time; a clock that had been set
        // back is accepted again from here on.
        inner.cache.high_water_ms = now;
        inner.high_water_saved_ms = now;
        if answer.has_access {
            inner.cache.waitlist_pending = false;
        }
        inner.last_error = None;
        self.save_cache(&inner);
    }

    /// The server rejected the session itself: no grace, sign in again.
    fn drop_session(&self, code: &'static str) {
        let mut inner = lock(&self.inner);
        inner.session = None;
        inner.cache.verification = None;
        inner.last_error = Some(code);
        self.save_session(None);
        self.save_cache(&inner);
    }

    fn fail(&self, code: &'static str) {
        if code == "session_expired" {
            self.drop_session(code);
        } else {
            lock(&self.inner).last_error = Some(code);
        }
    }

    fn fresh_session(&self) -> Result<Option<AuthSession>, &'static str> {
        let Some(session) = lock(&self.inner).session.clone() else { return Ok(None) };
        if session.expires_at * 1000 - REFRESH_MARGIN_MS > self.now() {
            return Ok(Some(session));
        }
        let renewed = client::refresh(self.transport.as_ref(), &session.refresh_token)?;
        // Store the rotated refresh token before anything can use it.
        self.save_session(Some(&renewed));
        lock(&self.inner).session = Some(renewed.clone());
        Ok(Some(renewed))
    }

    /// Asks the server, activating an open invitation on the way: an
    /// invited person who signs in from the app is activated right here.
    fn query_access(&self, session: &AuthSession) -> Result<AccessAnswer, &'static str> {
        let answer = client::my_access(self.transport.as_ref(), &session.access_token)?;
        if answer.state != "INVITED" {
            return Ok(answer);
        }
        match client::claim_invitation(self.transport.as_ref(), &session.access_token) {
            Ok(()) | Err("already_activated") | Err("no_valid_invitation") => {}
            Err(code) => return Err(code),
        }
        client::my_access(self.transport.as_ref(), &session.access_token)
    }

    /// A fresh server check. Never fails: problems land in `last_error`, and
    /// a network failure leaves the offline grace in place.
    pub fn check(&self) -> AccessStatus {
        let _network = lock(&self.network);
        lock(&self.inner).last_check_ms = self.now();
        match self.fresh_session() {
            Ok(Some(session)) => match self.query_access(&session) {
                Ok(answer) => self.record(&answer),
                Err(code) => self.fail(code),
            },
            Ok(None) => {}
            Err(code) => self.fail(code),
        }
        self.status()
    }

    pub fn request_waitlist(&self, email: &str) -> Result<AccessStatus, &'static str> {
        let email = normalize_email(email)?;
        let _network = lock(&self.network);
        client::join_waitlist(self.transport.as_ref(), &email)?;
        let mut inner = lock(&self.inner);
        inner.cache.email = Some(email);
        inner.cache.waitlist_pending = true;
        inner.last_error = None;
        self.save_cache(&inner);
        Ok(self.status_of(&mut inner))
    }

    pub fn send_code(&self, email: &str) -> Result<AccessStatus, &'static str> {
        let email = normalize_email(email)?;
        let _network = lock(&self.network);
        client::request_code(self.transport.as_ref(), &email)?;
        let mut inner = lock(&self.inner);
        inner.cache.email = Some(email);
        inner.last_error = None;
        self.save_cache(&inner);
        Ok(self.status_of(&mut inner))
    }

    pub fn verify_code(&self, email: &str, code: &str) -> Result<AccessStatus, &'static str> {
        let email = normalize_email(email)?;
        let code = normalize_code(code)?;
        let _network = lock(&self.network);
        let session = client::verify_code(self.transport.as_ref(), &email, &code)?;
        self.save_session(Some(&session));
        {
            let mut inner = lock(&self.inner);
            inner.session = Some(session.clone());
            inner.cache.email = Some(email);
            inner.last_check_ms = self.now();
        }
        match self.query_access(&session) {
            Ok(answer) => self.record(&answer),
            Err(code) => self.fail(code),
        }
        Ok(self.status())
    }

    /// Ends the beta session on this Mac. Deletes the two access items in the
    /// Keychain and nothing else: local history is untouched.
    pub fn sign_out(&self) -> AccessStatus {
        let _network = lock(&self.network);
        let session = lock(&self.inner).session.take();
        if let Some(session) = session {
            let _ = client::logout(self.transport.as_ref(), &session.access_token);
        }
        let _ = self.store.delete(SESSION_ACCOUNT);
        let _ = self.store.delete(CACHE_ACCOUNT);
        let mut inner = lock(&self.inner);
        *inner = Inner::default();
        self.status_of(&mut inner)
    }

    /// "Change email" on the waitlist screen.
    pub fn forget_pending(&self) -> AccessStatus {
        let mut inner = lock(&self.inner);
        inner.cache.waitlist_pending = false;
        inner.cache.email = None;
        inner.last_error = None;
        self.save_cache(&inner);
        self.status_of(&mut inner)
    }
}

// ── Tauri glue ─────────────────────────────────────────────────────────────

pub type SharedAccess = Arc<AccessManager>;

fn emit(app: &AppHandle, status: &AccessStatus) {
    let _ = app.emit(ACCESS_STATE_EVENT, status);
}

async fn off_main<F>(app: AppHandle, access: SharedAccess, work: F) -> Result<AccessStatus, String>
where
    F: FnOnce(&AccessManager) -> Result<AccessStatus, &'static str> + Send + 'static,
{
    let status = tauri::async_runtime::spawn_blocking(move || work(&access))
        .await
        .map_err(|_| "unknown".to_string())?
        .map_err(str::to_string)?;
    emit(&app, &status);
    Ok(status)
}

#[tauri::command]
pub fn access_status(access: State<'_, SharedAccess>) -> AccessStatus {
    access.status()
}

#[tauri::command]
pub async fn access_check(app: AppHandle, access: State<'_, SharedAccess>) -> Result<AccessStatus, String> {
    off_main(app, access.inner().clone(), |access| Ok(access.check())).await
}

#[tauri::command]
pub async fn access_request_waitlist(app: AppHandle, access: State<'_, SharedAccess>, email: String) -> Result<AccessStatus, String> {
    off_main(app, access.inner().clone(), move |access| access.request_waitlist(&email)).await
}

#[tauri::command]
pub async fn access_send_code(app: AppHandle, access: State<'_, SharedAccess>, email: String) -> Result<AccessStatus, String> {
    off_main(app, access.inner().clone(), move |access| access.send_code(&email)).await
}

#[tauri::command]
pub async fn access_verify_code(app: AppHandle, access: State<'_, SharedAccess>, email: String, code: String) -> Result<AccessStatus, String> {
    off_main(app, access.inner().clone(), move |access| access.verify_code(&email, &code)).await
}

#[tauri::command]
pub async fn access_sign_out(app: AppHandle, access: State<'_, SharedAccess>) -> Result<AccessStatus, String> {
    off_main(app, access.inner().clone(), |access| Ok(access.sign_out())).await
}

#[tauri::command]
pub async fn access_forget_pending(app: AppHandle, access: State<'_, SharedAccess>) -> Result<AccessStatus, String> {
    off_main(app, access.inner().clone(), |access| Ok(access.forget_pending())).await
}

// ── Gated native commands ────────────────────────────────────────────────

/// Whether a focus session is running right now, by the native session state
/// the session screen renews every 30 s.
pub fn session_running(native: &crate::native::NativeState) -> bool {
    native.session.lock()
        .map(|config| config.active && config.end_ts > crate::activity::now_ms())
        .unwrap_or(false)
}

/// Replaces the library's camera command in the invoke handler: the same
/// command name, with the access gate in front. Restarts inside a running
/// session stay allowed (see gate.rs).
#[tauri::command]
pub fn start_native_camera_prototype(
    app: AppHandle,
    camera: State<'_, eudonomia_companion::native_camera::NativeCameraState>,
    native: State<'_, crate::native::NativeState>,
    access: State<'_, SharedAccess>,
) -> Result<eudonomia_companion::native_camera::NativeCameraStatus, String> {
    if !gate::may_start_camera(session_running(&native), access.may_start()) {
        return Err(ACCESS_REQUIRED.to_string());
    }
    eudonomia_companion::native_camera::start_native_camera_prototype(app, camera)
}

/// Checks at launch, then hourly (sooner after a network failure). Emits
/// only when the outcome changed.
pub fn spawn_background_checks(app: AppHandle, access: SharedAccess) {
    let _ = std::thread::Builder::new().name("eudaimonai-access-check".into()).spawn(move || {
        let mut last = access.check();
        emit(&app, &last);
        loop {
            std::thread::sleep(std::time::Duration::from_secs(60));
            let next = if access.due_for_check() { access.check() } else { access.status() };
            if next != last {
                emit(&app, &next);
                last = next;
            }
        }
    });
}

#[cfg(test)]
pub(crate) mod tests;
#[cfg(test)]
mod live_tests;
