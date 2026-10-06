//! The access decision, as a pure function of the last server verification
//! and the Mac's clock. No network, no Keychain: everything here is tested
//! with explicit times.
//!
//! The server is authoritative. The Mac's clock is only used to measure how
//! much time has passed since the server last answered, and a clock that
//! moved backwards is treated as unknown, never as more time left.

use serde::{Deserialize, Serialize};

use super::config::{FRESH_MS, OFFLINE_GRACE_MS, ROLLBACK_TOLERANCE_MS};

/// The last answer from `get_my_access`, with the local time it arrived.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Verification {
    pub server_time_ms: i64,
    pub local_time_ms: i64,
    pub has_access: bool,
    /// None = open-ended (internal).
    pub access_until_ms: Option<i64>,
    pub state: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Source {
    /// Verified with the server within the last few minutes.
    Verified,
    /// Working on an older verification inside the offline grace window.
    OfflineGrace,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Denial {
    /// Never verified with the server (or signed out).
    NotVerified,
    /// The server said this account has no access.
    ServerDenied,
    /// The entitlement's end has passed.
    AccessEnded,
    /// Offline for longer than the grace window.
    GraceExpired,
    /// The Mac's clock is behind a time it already reported.
    ClockRollback,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Decision {
    Allowed { source: Source, until_ms: Option<i64> },
    Denied(Denial),
}

impl Decision {
    pub fn allowed(&self) -> bool {
        matches!(self, Decision::Allowed { .. })
    }
}

/// `high_water_ms` is the latest local time the app has ever seen; a clock
/// that falls behind it (or behind the verification itself) by more than
/// the tolerance has been set back.
pub fn decide(verification: Option<&Verification>, now_local_ms: i64, high_water_ms: i64) -> Decision {
    let Some(v) = verification else {
        return Decision::Denied(Denial::NotVerified);
    };
    if now_local_ms + ROLLBACK_TOLERANCE_MS < v.local_time_ms
        || now_local_ms + ROLLBACK_TOLERANCE_MS < high_water_ms
    {
        return Decision::Denied(Denial::ClockRollback);
    }
    if !v.has_access {
        return Decision::Denied(Denial::ServerDenied);
    }

    let elapsed = (now_local_ms - v.local_time_ms).max(0);
    let estimated_server_now = v.server_time_ms + elapsed;
    if let Some(until) = v.access_until_ms {
        if estimated_server_now >= until {
            return Decision::Denied(Denial::AccessEnded);
        }
    }

    if elapsed <= FRESH_MS {
        return Decision::Allowed { source: Source::Verified, until_ms: v.access_until_ms };
    }

    let grace_until = v.server_time_ms + OFFLINE_GRACE_MS;
    if estimated_server_now >= grace_until {
        return Decision::Denied(Denial::GraceExpired);
    }
    let until = match v.access_until_ms {
        Some(end) => end.min(grace_until),
        None => grace_until,
    };
    Decision::Allowed { source: Source::OfflineGrace, until_ms: Some(until) }
}

#[cfg(test)]
mod tests {
    use super::*;

    const H: i64 = 60 * 60 * 1000;
    const SERVER: i64 = 1_800_000_000_000; // server time at verification
    const LOCAL: i64 = 1_800_000_050_000; // the Mac was 50 s ahead

    fn verified(has_access: bool, until: Option<i64>) -> Verification {
        Verification { server_time_ms: SERVER, local_time_ms: LOCAL, has_access, access_until_ms: until, state: "BETA".into() }
    }

    #[test]
    fn nothing_verified_means_no_access() {
        assert_eq!(decide(None, LOCAL, LOCAL), Decision::Denied(Denial::NotVerified));
    }

    #[test]
    fn a_fresh_verification_is_current_access() {
        let v = verified(true, Some(SERVER + 30 * 24 * H));
        assert_eq!(decide(Some(&v), LOCAL + 60_000, LOCAL),
            Decision::Allowed { source: Source::Verified, until_ms: Some(SERVER + 30 * 24 * H) });
    }

    #[test]
    fn offline_within_72_hours_uses_grace_capped_at_grace_end() {
        let v = verified(true, Some(SERVER + 30 * 24 * H));
        assert_eq!(decide(Some(&v), LOCAL + 71 * H, LOCAL + 71 * H),
            Decision::Allowed { source: Source::OfflineGrace, until_ms: Some(SERVER + 72 * H) });
    }

    #[test]
    fn offline_beyond_72_hours_is_denied() {
        let v = verified(true, None);
        assert_eq!(decide(Some(&v), LOCAL + 72 * H, LOCAL), Decision::Denied(Denial::GraceExpired));
    }

    #[test]
    fn grace_never_extends_past_the_entitlement_end() {
        let v = verified(true, Some(SERVER + 10 * H));
        assert_eq!(decide(Some(&v), LOCAL + 9 * H, LOCAL),
            Decision::Allowed { source: Source::OfflineGrace, until_ms: Some(SERVER + 10 * H) });
        assert_eq!(decide(Some(&v), LOCAL + 10 * H, LOCAL), Decision::Denied(Denial::AccessEnded));
    }

    #[test]
    fn an_entitlement_that_ends_while_fresh_is_denied_immediately() {
        let v = verified(true, Some(SERVER + 60_000));
        assert_eq!(decide(Some(&v), LOCAL + 61_000, LOCAL), Decision::Denied(Denial::AccessEnded));
    }

    #[test]
    fn server_denial_applies_with_no_grace() {
        let v = verified(false, None);
        assert_eq!(decide(Some(&v), LOCAL, LOCAL), Decision::Denied(Denial::ServerDenied));
    }

    #[test]
    fn setting_the_clock_back_never_buys_time() {
        let v = verified(true, None);
        // Behind the verification itself.
        assert_eq!(decide(Some(&v), LOCAL - 6 * 60_000, LOCAL), Decision::Denied(Denial::ClockRollback));
        // Behind a later time the app already saw (offline, clock rewound to
        // just after the verification to reset the grace).
        assert_eq!(decide(Some(&v), LOCAL + H, LOCAL + 70 * H), Decision::Denied(Denial::ClockRollback));
    }

    #[test]
    fn small_ntp_corrections_are_tolerated() {
        let v = verified(true, None);
        assert!(decide(Some(&v), LOCAL - 2 * 60_000, LOCAL).allowed());
    }

    #[test]
    fn moving_the_clock_forward_only_shortens_access() {
        let v = verified(true, None);
        assert_eq!(decide(Some(&v), LOCAL + 100 * H, LOCAL), Decision::Denied(Denial::GraceExpired));
    }

    #[test]
    fn open_ended_access_offline_ends_at_the_grace_window() {
        let v = verified(true, None);
        assert_eq!(decide(Some(&v), LOCAL + 2 * H, LOCAL),
            Decision::Allowed { source: Source::OfflineGrace, until_ms: Some(SERVER + 72 * H) });
    }
}
