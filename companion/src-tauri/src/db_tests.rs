use super::*;

fn db() -> Connection {
    let connection = Connection::open_in_memory().expect("in-memory database");
    prepare(&connection).expect("schema");
    connection
}
fn summary(id: &str, timestamp: i64) -> SessionSummary {
    SessionSummary {
        id: id.into(),
        timestamp,
        task: "Thesis".into(),
        goal: "Draft intro".into(),
        actual_seconds: 1800,
        focused_seconds: Some(1500),
        measured_seconds: Some(1800),
        distraction_events: 2,
        goal_outcome: Some("yes".into()),
        workspace_id: Some("ws1".into()),
        workspace_revision: Some(0),
        workspace_name: Some("Office".into()),
        energy_level: Some("medium".into()),
        completed: true,
        measured: true,
        tags: vec!["writing".into()],
        search_text: "thesis writing".into(),
    }
}

fn session_value(id: &str) -> Value {
    json!({
        "id": id,
        "task": "Thesis",
        "actualSeconds": 1800,
        "timeline": [{ "second": 0, "score": 80 }, { "second": 1, "score": 82 }],
    })
}

#[test]
fn saves_and_reads_back_a_complete_record() {
    let mut connection = db();
    save_session(
        &mut connection,
        &session_value("a"),
        &summary("a", 100),
        None,
        None,
    )
    .unwrap();

    let fetched = get_session(&connection, "a").unwrap().expect("session");
    assert_eq!(fetched["task"], "Thesis");
    // The timeline is split out for storage but must come back intact.
    assert_eq!(fetched["timeline"].as_array().unwrap().len(), 2);
}

#[test]
fn summaries_omit_the_timeline_but_full_reads_include_it() {
    let mut connection = db();
    save_session(&mut connection, &session_value("a"), &summary("a", 100), None, None).unwrap();

    let page = list_summaries(&connection, &SummaryQuery::default()).unwrap();
    assert_eq!(page.rows.len(), 1);
    assert!(page.rows[0].get("timeline").is_none());
    assert!(get_session(&connection, "a").unwrap().unwrap()["timeline"].is_array());
}

#[test]
fn returns_none_for_an_unknown_id() {
    let connection = db();
    assert!(get_session(&connection, "missing").unwrap().is_none());
}

#[test]
fn orders_newest_first() {
    let mut connection = db();
    for (id, ts) in [("old", 100), ("new", 300), ("mid", 200)] {
        save_session(&mut connection, &session_value(id), &summary(id, ts), None, None).unwrap();
    }
    let all = load_all(&connection).unwrap();
    let ids: Vec<&str> = all.iter().map(|s| s["id"].as_str().unwrap()).collect();
    assert_eq!(ids, vec!["new", "mid", "old"]);
}

#[test]
fn paginates_with_a_stable_total() {
    let mut connection = db();
    for index in 0..25 {
        let id = format!("s{index}");
        save_session(
            &mut connection,
            &session_value(&id),
            &summary(&id, index as i64),
            None,
            None,
        )
        .unwrap();
    }

    let first = list_summaries(
        &connection,
        &SummaryQuery { page: Some(0), page_size: Some(10), ..Default::default() },
    )
    .unwrap();
    assert_eq!(first.rows.len(), 10);
    assert_eq!(first.total, 25);
    assert_eq!(first.page_count, 3);

    let last = list_summaries(
        &connection,
        &SummaryQuery { page: Some(2), page_size: Some(10), ..Default::default() },
    )
    .unwrap();
    assert_eq!(last.rows.len(), 5);
    assert_eq!(last.total, 25);
}

#[test]
fn a_page_past_the_end_is_empty_rather_than_an_error() {
    let mut connection = db();
    save_session(&mut connection, &session_value("a"), &summary("a", 1), None, None).unwrap();
    let page = list_summaries(
        &connection,
        &SummaryQuery { page: Some(99), page_size: Some(10), ..Default::default() },
    )
    .unwrap();
    assert!(page.rows.is_empty());
    assert_eq!(page.total, 1);
}

