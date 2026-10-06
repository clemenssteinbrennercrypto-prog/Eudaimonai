use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Arc, Mutex};

use serde_json::{json, Value};

use super::client::{HttpResponse, Transport};
use super::grace::{Denial, Source};
use super::store::{memory::MemoryStore, SecretStore, CACHE_ACCOUNT, SESSION_ACCOUNT};
use super::AccessManager;

pub(crate) const H: i64 = 60 * 60 * 1000;
pub(crate) const T0: i64 = 1_791_280_800_000; // 2026-10-06T10:00:00Z

/// Scripted Supabase: answers per path (prefix up to '?'), in order, and
/// records every call. `None` simulates "no network".
/// Per path: queued answers; `None` = no network.
type Script = HashMap<String, VecDeque<Option<(u16, Value)>>>;

#[derive(Default)]
pub(crate) struct FakeSupabase {
    answers: Mutex<Script>,
    calls: Mutex<Vec<(String, Option<String>, Value)>>,
}

impl FakeSupabase {
    pub(crate) fn answer(&self, path: &str, status: u16, body: Value) {
        self.answers.lock().unwrap().entry(path.into()).or_default().push_back(Some((status, body)));
    }
    pub(crate) fn offline(&self, path: &str) {
        self.answers.lock().unwrap().entry(path.into()).or_default().push_back(None);
    }
    fn calls_to(&self, path: &str) -> Vec<(Option<String>, Value)> {
        self.calls.lock().unwrap().iter().filter(|(p, _, _)| p == path).map(|(_, b, v)| (b.clone(), v.clone())).collect()
    }
}

struct SharedFake(Arc<FakeSupabase>);

impl Transport for SharedFake {
    fn post(&self, path: &str, bearer: Option<&str>, body: &Value) -> Result<HttpResponse, ()> {
        let key = path.split('?').next().unwrap().to_string();
        self.0.calls.lock().unwrap().push((key.clone(), bearer.map(str::to_string), body.clone()));
        let next = self.0.answers.lock().unwrap().get_mut(&key).and_then(VecDeque::pop_front);
        match next {
            Some(Some((status, body))) => Ok(HttpResponse { status, body }),
            Some(None) => Err(()),
            None => panic!("unexpected call to {key}"),
        }
    }
}

struct SharedStore(Arc<MemoryStore>);

impl SecretStore for SharedStore {
    fn get(&self, account: &str) -> Result<Option<String>, String> { self.0.get(account) }
    fn set(&self, account: &str, value: &str) -> Result<(), String> { self.0.set(account, value) }
    fn delete(&self, account: &str) -> Result<(), String> { self.0.delete(account) }
}

pub(crate) struct Harness {
    pub(crate) fake: Arc<FakeSupabase>,
    pub(crate) store: Arc<MemoryStore>,
    clock: Arc<AtomicI64>,
}

impl Harness {
    pub(crate) fn new() -> Self {
        Self { fake: Arc::default(), store: Arc::default(), clock: Arc::new(AtomicI64::new(T0)) }
    }
    /// A fresh app process over the same Keychain and clock (a restart).
    pub(crate) fn app(&self) -> AccessManager {
        let clock = self.clock.clone();
        AccessManager::new(
            Box::new(SharedFake(self.fake.clone())),
            Box::new(SharedStore(self.store.clone())),
            Box::new(move || clock.load(Ordering::SeqCst)),
        )
    }
    pub(crate) fn advance(&self, ms: i64) {
        self.clock.fetch_add(ms, Ordering::SeqCst);
    }
    fn set_clock(&self, ms: i64) {
        self.clock.store(ms, Ordering::SeqCst);
    }
    fn server_time(&self) -> String {
        iso(self.clock.load(Ordering::SeqCst))
    }
    pub(crate) fn session_answer(&self, token: &str, ttl_seconds: i64) -> Value {
        json!({
            "access_token": format!("access-{token}"),
            "refresh_token": format!("refresh-{token}"),
            "expires_at": self.clock.load(Ordering::SeqCst) / 1000 + ttl_seconds,
            "user": { "id": "user-1", "email": "friend@example.com" },
        })
    }
    pub(crate) fn access_answer(&self, state: &str, has_access: bool, until: Option<i64>) -> Value {
        json!({
            "has_access": has_access, "state": state,
            "access_until": until.map(iso), "server_time": self.server_time(),
        })
    }
}

fn iso(ms: i64) -> String {
    chrono::DateTime::from_timestamp_millis(ms).unwrap().to_rfc3339()
}

