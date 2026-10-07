// Stateful camera-score constants shared by the live session and the recorded
// parity replay. Keep the ruler in one place: the replay must never carry a
// hand-copied threshold that can drift away from SessionScreen.

// A personal EAR ratio avoids applying one eye-shape/landmark threshold to
// every user. The ratio and hold are conservative product boundaries for a
// visibly sustained closure, not a claim that the camera diagnosed fatigue.
export const EYE_CLOSURE_BASELINE_RATIO = 0.55
export const PROLONGED_CLOSE_MS = 1500
export const PHONE_HOLD_MS = 4000
export const DISTRACTION_DOWN_HOLD_MS = 2500
export const HEAD_DOWN_HOLD = 10
export const HEAD_TURN_HOLD = 5
export const FACE_ABSENT_HOLD_MS = 4000
export const HEAD_DRIFT_WIN_MS = 3000
export const HEAD_DRIFT_THRESH = 0.035
export const EAR_RECALIB_INTERVAL = 600_000
export const IRIS_OFF_H = 0.07
export const EYES_OFF_HOLD_SECS = 1.5
export const CONF_UNCERTAIN_MAX = 0.55
export const UNCERTAIN_HOLD_MS = 700