#[test]
fn filters_by_outcome_including_the_unrated_bucket() {
    let mut connection = db();
    let mut rated = summary("rated", 1);
    rated.goal_outcome = Some("yes".into());
    let mut unrated = summary("unrated", 2);
    unrated.goal_outcome = None;
    save_session(&mut connection, &session_value("rated"), &rated, None, None).unwrap();
    save_session(&mut connection, &session_value("unrated"), &unrated, None, None).unwrap();

    let yes = list_summaries(
        &connection,
        &SummaryQuery { outcome: Some("yes".into()), ..Default::default() },
    )
    .unwrap();
    assert_eq!(yes.total, 1);

    let none = list_summaries(
        &connection,
        &SummaryQuery { outcome: Some("unrated".into()), ..Default::default() },
    )
    .unwrap();
    assert_eq!(none.total, 1);
    assert_eq!(none.rows[0]["id"], "unrated");
}

#[test]
fn filters_by_measurement_status_and_search_text() {
    let mut connection = db();
    let mut measured = summary("measured", 1);
    measured.search_text = "thesis writing".into();
    let mut unmeasured = summary("unmeasured", 2);
    unmeasured.measured = false;
    unmeasured.search_text = "review pr".into();
    save_session(&mut connection, &session_value("measured"), &measured, None, None).unwrap();
    save_session(&mut connection, &session_value("unmeasured"), &unmeasured, None, None).unwrap();

    let only_measured = list_summaries(
        &connection,
        &SummaryQuery { measurement: Some("measured".into()), ..Default::default() },
    )
    .unwrap();
    assert_eq!(only_measured.total, 1);
    assert_eq!(only_measured.rows[0]["id"], "measured");

    // Search is case-insensitive, matching the JS filter.
    let searched = list_summaries(
        &connection,
        &SummaryQuery { search: Some("THESIS".into()), ..Default::default() },
    )
    .unwrap();
    assert_eq!(searched.total, 1);
}

#[test]
fn search_treats_like_wildcards_as_literal_characters() {
    let mut connection = db();
    let mut percent = summary("percent", 1);
    percent.search_text = "hit 50% target".into();
    let mut other = summary("other", 2);
    other.search_text = "hit 50 targets".into();
    save_session(&mut connection, &session_value("percent"), &percent, None, None).unwrap();
    save_session(&mut connection, &session_value("other"), &other, None, None).unwrap();

    // Unescaped, "50%" would match both rows because % is LIKE's wildcard.
    let page = list_summaries(
        &connection,
        &SummaryQuery { search: Some("50%".into()), ..Default::default() },
    )
    .unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.rows[0]["id"], "percent");

    // The single-character wildcard needs the same treatment.
    let mut underscore = summary("underscore", 3);
    underscore.search_text = "deep_work".into();
    save_session(&mut connection, &session_value("underscore"), &underscore, None, None)
        .unwrap();
    let page = list_summaries(
        &connection,
        &SummaryQuery { search: Some("deep_".into()), ..Default::default() },
    )
    .unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.rows[0]["id"], "underscore");
}

#[test]
fn combines_filters_conjunctively() {
    let mut connection = db();
    let mut hit = summary("hit", 500);
    hit.search_text = "thesis".into();
    let mut wrong_outcome = summary("wrong", 500);
    wrong_outcome.goal_outcome = Some("no".into());
    wrong_outcome.search_text = "thesis".into();
    save_session(&mut connection, &session_value("hit"), &hit, None, None).unwrap();
    save_session(&mut connection, &session_value("wrong"), &wrong_outcome, None, None).unwrap();

    let page = list_summaries(
        &connection,
        &SummaryQuery {
            date_from: Some(400),
            outcome: Some("yes".into()),
            search: Some("thesis".into()),
            ..Default::default()
        },
    )
    .unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.rows[0]["id"], "hit");
}

