// Durable session storage.
//
// The web build keeps history in localStorage, which caps out around 5 MB and
// therefore drops everything past the newest 100 sessions. Per-second timelines
// are most of that weight, so the cap bites quickly. This module is the native
// answer: a real SQLite file in the app data directory, holding the complete
// history indefinitely.
//
// ── Division of labour, deliberately lopsided ───────────────────────────────
//
// Rust stores; JavaScript decides. Every value that requires product knowledge
// — whether a session counts as measured, what its focus contribution is, how
// an outcome normalizes — is computed on the JS side and handed here as data.
// This module never re-derives any of it.
//
// That is not laziness. Focus Metric V1 and the attention scoring rules live in
// focusMetric.js with their versioning and their refusals; a second, drifting
// implementation on this side of the language boundary is exactly the class of
// bug the project's invariants warn about. So: sessions arrive with a
// pre-computed `summary` for the indexed columns and a pre-computed ledger day,
// and SQLite's only job is to write them atomically and hand them back.
//
// The one exception is deleting a session's ledger contribution, which is
// referential cleanup (drop this id, drop the day if it empties) rather than
// scoring, and is safe to do here.

use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashSet;
use std::sync::Mutex;

/// Bumping this triggers `migrate()` on next open. Add a new arm there; never
/// edit an existing one, or already-shipped databases will skip the change.
const SCHEMA_VERSION: i64 = 1;

const MIGRATION_STATUS_KEY: &str = "legacy_migration_status";
const MIGRATION_COUNTS_KEY: &str = "legacy_migration_counts";
// Unlike the JS retry marker, this lives in the same durable SQLite store as
// the deletion itself. It is the safety boundary when localStorage cannot be
// written (including when the retry marker cannot be written either).
const LEGACY_DELETION_TOMBSTONE_KEY: &str = "legacy_history_deletion_tombstone";
// Written in the same transaction as clear_all and removed only after the
// WebView confirms its old browser-storage copy is gone. Keeping this separate
// from the tombstone matters: the tombstone is permanent, while this flag is a
// retryable piece of cleanup work and the only durable signal available when
// localStorage itself refuses both reads and writes.
const LEGACY_CLEANUP_PENDING_KEY: &str = "legacy_history_cleanup_pending";
const MIGRATION_DONE: &str = "completed";
const CLEANUP_PENDING: &str = "pending";

pub struct DbState(pub Mutex<Connection>);

/// Lenient number parsing for the indexed columns.
///
/// These come from a live JavaScript accumulator that adds elapsed time in
/// fractions, so `focusedSeconds` is routinely something like
/// 92.59400000000004 rather than 93. Declaring them as plain integers made
/// serde reject the payload outright — which meant a real history could not be
/// imported at all, while a test fixture full of round numbers passed happily.
///
/// These columns exist only to filter and sort on; the exact original value is
/// preserved verbatim in `record_json` either way. So anything numeric is
/// accepted and rounded, and anything else degrades to zero rather than
/// failing the whole import.
mod lenient {
    use serde::{Deserialize, Deserializer};
    use serde_json::Value;

    pub fn i64<'de, D: Deserializer<'de>>(deserializer: D) -> Result<i64, D::Error> {
        Ok(Value::deserialize(deserializer)?
            .as_f64()
            .map(|value| value.round() as i64)
            .unwrap_or(0))
    }

    pub fn opt_i64<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<i64>, D::Error> {
        Ok(Value::deserialize(deserializer)?
            .as_f64()
            .map(|value| value.round() as i64))
    }
}

/// The indexed columns behind a session, computed by the JS repository so the
/// two adapters cannot disagree about what a filter means. See sessionQuery.js
/// for the semantics each of these fields feeds.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SessionSummary {
    pub id: String,
    #[serde(deserialize_with = "lenient::i64")]
    pub timestamp: i64,
    pub task: String,
    pub goal: String,
    #[serde(deserialize_with = "lenient::i64")]
    pub actual_seconds: i64,
    #[serde(deserialize_with = "lenient::opt_i64")]
    pub focused_seconds: Option<i64>,
    #[serde(deserialize_with = "lenient::opt_i64")]
    pub measured_seconds: Option<i64>,
    #[serde(deserialize_with = "lenient::i64")]
    pub distraction_events: i64,
    /// Normalized to yes/partly/no by JS, or absent when never rated.
    pub goal_outcome: Option<String>,
    pub workspace_id: Option<String>,
    #[serde(deserialize_with = "lenient::opt_i64")]
    pub workspace_revision: Option<i64>,
    pub workspace_name: Option<String>,
    pub energy_level: Option<String>,
    pub completed: bool,
    /// Whether focus was genuinely measured — `hasMeasuredFocus` on the JS side.
    pub measured: bool,
    pub tags: Vec<String>,
    /// Lowercased task + tags, so a LIKE here matches what the JS filter does.
    pub search_text: String,
}