pub(crate) fn sign_in(h: &Harness, app: &AccessManager, state: &str, until: Option<i64>) {
    h.fake.answer("/auth/v1/verify", 200, h.session_answer("a", 3600));
    h.fake.answer("/rest/v1/rpc/get_my_access", 200, h.access_answer(state, true, until));
    app.verify_code("friend@example.com", "12345678").unwrap();
}

// ── Sign-in and activation ────────────────────────────────────────────────

#[test]
fn a_new_install_has_no_access() {
    let h = Harness::new();
    let status = h.app().status();
    assert_eq!(status.phase, "signed_out");
    assert!(!status.may_start_sessions);
    assert!(!h.app().may_start());
}

#[test]
fn requesting_access_joins_the_waitlist_without_an_account() {
    let h = Harness::new();
    let app = h.app();
    h.fake.answer("/rest/v1/rpc/join_waitlist", 204, Value::Null);
    let status = app.request_waitlist("  Friend@Example.com ").unwrap();
    assert_eq!(status.phase, "waitlist_pending");
    assert!(!status.may_start_sessions);
    assert_eq!(h.fake.calls_to("/rest/v1/rpc/join_waitlist")[0].1["p_email"], "friend@example.com");
    assert_eq!(h.fake.calls_to("/rest/v1/rpc/join_waitlist")[0].0, None, "no token is sent");
    assert_eq!(h.store.get(SESSION_ACCOUNT).unwrap(), None);
    // Survives a restart.
    assert_eq!(h.app().status().phase, "waitlist_pending");
}

#[test]
fn invalid_input_is_refused_before_any_request() {
    let h = Harness::new();
    let app = h.app();
    assert_eq!(app.request_waitlist("not-an-email"), Err("invalid_email"));
    assert_eq!(app.send_code("a@b"), Err("invalid_email"));
    assert_eq!(app.verify_code("friend@example.com", "1234"), Err("code_invalid"));
    assert!(h.fake.calls.lock().unwrap().is_empty());
}

#[test]
fn an_uninvited_address_gets_a_clear_code() {
    let h = Harness::new();
    h.fake.answer("/auth/v1/otp", 403, json!({ "msg": "Eudaimonai is invite-only right now. Request access on the website." }));
    assert_eq!(h.app().send_code("stranger@example.com"), Err("not_invited"));
}

#[test]
fn an_invited_person_is_activated_during_sign_in() {
    let h = Harness::new();
    let app = h.app();
    h.fake.answer("/rest/v1/rpc/join_waitlist", 204, Value::Null);
    app.request_waitlist("friend@example.com").unwrap();
    h.fake.answer("/auth/v1/verify", 200, h.session_answer("a", 3600));
    h.fake.answer("/rest/v1/rpc/get_my_access", 200, h.access_answer("INVITED", false, None));
    h.fake.answer("/rest/v1/rpc/claim_beta_invitation", 200, json!({}));
    h.fake.answer("/rest/v1/rpc/get_my_access", 200, h.access_answer("BETA", true, Some(T0 + 30 * 24 * H)));

    let status = app.verify_code("friend@example.com", "1234 5678").unwrap();
    assert_eq!(status.phase, "active");
    assert_eq!(status.state.as_deref(), Some("BETA"));
    assert!(status.may_start_sessions);
    assert!(!status.waitlist_pending, "activation clears the pending waitlist state");
    assert_eq!(h.fake.calls_to("/auth/v1/verify")[0].1["token"], "12345678");
    assert_eq!(h.fake.calls_to("/rest/v1/rpc/claim_beta_invitation")[0].0.as_deref(), Some("access-a"));
}

#[test]
fn the_founder_signs_in_through_the_same_flow_with_open_ended_access() {
    let h = Harness::new();
    let app = h.app();
    sign_in(&h, &app, "INTERNAL", None);
    let status = app.status();
    assert_eq!(status.state.as_deref(), Some("INTERNAL"));
    assert_eq!(status.source, Some(Source::Verified));
    assert_eq!(status.until_ms, None);
    assert!(h.fake.calls_to("/rest/v1/rpc/claim_beta_invitation").is_empty(), "no claim without an invitation");
}

#[test]
fn tokens_live_only_in_the_session_item_never_in_the_cache_or_status() {
    let h = Harness::new();
    let app = h.app();
    sign_in(&h, &app, "BETA", Some(T0 + 30 * 24 * H));
    let session = h.store.get(SESSION_ACCOUNT).unwrap().unwrap();
    assert!(session.contains("refresh-a"));
    let cache = h.store.get(CACHE_ACCOUNT).unwrap().unwrap();
    assert!(!cache.contains("access-a") && !cache.contains("refresh-a"));
    let status = serde_json::to_string(&app.status()).unwrap();
    assert!(!status.contains("access-a") && !status.contains("refresh-a"));
    assert!(!status.contains("12345678"), "the code is never kept");
}