#[test]
fn updates_merge_into_the_stored_record() {
    let mut connection = db();
    save_session(&mut connection, &session_value("a"), &summary("a", 1), None, None).unwrap();

    let updated = update_session(
        &mut connection,
        "a",
        &json!({ "goalOutcome": "partly", "blockerText": "meetings" }),
        None,
        None,
    )
    .unwrap()
    .expect("updated");

    assert_eq!(updated["goalOutcome"], "partly");
    assert_eq!(updated["blockerText"], "meetings");
    // Untouched fields survive, and so does the timeline.
    assert_eq!(updated["task"], "Thesis");
    assert_eq!(updated["timeline"].as_array().unwrap().len(), 2);
}

#[test]
fn updating_an_unknown_session_reports_none_rather_than_creating_one() {
    let mut connection = db();
    assert!(update_session(&mut connection, "ghost", &json!({}), None, None)
        .unwrap()
        .is_none());
    assert_eq!(load_all(&connection).unwrap().len(), 0);
}

#[test]
fn deletes_one_session_and_its_ledger_contribution_together() {
    let mut connection = db();
    let day = json!({ "sessions": { "a": { "version": 1, "measuredSeconds": 1800 } } });
    save_session(
        &mut connection,
        &session_value("a"),
        &summary("a", 1),
        None,
        Some(("2026-08-15", &day)),
    )
    .unwrap();
    assert_eq!(
        load_ledger(&connection).unwrap()["days"]["2026-08-15"]["sessions"]["a"]["version"],
        1
    );

    delete_session(&mut connection, "a").unwrap();
    assert!(get_session(&connection, "a").unwrap().is_none());
    // The day held only this session, so it goes with it.
    assert!(load_ledger(&connection).unwrap()["days"]
        .as_object()
        .unwrap()
        .is_empty());
}

#[test]
fn deleting_one_session_keeps_the_others_in_its_ledger_day() {
    let mut connection = db();
    let day = json!({ "sessions": { "a": { "version": 1 }, "b": { "version": 1 } } });
    save_session(
        &mut connection,
        &session_value("a"),
        &summary("a", 1),
        None,
        Some(("2026-08-15", &day)),
    )
    .unwrap();

    delete_session(&mut connection, "a").unwrap();
    let ledger = load_ledger(&connection).unwrap();
    assert!(ledger["days"]["2026-08-15"]["sessions"]["a"].is_null());
    assert_eq!(ledger["days"]["2026-08-15"]["sessions"]["b"]["version"], 1);
}

#[test]
fn clear_all_empties_sessions_and_ledger_together() {
    let mut connection = db();
    let day = json!({ "sessions": { "a": { "version": 1 } } });
    connection
        .execute(
            "INSERT INTO schema_meta (key, value) VALUES (?1, ?2)",
            params![MIGRATION_STATUS_KEY, MIGRATION_DONE],
        )
        .unwrap();
    save_session(
        &mut connection,
        &session_value("a"),
        &summary("a", 1),
        None,
        Some(("2026-08-15", &day)),
    )
    .unwrap();

    clear_all(&mut connection).unwrap();
    assert_eq!(load_all(&connection).unwrap().len(), 0);
    assert!(load_ledger(&connection).unwrap()["days"]
        .as_object()
        .unwrap()
        .is_empty());
    // Deleting history must not erase migration state: a stale legacy
    // copy must never be imported again after the native store is clear.
    assert_eq!(meta_get(&connection, MIGRATION_STATUS_KEY).unwrap().as_deref(), Some(MIGRATION_DONE));
    assert_eq!(
        meta_get(&connection, LEGACY_DELETION_TOMBSTONE_KEY)
            .unwrap()
            .as_deref(),
        Some(MIGRATION_DONE)
    );
    assert!(legacy_cleanup_pending(&connection).unwrap());

    acknowledge_legacy_cleanup(&mut connection).unwrap();
    assert!(!legacy_cleanup_pending(&connection).unwrap());
}