/// Filters for a summary listing. Dates arrive as an absolute epoch bound
/// rather than a range name: the JS side already knows the user's timezone and
/// what "this month" means there, and re-deriving that in Rust would be a
/// second calendar implementation to keep in step.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SummaryQuery {
    pub date_from: Option<i64>,
    pub date_to: Option<i64>,
    /// "yes" | "partly" | "no" | "unrated" | absent for all.
    pub outcome: Option<String>,
    pub workspace_id: Option<String>,
    /// "measured" | "unmeasured" | absent for all.
    pub measurement: Option<String>,
    pub search: Option<String>,
    pub page: Option<i64>,
    pub page_size: Option<i64>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SummaryPage {
    pub rows: Vec<Value>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
    pub page_count: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationOutcome {
    pub migrated: bool,
    pub imported_count: i64,
    pub skipped_duplicate_count: i64,
    pub verified: bool,
    pub reason: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreOutcome {
    pub imported_count: i64,
    pub skipped_duplicate_count: i64,
    pub verified: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ArchiveRestoreItem {
    pub session: Value,
    pub summary: SessionSummary,
    pub analysis: Option<Value>,
}

/// One re-derived session record sent by the JavaScript scoring authority.
/// The whole batch lands with its rebuilt ledger in a single transaction.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusBackfillUpdate {
    pub id: String,
    pub patch: Value,
    pub summary: SessionSummary,
    pub analysis: Option<Value>,
}

fn to_err(error: impl std::fmt::Display) -> String {
    error.to_string()
}

// ── Schema ──────────────────────────────────────────────────────────────────

pub fn open(path: &std::path::Path) -> Result<Connection, String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(to_err)?;
    }
    let connection = Connection::open(path).map_err(to_err)?;
    prepare(&connection)?;
    Ok(connection)
}

/// Create the schema if absent and run any pending migration. Idempotent, so
/// it runs on every open.
pub fn prepare(connection: &Connection) -> Result<(), String> {
    // Durability over raw speed: a focus session is minutes of the user's life,
    // and WAL keeps a crash from taking the most recent one with it.
    connection
        .pragma_update(None, "journal_mode", "WAL")
        .map_err(to_err)?;
    connection
        .pragma_update(None, "foreign_keys", "ON")
        .map_err(to_err)?;

    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS schema_meta (
                 key   TEXT PRIMARY KEY,
                 value TEXT NOT NULL
             );

             CREATE TABLE IF NOT EXISTS sessions (
                 id                 TEXT PRIMARY KEY,
                 timestamp          INTEGER NOT NULL,
                 record_json        TEXT NOT NULL,
                 timeline_json      TEXT NOT NULL,
                 analysis_json      TEXT,
                 analysis_version   INTEGER,
                 task               TEXT NOT NULL DEFAULT '',
                 goal               TEXT NOT NULL DEFAULT '',
                 actual_seconds     INTEGER NOT NULL DEFAULT 0,
                 focused_seconds    INTEGER,
                 measured_seconds   INTEGER,
                 distraction_events INTEGER NOT NULL DEFAULT 0,
                 goal_outcome       TEXT,
                 workspace_id       TEXT,
                 workspace_revision INTEGER,
                 workspace_name     TEXT,
                 energy_level       TEXT,
                 completed          INTEGER NOT NULL DEFAULT 0,
                 measured           INTEGER NOT NULL DEFAULT 0,
                 tags_json          TEXT NOT NULL DEFAULT '[]',
                 search_text        TEXT NOT NULL DEFAULT ''
             );

             CREATE INDEX IF NOT EXISTS idx_sessions_timestamp ON sessions(timestamp DESC);
             CREATE INDEX IF NOT EXISTS idx_sessions_outcome   ON sessions(goal_outcome);
             CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_id, workspace_revision);

             CREATE TABLE IF NOT EXISTS focus_ledger_days (
                 day_key    TEXT PRIMARY KEY,
                 entry_json TEXT NOT NULL
             );",
        )
        .map_err(to_err)?;

    migrate(connection)
}

fn migrate(connection: &Connection) -> Result<(), String> {
    let current: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(to_err)?;
    if current >= SCHEMA_VERSION {
        return Ok(());
    }
    // Version 1 is the base schema created above; later versions add their
    // ALTER TABLE steps here, each gated on the version it upgrades from.
    connection
        .pragma_update(None, "user_version", SCHEMA_VERSION)
        .map_err(to_err)?;
    Ok(())
}

