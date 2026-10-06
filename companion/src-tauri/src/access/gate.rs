//! Which native actions need beta access. Pure rules; the commands that apply
//! them are in mod.rs.
//!
//! Only STARTING something is gated. Anything that ends a session, lifts
//! blocking, stops the camera or reads/exports history is always allowed, and
//! a session that started with access runs to its end even if access lapses
//! meanwhile (it is never interrupted).

/// `set_companion_session`: the switch from "no session" to "session" needs
/// access; renewing the lease of a running session and every deactivation
/// do not.
pub fn may_apply_session(requested_active: bool, session_running: bool, access_allowed: bool) -> bool {
    !requested_active || session_running || access_allowed
}

/// `start_native_camera_prototype`: measurement, calibration and the camera
/// diagnostic need access, except restarting the camera inside a session
/// that is already running (sleep/wake, camera fault recovery).
pub fn may_start_camera(session_running: bool, access_allowed: bool) -> bool {
    session_running || access_allowed
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn starting_a_session_needs_access() {
        assert!(!may_apply_session(true, false, false));
        assert!(may_apply_session(true, false, true));
    }

    #[test]
    fn a_running_session_keeps_its_lease_after_access_lapses() {
        assert!(may_apply_session(true, true, false));
    }

    #[test]
    fn ending_a_session_and_lifting_blocking_is_never_refused() {
        assert!(may_apply_session(false, false, false));
        assert!(may_apply_session(false, true, false));
    }

    #[test]
    fn the_camera_needs_access_outside_a_session() {
        assert!(!may_start_camera(false, false));
        assert!(may_start_camera(false, true));
    }

    #[test]
    fn the_camera_restarts_inside_a_running_session_without_access() {
        assert!(may_start_camera(true, false));
    }
}
