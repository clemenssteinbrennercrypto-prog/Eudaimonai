//! Which beta backend this build talks to. Both values are public by design
//! (Supabase project URL + publishable key); access is enforced by RLS and
//! the database functions, never by keeping these secret.
//!
//! STAGING ONLY. A real external beta or production release must point at
//! eudaimonai-production, so a release-channel build refuses to compile
//! while this file still names staging (see build.rs).

pub const SUPABASE_URL: &str = "https://zlsxzgzfwqqjmwtxmxnj.supabase.co";
pub const SUPABASE_PUBLISHABLE_KEY: &str = "sb_publishable_vewGlWpyphsmObhgvsbZMA_79SiDHkZ";
pub const ENVIRONMENT: &str = "staging";

#[cfg(eudaimonai_release_build)]
compile_error!(
    "This release build would point the beta at eudaimonai-staging. \
     Point access/config.rs at eudaimonai-production before building a release."
);

/// How long a previously server-verified access keeps working without a
/// connection. Never beyond the entitlement's own end.
pub const OFFLINE_GRACE_MS: i64 = 72 * 60 * 60 * 1000;
/// A verification younger than this counts as current rather than grace.
pub const FRESH_MS: i64 = 15 * 60 * 1000;
/// Slack for ordinary clock adjustments (NTP) before a backwards jump counts
/// as a rollback.
pub const ROLLBACK_TOLERANCE_MS: i64 = 5 * 60 * 1000;
/// Background re-check while the app runs.
pub const RECHECK_INTERVAL_MS: i64 = 60 * 60 * 1000;
pub const REQUEST_TIMEOUT_SECS: u64 = 10;