fn meta_get(connection: &Connection, key: &str) -> Result<Option<String>, String> {
    connection
        .query_row(
            "SELECT value FROM schema_meta WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()
        .map_err(to_err)
}

fn meta_set(tx: &Transaction<'_>, key: &str, value: &str) -> Result<(), String> {
    tx.execute(
        "INSERT INTO schema_meta (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(to_err)?;
    Ok(())
}

// ── Writing ─────────────────────────────────────────────────────────────────

/// Split the heavy timeline out of the record. A list view draws none of it,
/// and it is the bulk of a session's bytes, so summaries must never carry it.
fn split_timeline(session: &Value) -> (Value, Value) {
    let mut record = session.clone();
    let timeline = record
        .get_mut("timeline")
        .map(|slot| slot.take())
        .unwrap_or(Value::Array(vec![]));
    if let Some(object) = record.as_object_mut() {
        object.remove("timeline");
    }
    (record, timeline)
}

fn write_session(
    tx: &Transaction<'_>,
    session: &Value,
    summary: &SessionSummary,
    analysis: Option<&Value>,
) -> Result<(), String> {
    let (record, timeline) = split_timeline(session);
    tx.execute(
        "INSERT INTO sessions (
             id, timestamp, record_json, timeline_json, analysis_json, analysis_version,
             task, goal, actual_seconds, focused_seconds, measured_seconds,
             distraction_events, goal_outcome, workspace_id, workspace_revision,
             workspace_name, energy_level, completed, measured, tags_json, search_text
         ) VALUES (
             ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11,
             ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20, ?21
         )
         ON CONFLICT(id) DO UPDATE SET
             timestamp = excluded.timestamp,
             record_json = excluded.record_json,
             timeline_json = excluded.timeline_json,
             analysis_json = excluded.analysis_json,
             analysis_version = excluded.analysis_version,
             task = excluded.task,
             goal = excluded.goal,
             actual_seconds = excluded.actual_seconds,
             focused_seconds = excluded.focused_seconds,
             measured_seconds = excluded.measured_seconds,
             distraction_events = excluded.distraction_events,
             goal_outcome = excluded.goal_outcome,
             workspace_id = excluded.workspace_id,
             workspace_revision = excluded.workspace_revision,
             workspace_name = excluded.workspace_name,
             energy_level = excluded.energy_level,
             completed = excluded.completed,
             measured = excluded.measured,
             tags_json = excluded.tags_json,
             search_text = excluded.search_text",
        params![
            summary.id,
            summary.timestamp,
            serde_json::to_string(&record).map_err(to_err)?,
            serde_json::to_string(&timeline).map_err(to_err)?,
            analysis
                .map(|value| serde_json::to_string(value))
                .transpose()
                .map_err(to_err)?,
            analysis.and_then(|value| value.get("version")).and_then(Value::as_i64),
            summary.task,
            summary.goal,
            summary.actual_seconds,
            summary.focused_seconds,
            summary.measured_seconds,
            summary.distraction_events,
            summary.goal_outcome,
            summary.workspace_id,
            summary.workspace_revision,
            summary.workspace_name,
            summary.energy_level,
            summary.completed as i64,
            summary.measured as i64,
            serde_json::to_string(&summary.tags).map_err(to_err)?,
            summary.search_text.to_lowercase(),
        ],
    )
    .map_err(to_err)?;
    Ok(())
}

/// Upsert one day of the focus ledger. `entry` is the day object as
/// focusMetric.js produced it: `{ sessions: { <id>: contribution } }`.
fn write_ledger_day(tx: &Transaction<'_>, day_key: &str, entry: &Value) -> Result<(), String> {
    tx.execute(
        "INSERT INTO focus_ledger_days (day_key, entry_json) VALUES (?1, ?2)
         ON CONFLICT(day_key) DO UPDATE SET entry_json = excluded.entry_json",
        params![day_key, serde_json::to_string(entry).map_err(to_err)?],
    )
    .map_err(to_err)?;
    Ok(())
}

/// Drop a session's ledger contribution wherever it sits, removing the day
/// entirely once it holds nothing else. Mirrors removeSessionFromFocusLedger.
fn drop_ledger_contribution(tx: &Transaction<'_>, session_id: &str) -> Result<(), String> {
    let days: Vec<(String, String)> = {
        let mut statement = tx
            .prepare("SELECT day_key, entry_json FROM focus_ledger_days")
            .map_err(to_err)?;
        let rows = statement
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(to_err)?;
        rows.collect::<Result<_, _>>().map_err(to_err)?
    };

    for (day_key, entry_json) in days {
        let Ok(mut entry) = serde_json::from_str::<Value>(&entry_json) else {
            continue;
        };
        let removed = entry
            .get_mut("sessions")
            .and_then(Value::as_object_mut)
            .map(|sessions| sessions.remove(session_id).is_some())
            .unwrap_or(false);
        if !removed {
            continue;
        }
        let empty = entry
            .get("sessions")
            .and_then(Value::as_object)
            .map(Map::is_empty)
            .unwrap_or(true);
        if empty {
            tx.execute(
                "DELETE FROM focus_ledger_days WHERE day_key = ?1",
                params![day_key],
            )
            .map_err(to_err)?;
        } else {
            write_ledger_day(tx, &day_key, &entry)?;
        }
    }
    Ok(())
}

// ── Reading ─────────────────────────────────────────────────────────────────

fn row_record(row: &rusqlite::Row<'_>, with_timeline: bool) -> rusqlite::Result<Value> {
    let record_json: String = row.get("record_json")?;
    let mut record: Value = serde_json::from_str(&record_json).unwrap_or_else(|_| json!({}));

    if with_timeline {
        let timeline_json: String = row.get("timeline_json")?;
        let timeline: Value =
            serde_json::from_str(&timeline_json).unwrap_or_else(|_| Value::Array(vec![]));
        if let Some(object) = record.as_object_mut() {
            object.insert("timeline".into(), timeline);
        }
    }

    if let Some(object) = record.as_object_mut() {
        let analysis: Option<String> = row.get("analysis_json")?;
        if let Some(analysis) = analysis.and_then(|raw| serde_json::from_str::<Value>(&raw).ok()) {
            object.insert("analysisSnapshot".into(), analysis);
        }
    }
    Ok(record)
}

fn load_ledger(connection: &Connection) -> Result<Value, String> {
    let mut statement = connection
        .prepare("SELECT day_key, entry_json FROM focus_ledger_days")
        .map_err(to_err)?;
    let rows = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(to_err)?;

    let mut days = Map::new();
    for row in rows {
        let (day_key, entry_json) = row.map_err(to_err)?;
        if let Ok(entry) = serde_json::from_str::<Value>(&entry_json) {
            days.insert(day_key, entry);
        }
    }
    Ok(json!({ "schemaVersion": 1, "days": days }))
}

/// Neutralise LIKE's wildcards so a search term is matched literally. The
/// backslash is escaped first, or it would corrupt the escapes added after it.
fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

/// Build the WHERE clause for a summary listing. Returns the SQL fragment plus
/// its bound values, so the count and page queries cannot drift apart.
fn summary_filters(query: &SummaryQuery) -> (String, Vec<Box<dyn rusqlite::ToSql>>) {
    let mut clauses: Vec<String> = Vec::new();
    let mut binds: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(from) = query.date_from {
        clauses.push(format!("timestamp >= ?{}", binds.len() + 1));
        binds.push(Box::new(from));
    }
    if let Some(to) = query.date_to {
        clauses.push(format!("timestamp <= ?{}", binds.len() + 1));
        binds.push(Box::new(to));
    }
    match query.outcome.as_deref() {
        Some("unrated") => clauses.push("goal_outcome IS NULL".into()),
        Some(value) if value != "all" => {
            clauses.push(format!("goal_outcome = ?{}", binds.len() + 1));
            binds.push(Box::new(value.to_string()));
        }
        _ => {}
    }
    if let Some(workspace) = query.workspace_id.as_deref() {
        if workspace != "all" {
            clauses.push(format!("workspace_id = ?{}", binds.len() + 1));
            binds.push(Box::new(workspace.to_string()));
        }
    }
    match query.measurement.as_deref() {
        Some("measured") => clauses.push("measured = 1".into()),
        Some("unmeasured") => clauses.push("measured = 0".into()),
        _ => {}
    }
    if let Some(search) = query.search.as_deref() {
        let trimmed = search.trim();
        if !trimmed.is_empty() {
            // Searching for "50%" must look for a literal percent sign, not
            // "anything after 50". LIKE's own wildcards have to be escaped or
            // the in-memory filter and this one disagree on such queries.
            clauses.push(format!("search_text LIKE ?{} ESCAPE '\\'", binds.len() + 1));
            binds.push(Box::new(format!("%{}%", escape_like(&trimmed.to_lowercase()))));
        }
    }

    let sql = if clauses.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", clauses.join(" AND "))
    };
    (sql, binds)
}