// ── Returning users, refresh, revocation ──────────────────────────────────

#[test]
fn a_returning_user_is_restored_without_signing_in_again() {
    let h = Harness::new();
    sign_in(&h, &h.app(), "BETA", Some(T0 + 30 * 24 * H));
    let restarted = h.app();
    assert!(restarted.may_start());
    assert_eq!(restarted.status().phase, "active");
    assert!(restarted.status().signed_in);
}

#[test]
fn an_expired_access_token_is_refreshed_and_the_rotated_token_stored() {
    let h = Harness::new();
    sign_in(&h, &h.app(), "BETA", Some(T0 + 30 * 24 * H));
    h.advance(2 * H);
    let app = h.app();
    h.fake.answer("/auth/v1/token", 200, h.session_answer("b", 3600));
    h.fake.answer("/rest/v1/rpc/get_my_access", 200, h.access_answer("BETA", true, Some(T0 + 30 * 24 * H)));
    let status = app.check();
    assert_eq!(status.phase, "active");
    assert_eq!(h.fake.calls_to("/auth/v1/token")[0].1["refresh_token"], "refresh-a");
    assert!(h.store.get(SESSION_ACCOUNT).unwrap().unwrap().contains("refresh-b"));
    assert_eq!(h.fake.calls_to("/rest/v1/rpc/get_my_access").last().unwrap().0.as_deref(), Some("access-b"));
}

#[test]
fn a_rejected_session_returns_to_sign_in_with_no_grace() {
    let h = Harness::new();
    sign_in(&h, &h.app(), "BETA", Some(T0 + 30 * 24 * H));
    h.advance(2 * H);
    let app = h.app();
    h.fake.answer("/auth/v1/token", 400, json!({ "error_code": "refresh_token_not_found" }));
    let status = app.check();
    assert_eq!(status.phase, "signed_out");
    assert!(!status.may_start_sessions);
    assert_eq!(h.store.get(SESSION_ACCOUNT).unwrap(), None);
}

#[test]
fn a_revoked_or_expired_beta_is_refused_at_the_next_check_without_grace() {
    let h = Harness::new();
    let app = h.app();
    sign_in(&h, &app, "BETA", Some(T0 + 30 * 24 * H));
    h.advance(30 * 60 * 1000); // token still valid: no refresh needed
    h.fake.answer("/rest/v1/rpc/get_my_access", 200, h.access_answer("LAPSED", false, None));
    let status = app.check();
    assert_eq!(status.phase, "lapsed");
    assert!(!status.may_start_sessions);
    assert_eq!(status.denial, Some(Denial::ServerDenied));
    assert!(status.signed_in, "the account stays signed in; only sessions are blocked");
}

#[test]
fn an_account_without_entitlement_is_no_access() {
    let h = Harness::new();
    let app = h.app();
    h.fake.answer("/auth/v1/verify", 200, h.session_answer("a", 3600));
    h.fake.answer("/rest/v1/rpc/get_my_access", 200, h.access_answer("NONE", false, None));
    assert_eq!(app.verify_code("friend@example.com", "12345678").unwrap().phase, "no_access");
}

// ── Offline grace and the clock ───────────────────────────────────────────

#[test]
fn offline_the_last_verification_carries_for_72_hours() {
    let h = Harness::new();
    sign_in(&h, &h.app(), "BETA", Some(T0 + 30 * 24 * H));
    h.advance(71 * H);
    let app = h.app();
    h.fake.offline("/rest/v1/rpc/get_my_access");
    h.fake.offline("/auth/v1/token");
    let status = app.check();
    assert_eq!(status.phase, "active");
    assert_eq!(status.source, Some(Source::OfflineGrace));
    assert_eq!(status.until_ms, Some(T0 + 72 * H));
    assert_eq!(status.last_error, Some("network"));
}

#[test]
fn offline_beyond_72_hours_blocks_new_sessions_and_asks_to_reconnect() {
    let h = Harness::new();
    sign_in(&h, &h.app(), "BETA", Some(T0 + 30 * 24 * H));
    h.advance(73 * H);
    let app = h.app();
    h.fake.offline("/auth/v1/token");
    let status = app.check();
    assert!(!status.may_start_sessions);
    assert_eq!(status.phase, "network_error");
    assert_eq!(status.denial, Some(Denial::GraceExpired));
}

