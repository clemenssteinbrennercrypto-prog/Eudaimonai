//! The real client against the LOCAL Supabase stack: Auth with the
//! invite-only hook, the database functions and the mail catcher. Ignored by
//! default; `supabase/tests/app-access.sh` resets the local database and runs
//! them. They refuse any non-local backend.

use std::process::Command;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::Arc;

use super::client::UreqTransport;
use super::store::{memory::MemoryStore, SecretStore};
use super::AccessManager;

const API: &str = "http://127.0.0.1:54321";
const MAIL: &str = "http://127.0.0.1:54324";
const DB: &str = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const KEY: &str = "sb_publishable_ACJWlzQHlZjBrEguHvfOxg_3BJgxAaH"; // local demo key

fn sql(query: &str) -> String {
    let psql = std::env::var("PSQL").unwrap_or_else(|_| "/opt/homebrew/opt/libpq/bin/psql".into());
    let out = Command::new(psql).args([DB, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", query]).output().expect("psql");
    assert!(out.status.success(), "sql failed: {}", String::from_utf8_lossy(&out.stderr));
    String::from_utf8_lossy(&out.stdout).trim().to_string()
}

fn clear_mail() {
    let _ = ureq::delete(&format!("{MAIL}/api/v1/messages")).call();
}

fn latest_code(email: &str) -> String {
    for _ in 0..40 {
        let search: serde_json::Value = ureq::get(&format!("{MAIL}/api/v1/search"))
            .query("query", format!("to:\"{email}\""))
            .call().unwrap().body_mut().read_json().unwrap();
        if let Some(id) = search["messages"][0]["ID"].as_str() {
            let message: serde_json::Value = ureq::get(&format!("{MAIL}/api/v1/message/{id}")).call().unwrap().body_mut().read_json().unwrap();
            let text = message["Text"].as_str().unwrap_or_default();
            if let Some(code) = text.split(|c: char| !c.is_ascii_digit()).find(|part| part.len() == 8) {
                return code.to_string();
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(250));
    }
    panic!("no code for {email}");
}

struct Shared(Arc<MemoryStore>);
impl SecretStore for Shared {
    fn get(&self, a: &str) -> Result<Option<String>, String> { self.0.get(a) }
    fn set(&self, a: &str, v: &str) -> Result<(), String> { self.0.set(a, v) }
    fn delete(&self, a: &str) -> Result<(), String> { self.0.delete(a) }
}

fn app(store: &Arc<MemoryStore>, offset_ms: Arc<AtomicI64>) -> AccessManager {
    AccessManager::new(
        Box::new(UreqTransport::with_backend(API, KEY)),
        Box::new(Shared(store.clone())),
        Box::new(move || chrono::Utc::now().timestamp_millis() + offset_ms.load(Ordering::SeqCst)),
    )
}

#[test]
#[ignore = "needs the local Supabase stack; run supabase/tests/app-access.sh"]
fn live_beta_access_flow_against_local_supabase() {
    let store = Arc::new(MemoryStore::default());
    let offset = Arc::new(AtomicI64::new(0));
    let access = app(&store, offset.clone());

    // Waitlist from the app: no account, attributed to the app.
    let status = access.request_waitlist("Waiting@Example.com").unwrap();
    assert_eq!(status.phase, "waitlist_pending");
    assert_eq!(sql("select source from public.waitlist_entries where email_normalized = 'waiting@example.com'"), "macos_app");
    assert_eq!(sql("select count(*) from auth.users where email = 'waiting@example.com'"), "0");

    // "Check again" without an invitation.
    assert_eq!(access.send_code("waiting@example.com"), Err("not_invited"));

    // The founder invites the person (owner SQL stands in for the admin console).
    sql("insert into public.beta_invitations (email_normalized, expires_at) values ('waiting@example.com', now() + interval '72 hours')");

    // "Check again" now sends a code; entering it activates the invitation.
    clear_mail();
    access.send_code("waiting@example.com").unwrap();
    let code = latest_code("waiting@example.com");
    assert_eq!(access.verify_code("waiting@example.com", "00000000").unwrap_err(), "code_invalid");
    let status = access.verify_code("waiting@example.com", &code).unwrap();
    assert_eq!(status.phase, "active", "{status:?}");
    assert_eq!(status.state.as_deref(), Some("BETA"));
    assert!(status.may_start_sessions);
    assert!(!status.waitlist_pending);
    assert_eq!(sql("select count(*) from public.beta_allocations where email_hash = private.email_hash('waiting@example.com')"), "1");

    // A restart restores the session without signing in again.
    let restarted = app(&store, offset.clone());
    assert!(restarted.may_start());
    assert_eq!(restarted.check().phase, "active");

    // Two hours later the access token has expired: the real refresh endpoint
    // rotates it.
    offset.store(2 * 60 * 60 * 1000, Ordering::SeqCst);
    let later = app(&store, offset.clone());
    let before = store.get(super::store::SESSION_ACCOUNT).unwrap().unwrap();
    assert_eq!(later.check().phase, "active");
    let after = store.get(super::store::SESSION_ACCOUNT).unwrap().unwrap();
    assert_ne!(before, after, "the rotated session was stored");
    offset.store(0, Ordering::SeqCst);

    // The founder revokes the beta: the next check refuses, with no grace.
    sql("update public.entitlements set revoked_at = now() where kind = 'beta'");
    let checked = later.check();
    assert_eq!(checked.phase, "lapsed", "{checked:?}");
    assert!(!later.may_start());

    // Signing out ends the server session too.
    assert_eq!(later.sign_out().phase, "signed_out");
    assert_eq!(sql("select count(*) from auth.sessions s join auth.users u on u.id = s.user_id where u.email = 'waiting@example.com'"), "0");
}