// ── Operations, each one transaction ────────────────────────────────────────

pub fn save_session(
    connection: &mut Connection,
    session: &Value,
    summary: &SessionSummary,
    analysis: Option<&Value>,
    ledger_day: Option<(&str, &Value)>,
) -> Result<Value, String> {
    let tx = connection.transaction().map_err(to_err)?;
    write_session(&tx, session, summary, analysis)?;
    // The session row and its ledger contribution land together or not at all:
    // a half-written pair would show a session whose focus score is missing.
    if let Some((day_key, entry)) = ledger_day {
        write_ledger_day(&tx, day_key, entry)?;
    }
    tx.commit().map_err(to_err)?;
    Ok(session.clone())
}

pub fn get_session(connection: &Connection, id: &str) -> Result<Option<Value>, String> {
    connection
        .query_row(
            "SELECT record_json, timeline_json, analysis_json FROM sessions WHERE id = ?1",
            params![id],
            |row| row_record(row, true),
        )
        .optional()
        .map_err(to_err)
}

pub fn load_all(connection: &Connection) -> Result<Vec<Value>, String> {
    let mut statement = connection
        .prepare(
            "SELECT record_json, timeline_json, analysis_json FROM sessions ORDER BY timestamp DESC",
        )
        .map_err(to_err)?;
    let rows = statement
        .query_map([], |row| row_record(row, true))
        .map_err(to_err)?;
    rows.collect::<Result<_, _>>().map_err(to_err)
}

