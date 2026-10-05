import { describe, expect, it } from 'vitest'
import { FACE_ABSENT_HOLD_MS } from './cameraScoringConstants'
import {
  OFF_TARGET_CLEAR_AWAY_DEG,
  OFF_TARGET_REST,
  OFF_TARGET_STEP_SHARE_AT_HOLD,
  advanceOffTargetFactor,
  offTargetExcessDeg,
  offTargetSeverity,
  stepOffTarget,
} from './offTargetAttention'

const zone = { yawLT: 30, yawRT: 55, pitchDT: 30, pitchUpDT: 15 }

function hold(severity, ms, start = OFF_TARGET_REST, frameMs = 10) {
  let state = start
  for (let t = 0; t < ms; t += frameMs) state = advanceOffTargetFactor(state, severity, frameMs)
  return state
}

describe('distance outside the work zone', () => {
  it('is exactly zero anywhere inside the zone and on any work object', () => {
    for (const [yaw, pitch] of [[0, 0], [30, 0], [-55, 0], [0, 30], [0, -15], [29, 29]]) {
      expect(offTargetExcessDeg({ ...zone, yaw, pitch })).toBe(0)
    }
    expect(offTargetExcessDeg({ ...zone, yaw: -120, pitch: 70, onWorkObject: true })).toBe(0)
  })

  it('measures each side against its own edge, in degrees, combined euclidean', () => {
    expect(offTargetExcessDeg({ ...zone, yaw: 45, pitch: 0 })).toBe(15)   // left edge 30
    expect(offTargetExcessDeg({ ...zone, yaw: -70, pitch: 0 })).toBe(15)  // right edge 55
    expect(offTargetExcessDeg({ ...zone, yaw: 0, pitch: -30 })).toBe(15)  // up edge 15
    expect(offTargetExcessDeg({ ...zone, yaw: 42, pitch: 46 })).toBeCloseTo(20) // 12 and 16
  })
})

describe('severity grows convexly with distance', () => {
  it('starts at 0, is 1 at the clear-away distance and stays capped beyond', () => {
    expect(offTargetSeverity(0)).toBe(0)
    expect(offTargetSeverity(OFF_TARGET_CLEAR_AWAY_DEG)).toBeCloseTo(1)
    expect(offTargetSeverity(4 * OFF_TARGET_CLEAR_AWAY_DEG)).toBeCloseTo(1)
  })

  it('stays small where the eyes can still reach the work, then rises steeply', () => {
    const at = deg => offTargetSeverity(deg)
    expect(at(5)).toBeLessThan(0.05)
    expect(at(15)).toBeCloseTo(0.18, 2)
    expect(at(22.5)).toBeCloseTo(0.44, 2)
    // convex: every further step costs more than the one before
    const steps = [0, 5, 10, 15, 20, 25, 30].map(at)
    for (let i = 2; i < steps.length; i += 1) {
      expect(steps[i] - steps[i - 1]).toBeGreaterThan(steps[i - 1] - steps[i - 2])
    }
  })
})

describe('the second-order time filter', () => {
  it('reaches 75 % of a full look-away exactly when a missing face counts as away', () => {
    expect(hold(1, FACE_ABSENT_HOLD_MS).factor).toBeCloseTo(OFF_TARGET_STEP_SHARE_AT_HOLD, 2)
  })

  it('answers a step with an S-curve: flat first, so a glance barely registers', () => {
    expect(hold(1, 67).factor).toBeLessThan(0.002)  // one frame
    expect(hold(1, 1000).factor).toBeCloseTo(0.148, 2)
    expect(hold(1, 2000).factor).toBeCloseTo(0.391, 2)
  })

  it('releases at the same rate it builds (no bias toward either side)', () => {
    // Linear filter: from a settled look-away, 4 s back on the work leaves
    // exactly what 4 s of looking away had not yet built (1 − 0.75).
    const settled = hold(1, 30_000)
    expect(settled.factor).toBeCloseTo(1, 3)
    expect(hold(0, FACE_ABSENT_HOLD_MS, settled).factor).toBeCloseTo(1 - OFF_TARGET_STEP_SHARE_AT_HOLD, 2)
  })

  it('resets once the face counts as away and holds through untrusted frames', () => {
    const built = hold(1, 4000)
    const pose = { ...zone, yaw: -120, pitch: 0, onWorkObject: false, deltaMs: 500 }
    expect(stepOffTarget({ ...pose, previous: built, hasFace: false, faceAbsentMs: FACE_ABSENT_HOLD_MS }).state).toEqual(OFF_TARGET_REST)
    expect(stepOffTarget({ ...pose, previous: built, hasFace: false, faceAbsentMs: 300 }).state).toBe(built)
    expect(stepOffTarget({ ...pose, previous: built, hasFace: true, trackingUncertain: true }).state).toBe(built)
  })
})