#[test]
fn clear_all_turns_an_old_or_failed_migration_into_a_durable_tombstone() {
    let mut connection = db();
    connection
        .execute(
            "INSERT INTO schema_meta (key, value) VALUES (?1, ?2)",
            params![MIGRATION_STATUS_KEY, "failed"],
        )
        .unwrap();

    clear_all(&mut connection).unwrap();

    // A later launch must refuse stale localStorage even though the prior
    // migration did not complete and the JS retry marker may be missing.
    assert_eq!(
        meta_get(&connection, MIGRATION_STATUS_KEY)
            .unwrap()
            .as_deref(),
        Some(MIGRATION_DONE)
    );
    assert_eq!(
        meta_get(&connection, LEGACY_DELETION_TOMBSTONE_KEY)
            .unwrap()
            .as_deref(),
        Some(MIGRATION_DONE)
    );
    assert!(legacy_cleanup_pending(&connection).unwrap());
    let outcome = migrate_legacy(
        &mut connection,
        &[session_value("stale")],
        &[summary("stale", 1)],
        &json!({ "days": {} }),
    )
    .unwrap();
    assert!(!outcome.migrated);
    assert!(outcome.verified);
    assert_eq!(outcome.reason.as_deref(), Some("already_migrated"));
    assert!(load_all(&connection).unwrap().is_empty());
}