pub fn list_summaries(
    connection: &Connection,
    query: &SummaryQuery,
) -> Result<SummaryPage, String> {
    let (where_sql, binds) = summary_filters(query);
    let bind_refs: Vec<&dyn rusqlite::ToSql> = binds.iter().map(|b| b.as_ref()).collect();

    let total: i64 = connection
        .query_row(
            &format!("SELECT COUNT(*) FROM sessions{where_sql}"),
            bind_refs.as_slice(),
            |row| row.get(0),
        )
        .map_err(to_err)?;

    let page_size = query.page_size.filter(|size| *size > 0).unwrap_or(10);
    let page = query.page.filter(|page| *page > 0).unwrap_or(0);
    let offset = page * page_size;

    // Summaries deliberately omit the timeline — see split_timeline.
    let sql = format!(
        "SELECT record_json, timeline_json, analysis_json FROM sessions{where_sql}
         ORDER BY timestamp DESC LIMIT {page_size} OFFSET {offset}"
    );
    let mut statement = connection.prepare(&sql).map_err(to_err)?;
    let rows = statement
        .query_map(bind_refs.as_slice(), |row| row_record(row, false))
        .map_err(to_err)?;
    let rows: Vec<Value> = rows.collect::<Result<_, _>>().map_err(to_err)?;

    Ok(SummaryPage {
        rows,
        total,
        page,
        page_size,
        page_count: ((total as f64) / (page_size as f64)).ceil().max(1.0) as i64,
    })
}

pub fn update_session(
    connection: &mut Connection,
    id: &str,
    patch: &Value,
    summary: Option<&SessionSummary>,
    analysis: Option<&Value>,
) -> Result<Option<Value>, String> {
    let Some(existing) = get_session(connection, id)? else {
        return Ok(None);
    };

    let mut merged = existing;
    if let (Some(target), Some(patch)) = (merged.as_object_mut(), patch.as_object()) {
        for (key, value) in patch {
            target.insert(key.clone(), value.clone());
        }
    }

    // A caller that changed the outcome sends a refreshed summary so the
    // indexed columns keep matching the record; one that only touched a note
    // may omit it, and the existing columns stand.
    let summary = match summary {
        Some(summary) => summary.clone(),
        None => summary_from_row(connection, id)?,
    };

    let tx = connection.transaction().map_err(to_err)?;
    write_session(&tx, &merged, &summary, analysis)?;
    tx.commit().map_err(to_err)?;
    Ok(Some(merged))
}

/// Re-read the stored indexed columns for a session, so an update that does
/// not supply a fresh summary preserves them exactly.
fn summary_from_row(connection: &Connection, id: &str) -> Result<SessionSummary, String> {
    connection
        .query_row(
            "SELECT id, timestamp, task, goal, actual_seconds, focused_seconds,
                    measured_seconds, distraction_events, goal_outcome, workspace_id,
                    workspace_revision, workspace_name, energy_level, completed,
                    measured, tags_json, search_text
             FROM sessions WHERE id = ?1",
            params![id],
            |row| {
                let tags_json: String = row.get("tags_json")?;
                Ok(SessionSummary {
                    id: row.get("id")?,
                    timestamp: row.get("timestamp")?,
                    task: row.get("task")?,
                    goal: row.get("goal")?,
                    actual_seconds: row.get("actual_seconds")?,
                    focused_seconds: row.get("focused_seconds")?,
                    measured_seconds: row.get("measured_seconds")?,
                    distraction_events: row.get("distraction_events")?,
                    goal_outcome: row.get("goal_outcome")?,
                    workspace_id: row.get("workspace_id")?,
                    workspace_revision: row.get("workspace_revision")?,
                    workspace_name: row.get("workspace_name")?,
                    energy_level: row.get("energy_level")?,
                    completed: row.get::<_, i64>("completed")? != 0,
                    measured: row.get::<_, i64>("measured")? != 0,
                    tags: serde_json::from_str(&tags_json).unwrap_or_default(),
                    search_text: row.get("search_text")?,
                })
            },
        )
        .map_err(to_err)
}

pub fn delete_session(connection: &mut Connection, id: &str) -> Result<(), String> {
    let tx = connection.transaction().map_err(to_err)?;
    tx.execute("DELETE FROM sessions WHERE id = ?1", params![id])
        .map_err(to_err)?;
    drop_ledger_contribution(&tx, id)?;
    tx.commit().map_err(to_err)?;
    Ok(())
}

