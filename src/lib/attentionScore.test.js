import { describe, expect, it } from 'vitest'
import {
  EARNED_ATTENTION_REST,
  EARNED_TOP_FLOOR,
  EARNED_TOP_LAPSE_DRAIN_RATE,
  EARNED_TOP_LAPSE_HOLD_MS,
  EARNED_TOP_MAX_MS,
  SCORE_TRACE_VERSION,
  calculateBaseAttentionScore,
  earnedTopCeiling,
  finalizeAttentionScore,
  stepEarnedAttention,
} from './attentionScore'
import { ALERT_SCORE, FLOW_SCORE, FOCUSED_SCORE, GOOD_STREAK_SCORE } from './attention'

function input(extra = {}) {
  return {
    hasFace: true,
    faceAbsentMs: 0,
    previousScore: 68,
    hasBlinkData: false,
    blinkRate: 0,
    fidgetVariance: 0.02,
    pitchDeg: 10,
    workZonePitchMin: 8,
    workZonePitchMax: 25,
    productiveDownward: false,
    productiveHorizontal: false,
    phoneMs: 0,
    distractionDownward: false,
    unknownPhoneDownwardConfirmed: false,
    eyesClosedMs: 0,
    earlyMicrosleepMs: 0,
    hasPerclos: false,
    perclos: 0,
    yawnMs: 0,
    lookingUpMs: 0,
    pitchUpDT: 15,
    pitchDT: 30,
    headDownSecs: 0,
    adjustedYawSigned: 0,
    yawLT: 30,
    yawRT: 30,
    headTurnLeftSecs: 0,
    headTurnRightSecs: 0,
    eyesOffSecs: 0,
    softHeadDownConfirmed: false,
    softHeadLeftConfirmed: false,
    softHeadRightConfirmed: false,
    eyesRolledUpConfirmed: false,
    faceAbsentConfirmed: true,
    activityPenalty: 0,
    activityBonus: 0,
    activityDistractionMs: 0,
    activityReasonHoldMs: 10_000,
    ...extra,
  }
}

