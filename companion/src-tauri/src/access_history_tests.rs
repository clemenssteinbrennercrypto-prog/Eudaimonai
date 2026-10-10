//! Losing, changing or ending beta access must never touch session history.
//! This drives every access transition over a real on-disk session database
//! (WAL mode, as installed) and compares the history before and after.

use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use serde_json::{json, Value};

use crate::access::tests::{sign_in, Harness, H, T0};
use crate::db;

fn temp_dir() -> PathBuf {
    let dir = std::env::temp_dir().join(format!("eudaimonai-access-history-{}-{}", std::process::id(), T0));
    std::fs::create_dir_all(&dir).unwrap();
    dir
}

fn fingerprint(dir: &Path) -> Vec<(String, u64)> {
    let mut files: Vec<_> = std::fs::read_dir(dir).unwrap().map(|e| e.unwrap().path()).collect();
    files.sort();
    files.iter().map(|path| {
        let mut hasher = DefaultHasher::new();
        std::fs::read(path).unwrap().hash(&mut hasher);
        (path.file_name().unwrap().to_string_lossy().to_string(), hasher.finish())
    }).collect()
}

fn seed(connection: &mut rusqlite::Connection) {
    for (n, day) in [(1, "2026-10-01"), (2, "2026-10-02"), (3, "2026-10-03")] {
        let id = format!("session-{n}");
        let summary = db::SessionSummary {
            id: id.clone(), timestamp: T0 - n * 24 * H, task: "Thesis".into(), actual_seconds: 1800,
            focused_seconds: Some(1500), measured_seconds: Some(1800), completed: true, measured: true,
            ..Default::default()
        };
        let session = json!({ "id": id, "task": "Thesis", "actualSeconds": 1800, "timeline": [{ "second": 0, "score": 80 }] });
        db::save_session(connection, &session, &summary, None, Some((day, &json!({ "focusedSeconds": 1500 })))).unwrap();
    }
}

#[test]
fn no_access_transition_changes_session_history() {
    let dir = temp_dir();
    let path = dir.join("sessions.db");
    let mut connection = db::open(&path).unwrap();
    seed(&mut connection);
    let archive_before: Value = db::export_archive(&connection).unwrap();
    let files_before = fingerprint(&dir);
    assert_eq!(archive_before["sessions"].as_array().unwrap().len(), 3);

    let h = Harness::new();
    let app = h.app();
    // Sign in (invited → BETA).
    sign_in(&h, &app, "BETA", Some(T0 + 30 * 24 * H));
    // Offline within grace, then beyond it.
    h.advance(71 * H);
    h.fake.offline("/auth/v1/token");
    app.check();
    h.advance(5 * H);
    h.fake.offline("/auth/v1/token");
    app.check();
    // Restart, reconnect, then expiry / revocation reported by the server.
    let app = h.app();
    h.fake.answer("/auth/v1/token", 200, h.session_answer("b", 3600));
    h.fake.answer("/rest/v1/rpc/get_my_access", 200, h.access_answer("LAPSED", false, None));
    assert_eq!(app.check().phase, "lapsed");
    // Sign out.
    h.fake.answer("/auth/v1/logout", 204, Value::Null);
    assert_eq!(app.sign_out().phase, "signed_out");

    assert_eq!(db::export_archive(&connection).unwrap(), archive_before, "history content is unchanged");
    assert_eq!(fingerprint(&dir), files_before, "the database files are byte-identical");

    // And after a restart of the app, the same database still holds it all.
    drop(connection);
    let reopened = db::open(&path).unwrap();
    assert_eq!(db::export_archive(&reopened).unwrap(), archive_before);
    drop(reopened);
    std::fs::remove_dir_all(&dir).unwrap();
}