pub fn clear_all(connection: &mut Connection) -> Result<(), String> {
    let tx = connection.transaction().map_err(to_err)?;
    tx.execute("DELETE FROM sessions", []).map_err(to_err)?;
    tx.execute("DELETE FROM focus_ledger_days", [])
        .map_err(to_err)?;
    // Clearing native history permanently ends the legacy import window. This
    // must commit with the rows, because localStorage cleanup is best-effort
    // and may be unavailable or may fail after this transaction succeeds.
    meta_set(&tx, LEGACY_DELETION_TOMBSTONE_KEY, MIGRATION_DONE)?;
    meta_set(&tx, MIGRATION_STATUS_KEY, MIGRATION_DONE)?;
    meta_set(&tx, LEGACY_CLEANUP_PENDING_KEY, CLEANUP_PENDING)?;
    tx.commit().map_err(to_err)?;
    Ok(())
}

pub fn legacy_cleanup_pending(connection: &Connection) -> Result<bool, String> {
    Ok(
        meta_get(connection, LEGACY_CLEANUP_PENDING_KEY)?.as_deref()
            == Some(CLEANUP_PENDING),
    )
}

pub fn acknowledge_legacy_cleanup(connection: &mut Connection) -> Result<(), String> {
    let tx = connection.transaction().map_err(to_err)?;
    tx.execute(
        "DELETE FROM schema_meta WHERE key = ?1",
        params![LEGACY_CLEANUP_PENDING_KEY],
    )
    .map_err(to_err)?;
    tx.commit().map_err(to_err)?;
    Ok(())
}

/// Replace the whole focus ledger in one transaction.
///
/// Used when a scoring rule changes and every stored session has to be
/// re-derived: a partial rewrite would leave the ledger disagreeing with the
/// records it was built from, so it lands whole or not at all.
pub fn replace_focus_ledger(connection: &mut Connection, ledger: &Value) -> Result<(), String> {
    let tx = connection.transaction().map_err(to_err)?;
    tx.execute("DELETE FROM focus_ledger_days", []).map_err(to_err)?;
    if let Some(days) = ledger.get("days").and_then(Value::as_object) {
        for (day_key, entry) in days {
            write_ledger_day(&tx, day_key, entry)?;
        }
    }
    tx.commit().map_err(to_err)?;
    Ok(())
}

/// Apply every changed focus derivation and replace the ledger atomically.
///
/// Re-derivation used to make one IPC call and one transaction per session,
/// followed by a separate ledger transaction. A single malformed historical
/// row could therefore leave some records updated while the old ledger stayed
/// in place until another launch. This boundary makes that impossible and
/// reduces a large history to one IPC round trip.
pub fn apply_focus_backfill(
    connection: &mut Connection,
    updates: &[FocusBackfillUpdate],
    ledger: &Value,
) -> Result<(), String> {
    let tx = connection.transaction().map_err(to_err)?;

    for update in updates {
        if update.summary.id != update.id {
            return Err(format!(
                "focus backfill id mismatch: {} != {}",
                update.id, update.summary.id
            ));
        }
        let Some(mut merged) = get_session(&tx, &update.id)? else {
            return Err(format!("focus backfill session not found: {}", update.id));
        };
        let Some(target) = merged.as_object_mut() else {
            return Err(format!(
                "focus backfill session is not an object: {}",
                update.id
            ));
        };
        let Some(patch) = update.patch.as_object() else {
            return Err(format!(
                "focus backfill patch is not an object: {}",
                update.id
            ));
        };
        for (key, value) in patch {
            target.insert(key.clone(), value.clone());
        }
        write_session(&tx, &merged, &update.summary, update.analysis.as_ref())?;
    }

    tx.execute("DELETE FROM focus_ledger_days", [])
        .map_err(to_err)?;
    if let Some(days) = ledger.get("days").and_then(Value::as_object) {
        for (day_key, entry) in days {
            write_ledger_day(&tx, day_key, entry)?;
        }
    }
    tx.commit().map_err(to_err)?;
    Ok(())
}

pub fn export_archive(connection: &Connection) -> Result<Value, String> {
    Ok(json!({
        "schemaVersion": SCHEMA_VERSION,
        "sessions": load_all(connection)?,
        "focusLedger": load_ledger(connection)?,
    }))
}

