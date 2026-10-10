//! Which beta backend this build talks to. Both values per backend are public
//! by design (Supabase project URL + publishable key); access is enforced by
//! RLS and the database functions, never by keeping these secret.
//!
//! The build channel decides (build.rs sets `eudaimonai_release_build` when
//! EUDONOMIA_BUILD_CHANNEL=release):
//! - signed production releases → eudaimonai-production, where real beta
//!   users have their accounts;
//! - local and internal-test builds → eudaimonai-staging.
//!
//! A release build refuses to compile while the production values are empty
//! or still name staging.

mod staging {
    pub const SUPABASE_URL: &str = "https://zlsxzgzfwqqjmwtxmxnj.supabase.co";
    pub const SUPABASE_PUBLISHABLE_KEY: &str = "sb_publishable_vewGlWpyphsmObhgvsbZMA_79SiDHkZ";
    pub const ENVIRONMENT: &str = "staging";
}

#[cfg_attr(not(eudaimonai_release_build), allow(dead_code))]
mod production {
    pub const SUPABASE_URL: &str = "https://qlrjildmzcocmjqatipj.supabase.co";
    pub const SUPABASE_PUBLISHABLE_KEY: &str = "sb_publishable_6E_RT6c16zgo9R4J_JFXsQ_i2aPdrNE";
    pub const ENVIRONMENT: &str = "production";
}

#[cfg(eudaimonai_release_build)]
pub use production::{ENVIRONMENT, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL};
#[cfg(not(eudaimonai_release_build))]
pub use staging::{ENVIRONMENT, SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL};

#[cfg_attr(not(eudaimonai_release_build), allow(dead_code))]
const fn same(a: &str, b: &str) -> bool {
    let (a, b) = (a.as_bytes(), b.as_bytes());
    if a.len() != b.len() {
        return false;
    }
    let mut i = 0;
    while i < a.len() {
        if a[i] != b[i] {
            return false;
        }
        i += 1;
    }
    true
}

#[cfg(eudaimonai_release_build)]
const _: () = assert!(
    !production::SUPABASE_URL.is_empty()
        && !production::SUPABASE_PUBLISHABLE_KEY.is_empty()
        && !same(production::SUPABASE_URL, staging::SUPABASE_URL)
        && !same(production::SUPABASE_PUBLISHABLE_KEY, staging::SUPABASE_PUBLISHABLE_KEY),
    "A release build needs the eudaimonai-production URL and publishable key in access/config.rs (and they must not be staging's)."
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

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(not(eudaimonai_release_build))]
    #[test]
    fn local_and_test_builds_talk_to_staging() {
        assert_eq!(ENVIRONMENT, "staging");
        assert_eq!(SUPABASE_URL, staging::SUPABASE_URL);
        assert!(SUPABASE_PUBLISHABLE_KEY.starts_with("sb_publishable_"));
    }

    #[cfg(eudaimonai_release_build)]
    #[test]
    fn release_builds_talk_to_production() {
        assert_eq!(ENVIRONMENT, "production");
        assert_eq!(SUPABASE_URL, production::SUPABASE_URL);
        assert_ne!(SUPABASE_URL, staging::SUPABASE_URL);
        assert!(SUPABASE_PUBLISHABLE_KEY.starts_with("sb_publishable_"));
    }

    #[test]
    fn both_backends_are_filled_in_and_distinct() {
        assert!(production::SUPABASE_URL.starts_with("https://") && production::SUPABASE_URL.ends_with(".supabase.co"));
        assert!(production::SUPABASE_PUBLISHABLE_KEY.starts_with("sb_publishable_"));
        assert!(!same(production::SUPABASE_URL, staging::SUPABASE_URL));
        assert!(!same(production::SUPABASE_PUBLISHABLE_KEY, staging::SUPABASE_PUBLISHABLE_KEY));
    }

    #[test]
    fn the_release_guard_compares_whole_values() {
        assert!(same("abc", "abc"));
        assert!(!same("abc", "abd"));
        assert!(!same("abc", "abcd"));
    }
}