#[test]
fn reconnecting_checks_again_and_restores_access() {
    let h = Harness::new();
    sign_in(&h, &h.app(), "INTERNAL", None);
    h.advance(80 * H);
    let app = h.app();
    assert!(!app.may_start());
    h.fake.answer("/auth/v1/token", 200, h.session_answer("b", 3600));
    h.fake.answer("/rest/v1/rpc/get_my_access", 200, h.access_answer("INTERNAL", true, None));
    assert!(app.check().may_start_sessions);
}

#[test]
fn setting_the_clock_back_while_offline_does_not_restore_access() {
    let h = Harness::new();
    sign_in(&h, &h.app(), "BETA", Some(T0 + 30 * 24 * H));
    // The app runs offline for three days and notices the time...
    h.advance(73 * H);
    let app = h.app();
    assert!(!app.may_start());
    // ...then the user rewinds the clock to just after the verification.
    h.set_clock(T0 + H);
    assert!(!app.may_start(), "rewinding within the same run is caught");
    assert_eq!(app.status().denial, Some(Denial::ClockRollback));
}

#[test]
fn the_rollback_guard_survives_a_restart() {
    let h = Harness::new();
    sign_in(&h, &h.app(), "BETA", Some(T0 + 30 * 24 * H));
    h.advance(70 * H);
    h.app().status(); // the app saw this time and stored the high-water mark
    h.set_clock(T0 + H);
    assert_eq!(h.app().status().denial, Some(Denial::ClockRollback));
}

#[test]
fn a_server_check_accepts_a_corrected_clock_again() {
    let h = Harness::new();
    sign_in(&h, &h.app(), "BETA", Some(T0 + 30 * 24 * H));
    h.advance(10 * H);
    let app = h.app();
    app.status();
    h.set_clock(T0 + 2 * H);
    assert!(!app.may_start());
    h.fake.answer("/auth/v1/token", 200, h.session_answer("b", 3600));
    h.fake.answer("/rest/v1/rpc/get_my_access", 200, h.access_answer("BETA", true, Some(T0 + 30 * 24 * H)));
    assert!(app.check().may_start_sessions);
}

// ── Sign-out and the data boundary ────────────────────────────────────────

#[test]
fn signing_out_removes_only_the_two_access_items() {
    let h = Harness::new();
    h.store.set("anthropic-api-key", "kept").unwrap();
    h.store.set("unrelated-item", "kept").unwrap();
    let app = h.app();
    sign_in(&h, &app, "BETA", Some(T0 + 30 * 24 * H));
    h.fake.answer("/auth/v1/logout", 204, Value::Null);
    let status = app.sign_out();
    assert_eq!(status.phase, "signed_out");
    assert!(!status.may_start_sessions);
    assert_eq!(h.store.get(SESSION_ACCOUNT).unwrap(), None);
    assert_eq!(h.store.get(CACHE_ACCOUNT).unwrap(), None);
    assert_eq!(h.store.get("anthropic-api-key").unwrap().as_deref(), Some("kept"));
    assert_eq!(h.store.get("unrelated-item").unwrap().as_deref(), Some("kept"));
}

#[test]
fn signing_out_offline_still_signs_out_locally() {
    let h = Harness::new();
    let app = h.app();
    sign_in(&h, &app, "BETA", Some(T0 + 30 * 24 * H));
    h.fake.offline("/auth/v1/logout");
    assert_eq!(app.sign_out().phase, "signed_out");
    assert_eq!(h.store.get(SESSION_ACCOUNT).unwrap(), None);
}

#[test]
fn a_corrupted_keychain_item_means_signed_out_not_a_crash() {
    let h = Harness::new();
    h.store.set(SESSION_ACCOUNT, "{not json").unwrap();
    h.store.set(CACHE_ACCOUNT, "\u{0}garbage").unwrap();
    let status = h.app().status();
    assert_eq!(status.phase, "signed_out");
    assert!(!status.may_start_sessions);
}

/// The access module must stay away from session history: no database, no
/// history commands, no WebView storage. Checked on the source so a later
/// edit cannot quietly add a dependency.
#[test]
fn the_access_module_never_touches_session_history() {
    let sources = [
        include_str!("mod.rs"),
        include_str!("client.rs"),
        include_str!("store.rs"),
        include_str!("grace.rs"),
        include_str!("gate.rs"),
        include_str!("config.rs"),
    ];
    for source in sources {
        let code: String = source.lines().filter(|line| !line.trim_start().starts_with("//")).collect::<Vec<_>>().join("\n");
        for forbidden in ["rusqlite", "DbState", "sessions.db", "crate::db", "db::", "localStorage", "remove_dir", "remove_file"] {
            assert!(!code.contains(forbidden), "access code must not reference `{forbidden}`");
        }
    }
}