/// Merge a validated archive into the native database without replacing any
/// existing session. The caller supplies a ledger rebuilt from the union of
/// existing and imported records, so sessions and their score contributions
/// land in one transaction.
pub fn restore_archive(
    connection: &mut Connection,
    items: &[ArchiveRestoreItem],
    ledger: &Value,
) -> Result<RestoreOutcome, String> {
    let days = ledger
        .get("days")
        .and_then(Value::as_object)
        .ok_or_else(|| "backup focus ledger is invalid".to_string())?;

    let mut archive_ids = HashSet::new();
    for item in items {
        let record_id = item
            .session
            .get("id")
            .and_then(Value::as_str)
            .unwrap_or_default();
        if record_id.is_empty() || item.summary.id.is_empty() {
            return Err("backup contains a session without an id".into());
        }
        if record_id != item.summary.id {
            return Err(format!(
                "backup session id mismatch: {record_id} != {}",
                item.summary.id
            ));
        }
        if !archive_ids.insert(record_id.to_string()) {
            return Err(format!("backup contains duplicate session id: {record_id}"));
        }
    }

    let tx = connection.transaction().map_err(to_err)?;
    let mut imported = 0_i64;
    let mut skipped = 0_i64;
    for item in items {
        let exists = tx
            .query_row(
                "SELECT 1 FROM sessions WHERE id = ?1",
                params![item.summary.id],
                |_| Ok(true),
            )
            .optional()
            .map_err(to_err)?
            .unwrap_or(false);
        if exists {
            skipped += 1;
            continue;
        }
        write_session(
            &tx,
            &item.session,
            &item.summary,
            item.analysis.as_ref(),
        )?;
        imported += 1;
    }

    tx.execute("DELETE FROM focus_ledger_days", [])
        .map_err(to_err)?;
    for (day_key, entry) in days {
        write_ledger_day(&tx, day_key, entry)?;
    }

    for item in items {
        let present = tx
            .query_row(
                "SELECT 1 FROM sessions WHERE id = ?1",
                params![item.summary.id],
                |_| Ok(true),
            )
            .optional()
            .map_err(to_err)?
            .unwrap_or(false);
        if !present {
            tx.rollback().map_err(to_err)?;
            return Ok(RestoreOutcome {
                imported_count: 0,
                skipped_duplicate_count: 0,
                verified: false,
            });
        }
    }

    tx.commit().map_err(to_err)?;
    Ok(RestoreOutcome {
        imported_count: imported,
        skipped_duplicate_count: skipped,
        verified: true,
    })
}

// ── Legacy migration ────────────────────────────────────────────────────────

/// Import the localStorage archive once, then never again.
///
/// Safety properties this must hold, because it runs against the only copy of
/// someone's history:
///   * idempotent — a second call after success is a no-op
///   * deduplicating — re-running after a crash cannot double-insert
///   * verified — success is recorded only after every id is confirmed present
///   * non-destructive — the caller keeps the localStorage copy either way
///
/// An interrupted run leaves the status unset, so the next launch retries.
pub fn migrate_legacy(
    connection: &mut Connection,
    sessions: &[Value],
    summaries: &[SessionSummary],
    ledger: &Value,
) -> Result<MigrationOutcome, String> {
    if meta_get(connection, MIGRATION_STATUS_KEY)?.as_deref() == Some(MIGRATION_DONE)
        || meta_get(connection, LEGACY_DELETION_TOMBSTONE_KEY)?.as_deref() == Some(MIGRATION_DONE)
    {
        return Ok(MigrationOutcome {
            migrated: false,
            imported_count: 0,
            skipped_duplicate_count: 0,
            verified: true,
            reason: Some("already_migrated".into()),
        });
    }

    if sessions.len() != summaries.len() {
        return Err("session and summary counts differ".into());
    }

    let before: i64 = connection
        .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
        .map_err(to_err)?;

    let tx = connection.transaction().map_err(to_err)?;
    let mut skipped = 0_i64;
    for (session, summary) in sessions.iter().zip(summaries.iter()) {
        if summary.id.is_empty() {
            skipped += 1;
            continue;
        }
        let exists: bool = tx
            .query_row(
                "SELECT 1 FROM sessions WHERE id = ?1",
                params![summary.id],
                |_| Ok(true),
            )
            .optional()
            .map_err(to_err)?
            .unwrap_or(false);
        if exists {
            skipped += 1;
            continue;
        }
        // Legacy fields are preserved untouched: the record goes in as it was
        // written, whatever shape that build used.
        write_session(&tx, session, summary, None)?;
    }

    if let Some(days) = ledger.get("days").and_then(Value::as_object) {
        for (day_key, entry) in days {
            write_ledger_day(&tx, day_key, entry)?;
        }
    }

    // Verify inside the transaction: if a single expected id is missing, roll
    // the whole thing back rather than record a success that isn't one.
    let mut missing = 0_i64;
    for summary in summaries {
        if summary.id.is_empty() {
            continue;
        }
        let present: bool = tx
            .query_row(
                "SELECT 1 FROM sessions WHERE id = ?1",
                params![summary.id],
                |_| Ok(true),
            )
            .optional()
            .map_err(to_err)?
            .unwrap_or(false);
        if !present {
            missing += 1;
        }
    }
    if missing > 0 {
        tx.rollback().map_err(to_err)?;
        return Ok(MigrationOutcome {
            migrated: false,
            imported_count: 0,
            skipped_duplicate_count: 0,
            verified: false,
            reason: Some(format!("{missing} sessions failed verification")),
        });
    }

    let after: i64 = tx
        .query_row("SELECT COUNT(*) FROM sessions", [], |row| row.get(0))
        .map_err(to_err)?;
    let imported = after - before;

    meta_set(&tx, MIGRATION_STATUS_KEY, MIGRATION_DONE)?;
    meta_set(
        &tx,
        MIGRATION_COUNTS_KEY,
        &json!({ "imported": imported, "skipped": skipped }).to_string(),
    )?;
    tx.commit().map_err(to_err)?;

    Ok(MigrationOutcome {
        migrated: true,
        imported_count: imported,
        skipped_duplicate_count: skipped,
        verified: true,
        reason: None,
    })
}

