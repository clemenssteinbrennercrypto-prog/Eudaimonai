import { describe, expect, it } from 'vitest'
import { calculateBaseAttentionScore, finalizeAttentionScore, SCORE_TRACE_VERSION } from './attentionScore'

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
    const final = finalizeAttentionScore({ base, rampBonus: 10, previousScore: 70, trackingUncertain: false })
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
})