#[test]
fn a_failed_write_inside_a_transaction_leaves_nothing_behind() {
    let mut connection = db();
    save_session(&mut connection, &session_value("keep"), &summary("keep", 1), None, None)
        .unwrap();

    // Force a mid-transaction failure and confirm the partial work is gone.
    {
        let tx = connection.transaction().unwrap();
        write_session(&tx, &session_value("rolled"), &summary("rolled", 2), None).unwrap();
        tx.rollback().unwrap();
    }

    let ids: Vec<String> = load_all(&connection)
        .unwrap()
        .iter()
        .map(|s| s["id"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(ids, vec!["keep".to_string()]);
}

#[test]
fn export_carries_every_record_with_its_timeline_and_the_ledger() {
    let mut connection = db();
    let day = json!({ "sessions": { "a": { "version": 1 } } });
    save_session(
        &mut connection,
        &session_value("a"),
        &summary("a", 1),
        None,
        Some(("2026-08-15", &day)),
    )
    .unwrap();

    let archive = export_archive(&connection).unwrap();
    assert_eq!(archive["schemaVersion"], SCHEMA_VERSION);
    assert_eq!(archive["sessions"].as_array().unwrap().len(), 1);
    assert_eq!(archive["sessions"][0]["timeline"].as_array().unwrap().len(), 2);
    assert_eq!(archive["focusLedger"]["days"]["2026-08-15"]["sessions"]["a"]["version"], 1);
}

#[test]
fn restore_merges_without_overwriting_and_replaces_the_ledger_atomically() {
    let mut connection = db();
    save_session(
        &mut connection,
        &session_value("existing"),
        &summary("existing", 1),
        None,
        None,
    )
    .unwrap();

    let items = vec![
        ArchiveRestoreItem {
            session: session_value("existing"),
            summary: summary("existing", 1),
            analysis: None,
        },
        ArchiveRestoreItem {
            session: session_value("restored"),
            summary: summary("restored", 2),
            analysis: Some(json!({ "version": 1, "status": "ready" })),
        },
    ];
    let ledger = json!({
        "schemaVersion": 1,
        "days": {
            "2026-08-15": {
                "sessions": {
                    "existing": { "version": 1 },
                    "restored": { "version": 1 }
                }
            }
        }
    });

    let outcome = restore_archive(&mut connection, &items, &ledger).unwrap();
    assert!(outcome.verified);
    assert_eq!(outcome.imported_count, 1);
    assert_eq!(outcome.skipped_duplicate_count, 1);
    assert_eq!(load_all(&connection).unwrap().len(), 2);
    assert_eq!(
        get_session(&connection, "restored").unwrap().unwrap()["analysisSnapshot"]["status"],
        "ready"
    );
    assert_eq!(
        load_ledger(&connection).unwrap()["days"]["2026-08-15"]["sessions"]
            .as_object()
            .unwrap()
            .len(),
        2
    );
}

#[test]
fn restore_rejects_invalid_input_before_writing_anything() {
    let mut connection = db();
    let duplicate = ArchiveRestoreItem {
        session: session_value("duplicate"),
        summary: summary("duplicate", 1),
        analysis: None,
    };

    let error = restore_archive(
        &mut connection,
        &[duplicate.clone(), duplicate],
        &json!({ "schemaVersion": 1, "days": {} }),
    )
    .unwrap_err();
    assert!(error.contains("duplicate session id"));
    assert!(load_all(&connection).unwrap().is_empty());

    let error = restore_archive(
        &mut connection,
        &[ArchiveRestoreItem {
            session: session_value("a"),
            summary: summary("a", 1),
            analysis: None,
        }],
        &json!({ "schemaVersion": 1 }),
    )
    .unwrap_err();
    assert!(error.contains("focus ledger"));
    assert!(load_all(&connection).unwrap().is_empty());
}

#[test]
fn replacing_the_ledger_swaps_every_day_at_once() {
    let mut connection = db();
    let first = json!({ "sessions": { "a": { "version": 1 } } });
    save_session(
        &mut connection,
        &session_value("a"),
        &summary("a", 1),
        None,
        Some(("2026-08-15", &first)),
    )
    .unwrap();

    // A re-derivation produces a different ledger; the old days must not
    // survive alongside the new ones.
    let rebuilt = json!({
        "schemaVersion": 1,
        "days": { "2026-08-16": { "sessions": { "b": { "version": 1 } } } }
    });
    replace_focus_ledger(&mut connection, &rebuilt).unwrap();

    let stored = load_ledger(&connection).unwrap();
    assert!(stored["days"]["2026-08-15"].is_null());
    assert_eq!(stored["days"]["2026-08-16"]["sessions"]["b"]["version"], 1);
    // The sessions themselves are untouched by a ledger rebuild.
    assert_eq!(load_all(&connection).unwrap().len(), 1);
}

#[test]
fn focus_backfill_lands_session_derivations_and_ledger_together() {
    let mut connection = db();
    let first = json!({ "sessions": { "a": { "status": "unmeasured" } } });
    save_session(
        &mut connection,
        &session_value("a"),
        &summary("a", 1),
        None,
        Some(("2026-08-15", &first)),
    )
    .unwrap();

    let updates = vec![FocusBackfillUpdate {
        id: "a".into(),
        patch: json!({ "focusMetricRejection": null, "sessionEfficiency": 78 }),
        summary: summary("a", 1),
        analysis: Some(json!({ "version": 1, "status": "ready" })),
    }];
    let rebuilt = json!({
        "schemaVersion": 1,
        "days": { "2026-08-16": { "sessions": { "a": { "version": 1, "measuredSeconds": 1800 } } } }
    });

    apply_focus_backfill(&mut connection, &updates, &rebuilt).unwrap();

    let stored = get_session(&connection, "a").unwrap().unwrap();
    assert_eq!(stored["sessionEfficiency"], 78);
    assert!(stored["focusMetricRejection"].is_null());
    assert_eq!(stored["analysisSnapshot"]["status"], "ready");
    let ledger = load_ledger(&connection).unwrap();
    assert!(ledger["days"]["2026-08-15"].is_null());
    assert_eq!(
        ledger["days"]["2026-08-16"]["sessions"]["a"]["version"],
        1
    );
}

#[test]
fn focus_backfill_rolls_back_everything_when_one_row_is_bad() {
    let mut connection = db();
    let first = json!({ "sessions": { "a": { "status": "unmeasured" } } });
    save_session(
        &mut connection,
        &session_value("a"),
        &summary("a", 1),
        None,
        Some(("2026-08-15", &first)),
    )
    .unwrap();

    let updates = vec![
        FocusBackfillUpdate {
            id: "a".into(),
            patch: json!({ "sessionEfficiency": 78 }),
            summary: summary("a", 1),
            analysis: None,
        },
        FocusBackfillUpdate {
            id: "missing".into(),
            patch: json!({ "sessionEfficiency": 90 }),
            summary: summary("missing", 2),
            analysis: None,
        },
    ];
    let rebuilt = json!({
        "schemaVersion": 1,
        "days": { "2026-08-16": { "sessions": { "a": { "version": 1 } } } }
    });

    assert!(apply_focus_backfill(&mut connection, &updates, &rebuilt).is_err());

    let stored = get_session(&connection, "a").unwrap().unwrap();
    assert!(stored["sessionEfficiency"].is_null());
    let ledger = load_ledger(&connection).unwrap();
    assert_eq!(
        ledger["days"]["2026-08-15"]["sessions"]["a"]["status"],
        "unmeasured"
    );
    assert!(ledger["days"]["2026-08-16"].is_null());
}

#[test]
fn migration_imports_sessions_and_ledger_in_one_pass() {
    let mut connection = db();
    let ledger = json!({ "schemaVersion": 1, "days": { "2026-08-15": { "sessions": { "a": { "version": 1 } } } } });
    let outcome = migrate_legacy(
        &mut connection,
        &[session_value("a"), session_value("b")],
        &[summary("a", 1), summary("b", 2)],
        &ledger,
    )
    .unwrap();

    assert!(outcome.migrated);
    assert!(outcome.verified);
    assert_eq!(outcome.imported_count, 2);
    assert_eq!(load_all(&connection).unwrap().len(), 2);
    assert_eq!(load_ledger(&connection).unwrap()["days"]["2026-08-15"]["sessions"]["a"]["version"], 1);
}

#[test]
fn migration_is_idempotent() {
    let mut connection = db();
    let ledger = json!({ "days": {} });
    migrate_legacy(&mut connection, &[session_value("a")], &[summary("a", 1)], &ledger).unwrap();

    // A second run must not re-import, even given the same input.
    let second = migrate_legacy(
        &mut connection,
        &[session_value("a")],
        &[summary("a", 1)],
        &ledger,
    )
    .unwrap();
    assert!(!second.migrated);
    assert_eq!(second.reason.as_deref(), Some("already_migrated"));
    assert_eq!(load_all(&connection).unwrap().len(), 1);
}

#[test]
fn migration_deduplicates_by_id_after_an_interrupted_run() {
    let mut connection = db();
    // Simulate a crash after one session landed but before status was set.
    save_session(&mut connection, &session_value("a"), &summary("a", 1), None, None).unwrap();

    let outcome = migrate_legacy(
        &mut connection,
        &[session_value("a"), session_value("b")],
        &[summary("a", 1), summary("b", 2)],
        &json!({ "days": {} }),
    )
    .unwrap();

    assert!(outcome.migrated);
    assert_eq!(outcome.imported_count, 1);
    assert_eq!(outcome.skipped_duplicate_count, 1);
    assert_eq!(load_all(&connection).unwrap().len(), 2);
}

// Real records carry fractional seconds from the live accumulator. An
// import that rejects them rejects the user's entire history, which is
// exactly what shipped: "invalid type: floating point 92.59400000000004,
// expected i64".
#[test]
fn accepts_the_fractional_seconds_real_records_carry() {
    let raw = json!({
        "id": "real",
        "timestamp": 1_787_440_169_711_i64,
        "task": "Thesis",
        "goal": "",
        "actualSeconds": 620.0000000001_f64,
        "focusedSeconds": 92.59400000000004_f64,
        "measuredSeconds": 600.5_f64,
        "distractionEvents": 2,
        "goalOutcome": "yes",
        "workspaceId": "ws1",
        "workspaceRevision": 0,
        "completed": true,
        "measured": true,
        "tags": [],
        "searchText": "thesis",
    });
    let parsed: SessionSummary = serde_json::from_value(raw).expect("fractional seconds parse");
    assert_eq!(parsed.focused_seconds, Some(93));
    assert_eq!(parsed.measured_seconds, Some(601));
    assert_eq!(parsed.actual_seconds, 620);

    // And such a record imports rather than failing the whole migration.
    let mut connection = db();
    let outcome = migrate_legacy(
        &mut connection,
        &[session_value("real")],
        &[parsed],
        &json!({ "days": {} }),
    )
    .unwrap();
    assert!(outcome.verified);
    assert_eq!(outcome.imported_count, 1);
}

#[test]
fn a_null_or_unexpected_number_field_degrades_instead_of_failing_the_import() {
    let raw = json!({
        "id": "odd",
        "timestamp": null,
        "actualSeconds": null,
        "focusedSeconds": null,
        "distractionEvents": null,
        "completed": false,
        "measured": false,
        "tags": [],
        "searchText": "",
    });
    let parsed: SessionSummary = serde_json::from_value(raw).expect("null numbers parse");
    assert_eq!(parsed.timestamp, 0);
    assert_eq!(parsed.actual_seconds, 0);
    assert_eq!(parsed.focused_seconds, None);
}

#[test]
fn migration_rejects_mismatched_session_and_summary_counts() {
    let mut connection = db();
    let error = migrate_legacy(
        &mut connection,
        &[session_value("a"), session_value("b")],
        &[summary("a", 1)],
        &json!({ "days": {} }),
    )
    .unwrap_err();
    assert!(error.contains("differ"));
    assert_eq!(load_all(&connection).unwrap().len(), 0);
}

#[test]
fn migration_preserves_unknown_legacy_fields_untouched() {
    let mut connection = db();
    let legacy = json!({
        "id": "legacy",
        "task": "Old",
        "someRetiredField": "keep me",
        "goalAchieved": true,
    });
    let mut legacy_summary = summary("legacy", 1);
    legacy_summary.goal_outcome = Some("yes".into());

    migrate_legacy(&mut connection, &[legacy], &[legacy_summary], &json!({ "days": {} }))
        .unwrap();

    let stored = get_session(&connection, "legacy").unwrap().unwrap();
    assert_eq!(stored["someRetiredField"], "keep me");
    assert_eq!(stored["goalAchieved"], true);
}

#[test]
fn a_malformed_stored_record_yields_an_object_rather_than_a_panic() {
    let mut connection = db();
    save_session(&mut connection, &session_value("a"), &summary("a", 1), None, None).unwrap();
    connection
        .execute("UPDATE sessions SET record_json = 'not json' WHERE id = 'a'", [])
        .unwrap();

    let fetched = get_session(&connection, "a").unwrap().expect("row still returned");
    assert!(fetched.is_object());
}

#[test]
fn an_analysis_snapshot_round_trips_with_its_version() {
    let mut connection = db();
    let analysis = json!({ "version": 1, "status": "ready", "conclusion": { "code": "HIGH_FOCUS_GOAL_MET" } });
    save_session(
        &mut connection,
        &session_value("a"),
        &summary("a", 1),
        Some(&analysis),
        None,
    )
    .unwrap();

    let stored = get_session(&connection, "a").unwrap().unwrap();
    assert_eq!(stored["analysisSnapshot"]["status"], "ready");
    let version: i64 = connection
        .query_row("SELECT analysis_version FROM sessions WHERE id = 'a'", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, 1);
}

#[test]
fn reopening_a_database_preserves_everything() {
    let dir = std::env::temp_dir().join(format!("eudonomia-db-test-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    let path = dir.join("sessions.db");

    {
        let mut connection = open(&path).unwrap();
        save_session(&mut connection, &session_value("a"), &summary("a", 1), None, None)
            .unwrap();
    }
    {
        let connection = open(&path).unwrap();
        assert_eq!(load_all(&connection).unwrap().len(), 1);
        assert_eq!(
            connection
                .query_row("PRAGMA user_version", [], |row| row.get::<_, i64>(0))
                .unwrap(),
            SCHEMA_VERSION
        );
    }

    let _ = std::fs::remove_dir_all(&dir);
}