// ── Tauri commands ──────────────────────────────────────────────────────────

fn with_connection<T>(
    state: &tauri::State<'_, DbState>,
    action: impl FnOnce(&mut Connection) -> Result<T, String>,
) -> Result<T, String> {
    let mut guard = state.0.lock().map_err(|_| "database lock poisoned".to_string())?;
    action(&mut guard)
}

#[tauri::command]
pub fn db_load_all(state: tauri::State<'_, DbState>) -> Result<Vec<Value>, String> {
    with_connection(&state, |connection| load_all(connection))
}

#[tauri::command]
pub fn db_list_session_summaries(
    state: tauri::State<'_, DbState>,
    query: SummaryQuery,
) -> Result<SummaryPage, String> {
    with_connection(&state, |connection| list_summaries(connection, &query))
}

#[tauri::command]
pub fn db_get_session(
    state: tauri::State<'_, DbState>,
    id: String,
) -> Result<Option<Value>, String> {
    with_connection(&state, |connection| get_session(connection, &id))
}

#[tauri::command]
pub fn db_save_session(
    state: tauri::State<'_, DbState>,
    session: Value,
    summary: SessionSummary,
    analysis: Option<Value>,
    ledger_day_key: Option<String>,
    ledger_day_entry: Option<Value>,
) -> Result<Value, String> {
    with_connection(&state, |connection| {
        let ledger = match (ledger_day_key.as_deref(), ledger_day_entry.as_ref()) {
            (Some(key), Some(entry)) => Some((key, entry)),
            _ => None,
        };
        save_session(connection, &session, &summary, analysis.as_ref(), ledger)
    })
}

#[tauri::command]
pub fn db_update_session(
    state: tauri::State<'_, DbState>,
    id: String,
    patch: Value,
    summary: Option<SessionSummary>,
    analysis: Option<Value>,
) -> Result<Option<Value>, String> {
    with_connection(&state, |connection| {
        update_session(connection, &id, &patch, summary.as_ref(), analysis.as_ref())
    })
}

#[tauri::command]
pub fn db_delete_session(state: tauri::State<'_, DbState>, id: String) -> Result<(), String> {
    with_connection(&state, |connection| delete_session(connection, &id))
}

#[tauri::command]
pub fn db_clear_all(state: tauri::State<'_, DbState>) -> Result<(), String> {
    with_connection(&state, clear_all)
}

#[tauri::command]
pub fn db_is_legacy_cleanup_pending(state: tauri::State<'_, DbState>) -> Result<bool, String> {
    with_connection(&state, |connection| legacy_cleanup_pending(connection))
}

#[tauri::command]
pub fn db_acknowledge_legacy_cleanup(state: tauri::State<'_, DbState>) -> Result<(), String> {
    with_connection(&state, acknowledge_legacy_cleanup)
}

#[tauri::command]
pub fn db_load_focus_ledger(state: tauri::State<'_, DbState>) -> Result<Value, String> {
    with_connection(&state, |connection| load_ledger(connection))
}

#[tauri::command]
pub fn db_replace_focus_ledger(
    state: tauri::State<'_, DbState>,
    ledger: Value,
) -> Result<(), String> {
    with_connection(&state, |connection| replace_focus_ledger(connection, &ledger))
}

#[tauri::command]
pub fn db_apply_focus_backfill(
    state: tauri::State<'_, DbState>,
    updates: Vec<FocusBackfillUpdate>,
    ledger: Value,
) -> Result<(), String> {
    with_connection(&state, |connection| {
        apply_focus_backfill(connection, &updates, &ledger)
    })
}

#[tauri::command]
pub fn db_export_archive(state: tauri::State<'_, DbState>) -> Result<Value, String> {
    with_connection(&state, |connection| export_archive(connection))
}

#[tauri::command]
pub fn db_restore_archive(
    state: tauri::State<'_, DbState>,
    items: Vec<ArchiveRestoreItem>,
    ledger: Value,
) -> Result<RestoreOutcome, String> {
    with_connection(&state, |connection| restore_archive(connection, &items, &ledger))
}

#[tauri::command]
pub fn db_migrate_legacy(
    state: tauri::State<'_, DbState>,
    sessions: Vec<Value>,
    summaries: Vec<SessionSummary>,
    ledger: Value,
) -> Result<MigrationOutcome, String> {
    with_connection(&state, |connection| {
        migrate_legacy(connection, &sessions, &summaries, &ledger)
    })
}

#[cfg(test)]
#[path = "db_tests.rs"]
mod tests;