describe('pure attention score and trace', () => {
  it('records every applied bonus and penalty with the same arithmetic as the live ruler', () => {
    const base = calculateBaseAttentionScore(input({
      hasBlinkData: true,
      blinkRate: 15,
      fidgetVariance: 0.01,
      productiveHorizontal: true,
      eyesClosedMs: 1600,
      activityBonus: 5,
    }))
    expect(base.components).toMatchObject({
      face_present_base: 68,
      blink_optimal: 7,
      head_stable: 5,
      work_zone_gaze: 5,
      productive_secondary_screen: 5,
      eyes_closed_prolonged: -35,
      activity_focus_app: 5,
    })
    expect(base.score).toBe(60)
    expect(base.primaryReason).toBe('prolonged')
  })

  it('records camera clamping and smoothing rather than hiding either transform', () => {
    const base = calculateBaseAttentionScore(input({ hasBlinkData: true, blinkRate: 15, fidgetVariance: 0.001, productiveHorizontal: true }))
    const final = finalizeAttentionScore({ base, rampBonus: 10, previousScore: 70, earnedAttentionMs: EARNED_TOP_MAX_MS, trackingUncertain: false })
    expect(base.components.camera_cap).toBe(-5)
    expect(final.rawFinal).toBe(95)
    expect(final.score).toBe(77.5)
    expect(final.trace.version).toBe(SCORE_TRACE_VERSION)
  })

  it('holds the trusted score when tracking is uncertain and records that refusal', () => {
    const base = calculateBaseAttentionScore(input({ eyesClosedMs: 1600 }))
    const final = finalizeAttentionScore({ base, rampBonus: 0, previousScore: 72, trackingUncertain: true })
    expect(final.score).toBe(72)
    expect(final.trace.heldForUncertainTracking).toBe(true)
  })

  it('records brief face loss as decay from the previous score, not as a new bonus', () => {
    const base = calculateBaseAttentionScore(input({ hasFace: false, faceAbsentMs: 400, previousScore: 80, faceAbsentConfirmed: true }))
    expect(base.score).toBe(70.4)
    expect(Object.keys(base.components)).toEqual(['face_transition_decay'])
    expect(base.components.face_transition_decay).toBeCloseTo(-9.6)
  })

  it('holds the trusted score while face loss is still inside the frame deadzone', () => {
    const base = calculateBaseAttentionScore(input({
      hasFace: false,
      faceAbsentMs: 100,
      previousScore: 80,
      faceAbsentConfirmed: false,
    }))
    const final = finalizeAttentionScore({
      base,
      rampBonus: 10,
      previousScore: 80,
      earnedAttentionMs: EARNED_TOP_MAX_MS,
      trackingUncertain: false,
      holdForDebounce: true,
    })
    expect(base.score).toBe(80)
    expect(final.score).toBe(80)
    expect(final.trace.heldForDebounce).toBe(true)
    expect(final.trace.components).not.toHaveProperty('face_transition_decay')
  })

  it.each([
    ['phone_possible', { pitchDeg: 40, unknownPhoneDownwardConfirmed: true }],
    ['head_down_soft', { pitchDeg: 24, softHeadDownConfirmed: true }],
    ['head_down_productive_soft', { pitchDeg: 24, productiveDownward: true, softHeadDownConfirmed: true }],
    ['head_left_soft', { adjustedYawSigned: 20, softHeadLeftConfirmed: true }],
    ['head_right_soft', { adjustedYawSigned: -20, softHeadRightConfirmed: true }],
    ['eyes_rolled_up', { eyesRolledUpConfirmed: true }],
  ])('applies %s only after its frame debounce is confirmed', (component, confirmed) => {
    const rawSignalOnly = {
      pitchDeg: confirmed.pitchDeg,
      adjustedYawSigned: confirmed.adjustedYawSigned,
    }
    const unconfirmed = calculateBaseAttentionScore(input(rawSignalOnly))
    const debounced = calculateBaseAttentionScore(input(confirmed))
    expect(unconfirmed.components).not.toHaveProperty(component)
    expect(debounced.components[component]).toBeLessThan(0)
  })

  it('does not charge a head turn that a pad or mouse on the desk explains', () => {
    const turnedRight = { adjustedYawSigned: -35, headTurnRightSecs: 6, softHeadRightConfirmed: true, pitchDeg: 35 }
    const unexplained = calculateBaseAttentionScore(input(turnedRight))
    const onPad = calculateBaseAttentionScore(input({ ...turnedRight, productiveDownward: true }))
    expect(unexplained.components.head_right_sustained).toBe(-25)
    expect(onPad.components.head_right_sustained).toBeUndefined()
    expect(onPad.components.head_right_soft).toBeUndefined()
  })

  it('scales the whole score by the off-target factor and leaves it alone inside a work zone', () => {
    const inside = calculateBaseAttentionScore(input({ hasBlinkData: true, blinkRate: 15 }))
    const away = calculateBaseAttentionScore(input({ hasBlinkData: true, blinkRate: 15, offTargetFactor: 0.75 }))
    expect(inside.components.off_target).toBeUndefined()
    expect(away.score).toBeCloseTo(inside.score * 0.25)
    expect(away.components.off_target).toBeCloseTo(-inside.score * 0.75)
    // the focus ramp cannot prop up a look away
    const final = finalizeAttentionScore({ base: away, rampBonus: 15, previousScore: away.score, trackingUncertain: false })
    expect(final.trace.components.sustained_focus_ramp).toBeCloseTo(15 * 0.25)
    expect(final.trace.offTargetFactor).toBe(0.75)
  })

  it('names looking away once it costs a quarter of the score, without overriding a specific reason', () => {
    expect(calculateBaseAttentionScore(input({ offTargetFactor: 0.2 })).primaryReason).toBe('focused')
    expect(calculateBaseAttentionScore(input({ offTargetFactor: 0.3 })).primaryReason).toBe('looking_away')
    expect(calculateBaseAttentionScore(input({ offTargetFactor: 0.9, yawnMs: 2000 })).primaryReason).toBe('yawn')
  })
})

