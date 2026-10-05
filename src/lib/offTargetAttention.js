// How far the head points OUTSIDE every work zone, and what that costs.
//
// The older pose penalties are fixed amounts (-8 / -25 for a head turn, -15 for
// eyes off the screen). A fixed amount cannot tell a 31° turn from a 90° one,
// and the focus bonuses (blink, stable head, up to +15 sustained-focus ramp)
// outweigh it: a full turn to the side for 15 s held a score of ~71. This
// module adds the missing dimension — distance — as a multiplicative
// attenuation of the whole score:
//
//   inside any work zone      → excess 0 → factor 0 → score unchanged (dead zone)
//   e = excess / 30°          → g(e) = (exp(κe) − 1) / (exp(κ) − 1), capped at 1
//   time                      → second-order low-pass (two cascaded first-order
//                                stages), 75 % of a step reached at 4 s
//   score                     → score × (1 − G)
//
// Why each constant is what it is:
// - 30°: the eyes comfortably rotate ±15–20° in the head. A head pointing 15°
//   past the edge of the work zone can still have its eyes on the work; at 30°
//   past it, the eyes cannot reasonably reach it. e = 1 is "clearly away".
// - κ = 3: convex, so the penalty starts almost flat (g'(0) ≈ 0.16) and a
//   small overshoot costs little: g(0.5) ≈ 0.18 at 15° past the edge, where the
//   eyes may still compensate; g(0.75) ≈ 0.44; g(1) = 1.
// - Second order, not first: a first-order filter answers a step with its
//   steepest slope at t = 0, so even a brief glance bites at once. Two stages
//   give the S-shaped step response 1 − (1 + t/τ)·e^(−t/τ): flat at first,
//   then steep, then saturating — "not immediately, then decisively".
// - τ is solved from (1 + x)·e^(−x) = 1/4 with x = 4 s / τ (x ≈ 2.693,
//   τ ≈ 1.49 s): a full look-away reaches 75 % of its effect at the same 4 s
//   at which a missing face counts as away, so "turned fully away" and "left
//   the desk" converge. A 1 s glance reaches ~15 % of g, a 2 s one ~39 %.
// - The filter is symmetric: returning to the work releases the penalty at
//   the same rate it was built, which keeps it unbiased. A single noisy frame
//   moves G by about (Δt/τ)²/2 ≈ 0.1 % of g (the CLAUDE.md debounce rule).
//
// The work zone is the one the rest of the scorer already uses: the screen
// tolerance box from computeThresholds (widened for side screens, desk objects
// and a laptop), plus every object the gaze classifier recognised as
// productive. No new geometry, so nothing that already counts as work can
// start to cost points.

import { FACE_ABSENT_HOLD_MS } from './cameraScoringConstants.js'

export const OFF_TARGET_CLEAR_AWAY_DEG = 30
export const OFF_TARGET_SHAPE = 3
export const OFF_TARGET_STEP_SHARE_AT_HOLD = 0.75

// Solve (1 + x)·e^(−x) = 1 − share for x by Newton's method; f is strictly
// decreasing for x > 0, so this converges from x = 1 in a few steps.
function secondOrderTimeConstantMs(holdMs, share) {
  let x = 1
  for (let i = 0; i < 20; i += 1) {
    const f = (1 + x) * Math.exp(-x) - (1 - share)
    const fPrime = -x * Math.exp(-x)
    x -= f / fPrime
  }
  return holdMs / x
}

export const OFF_TARGET_TIME_CONSTANT_MS = secondOrderTimeConstantMs(FACE_ABSENT_HOLD_MS, OFF_TARGET_STEP_SHARE_AT_HOLD)

const clamp01 = value => Math.max(0, Math.min(1, value))

/**
 * Degrees the head points past the edge of the work zone (0 inside it).
 * `yaw` uses the scorer's sign (+ = user's left); `pitch` is signed with
 * + = down, matching pitchDeg - pitchUpDeg.
 */
export function offTargetExcessDeg({ yaw, pitch, yawLT, yawRT, pitchDT, pitchUpDT, onWorkObject }) {
  if (onWorkObject) return 0
  const yawExcess = yaw >= 0 ? Math.max(0, yaw - yawLT) : Math.max(0, -yaw - yawRT)
  const pitchExcess = pitch >= 0 ? Math.max(0, pitch - pitchDT) : Math.max(0, -pitch - pitchUpDT)
  return Math.hypot(yawExcess, pitchExcess)
}

/** Instantaneous severity g ∈ [0, 1]: convex in the distance, 1 once clearly away. */
export function offTargetSeverity(excessDeg) {
  const e = clamp01(excessDeg / OFF_TARGET_CLEAR_AWAY_DEG)
  return (Math.exp(OFF_TARGET_SHAPE * e) - 1) / (Math.exp(OFF_TARGET_SHAPE) - 1)
}

export const OFF_TARGET_REST = Object.freeze({ fast: 0, factor: 0 })

/** One step of the two-stage low-pass; `factor` (the second stage) is G. */
export function advanceOffTargetFactor(previous = OFF_TARGET_REST, severity, deltaMs) {
  const step = 1 - Math.exp(-Math.max(0, deltaMs) / OFF_TARGET_TIME_CONSTANT_MS)
  const fast = clamp01(Number(previous?.fast) || 0)
  const slow = clamp01(Number(previous?.factor) || 0)
  const nextFast = clamp01(fast + (clamp01(severity) - fast) * step)
  return { fast: nextFast, factor: clamp01(slow + (nextFast - slow) * step) }
}

/**
 * One frame of the off-target state, shared by SessionScreen and the parity
 * replay. Resets when the face has been gone long enough to count as away
 * (the away score already says it, and a carried-over factor would punish the
 * return — CLAUDE.md invariant 4). Holds while the face is briefly missing or
 * the landmarks are untrusted: an unreliable pose must not move it.
 */
export function stepOffTarget({
  previous = OFF_TARGET_REST,
  hasFace,
  faceAbsentMs = 0,
  trackingUncertain = false,
  yaw,
  pitch,
  yawLT,
  yawRT,
  pitchDT,
  pitchUpDT,
  onWorkObject,
  deltaMs,
}) {
  if (faceAbsentMs >= FACE_ABSENT_HOLD_MS) return { state: OFF_TARGET_REST, excessDeg: null }
  if (!hasFace || trackingUncertain) return { state: previous, excessDeg: null }
  const excessDeg = offTargetExcessDeg({ yaw, pitch, yawLT, yawRT, pitchDT, pitchUpDT, onWorkObject })
  return {
    state: advanceOffTargetFactor(previous, offTargetSeverity(excessDeg), deltaMs),
    excessDeg,
  }
}