describe('earned top of the scale', () => {
  const calm = () => calculateBaseAttentionScore(input({
    hasBlinkData: true, blinkRate: 15, fidgetVariance: 0.001, activityBonus: 10,
  }))
  const minutes = m => m * 60_000

  it('starts at the floor and halves the distance to 100 every 10 minutes', () => {
    expect(earnedTopCeiling(0)).toBe(EARNED_TOP_FLOOR)
    expect(earnedTopCeiling(minutes(3))).toBeCloseTo(79.7, 1)
    expect(earnedTopCeiling(minutes(10))).toBeCloseTo(87.5, 5)
    expect(earnedTopCeiling(minutes(13))).toBeCloseTo(89.8, 1)
    expect(earnedTopCeiling(minutes(23))).toBeCloseTo(94.9, 1)
    expect(Math.round(earnedTopCeiling(EARNED_TOP_MAX_MS))).toBe(100)
    expect(earnedTopCeiling(minutes(500))).toBe(earnedTopCeiling(EARNED_TOP_MAX_MS))
  })

  it('caps a calm start at the floor instead of letting presence read as 95', () => {
    const final = finalizeAttentionScore({ base: calm(), rampBonus: 0, previousScore: 95, earnedAttentionMs: 0, trackingUncertain: false })
    expect(final.signal).toBe(95)
    expect(final.score).toBe(EARNED_TOP_FLOOR)
    expect(final.trace.signalScore).toBe(95)
    expect(final.trace.earnedTopCeiling).toBe(EARNED_TOP_FLOOR)
  })

  it('never raises a score: a penalised signal below the ceiling passes through unchanged', () => {
    const phone = calculateBaseAttentionScore(input({ phoneMs: 5_000 }))
    const final = finalizeAttentionScore({ base: phone, rampBonus: 0, previousScore: 40, earnedAttentionMs: 0, trackingUncertain: false })
    expect(final.score).toBe(final.signal)
  })

  it('smooths and holds on the signal, so the ceiling cannot feed back into it', () => {
    const held = finalizeAttentionScore({ base: calm(), rampBonus: 0, previousScore: 92, earnedAttentionMs: 0, trackingUncertain: true })
    expect(held.signal).toBe(92)
    expect(held.score).toBe(EARNED_TOP_FLOOR)
  })

  // The whole design rests on this: the floor sits above every band, so the
  // ceiling cannot change a single band decision — Deep Focus, the Flow gate,
  // focused seconds, lapses, recovery and phases read identically.
  it('leaves every band decision unchanged for any signal and any earned time', () => {
    const bands = [ALERT_SCORE, FOCUSED_SCORE, 55, GOOD_STREAK_SCORE, FLOW_SCORE]
    expect(Math.max(...bands)).toBeLessThan(EARNED_TOP_FLOOR - 0.5)
    for (let signal = 0; signal <= 100; signal += 0.25) {
      for (const earned of [0, minutes(1), minutes(10), EARNED_TOP_MAX_MS]) {
        const shown = Math.min(signal, earnedTopCeiling(earned))
        for (const band of bands) {
          expect(shown >= band).toBe(signal >= band)
          expect(Math.round(shown) >= band).toBe(Math.round(signal) >= band)
        }
      }
    }
  })

  const step = (previous, signalScore, deltaMs = 100, hold = false) =>
    stepEarnedAttention(previous, { signalScore, deltaMs, hold })

  it('earns in the Deep Focus band and holds through a dip that is not a lapse', () => {
    expect(step(EARNED_ATTENTION_REST, FLOW_SCORE).earnedMs).toBe(100)
    // The first version drained here: a glance or a blink cluster cost earned time.
    let state = { earnedMs: minutes(10), belowFocusedMs: 0 }
    for (let i = 0; i < 600; i += 1) state = step(state, FLOW_SCORE - 1)
    expect(state.earnedMs).toBe(minutes(10))
    for (let i = 0; i < 600; i += 1) state = step(state, FOCUSED_SCORE)
    expect(state.earnedMs).toBe(minutes(10))
  })

  it('drains only once a stretch below FOCUSED_SCORE has lasted as long as a counted lapse', () => {
    let state = { earnedMs: minutes(10), belowFocusedMs: 0 }
    for (let ms = 0; ms < EARNED_TOP_LAPSE_HOLD_MS; ms += 100) state = step(state, 10)
    expect(state.earnedMs).toBe(minutes(10))
    for (let ms = 0; ms < 10_000; ms += 100) state = step(state, 10)
    expect(state.earnedMs).toBe(minutes(10) - 10_000 * EARNED_TOP_LAPSE_DRAIN_RATE)
    // Coming back resets the lapse clock, so the next dip gets the full grace.
    state = step(state, FLOW_SCORE)
    expect(state.belowFocusedMs).toBe(0)
  })

  it('neither earns nor drains while the signal is held', () => {
    const state = { earnedMs: 5_000, belowFocusedMs: 12_000 }
    expect(step(state, 0, 100, true)).toEqual(state)
    expect(step(state, 95, 100, true)).toEqual(state)
  })

  it('never banks more than the cap and never goes below zero', () => {
    expect(step({ earnedMs: EARNED_TOP_MAX_MS, belowFocusedMs: 0 }, 95).earnedMs).toBe(EARNED_TOP_MAX_MS)
    expect(step({ earnedMs: 100, belowFocusedMs: 60_000 }, 0).earnedMs).toBe(0)
  })
})
