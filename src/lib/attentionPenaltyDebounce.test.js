import { describe, expect, it } from 'vitest'
import {
  PENALTY_SIGNALS,
  advancePenaltyFrameState,
  createPenaltyFrameState,
  penaltySignalConfirmed,
} from './attentionPenaltyDebounce'

describe('attention penalty frame debounce', () => {
  it.each(PENALTY_SIGNALS)('requires three consecutive frames for %s', signal => {
    let state = createPenaltyFrameState()
    state = advancePenaltyFrameState(state, { [signal]: true })
    expect(penaltySignalConfirmed(state, signal)).toBe(false)
    state = advancePenaltyFrameState(state, { [signal]: true })
    expect(penaltySignalConfirmed(state, signal)).toBe(false)
    state = advancePenaltyFrameState(state, { [signal]: true })
    expect(penaltySignalConfirmed(state, signal)).toBe(true)
  })

  it('resets only the signal whose consecutive run was interrupted', () => {
    let state = createPenaltyFrameState()
    state = advancePenaltyFrameState(state, { softHeadLeft: true, eyesRolledUp: true })
    state = advancePenaltyFrameState(state, { softHeadLeft: true, eyesRolledUp: false })
    state = advancePenaltyFrameState(state, { softHeadLeft: true, eyesRolledUp: true })

    expect(penaltySignalConfirmed(state, 'softHeadLeft')).toBe(true)
    expect(penaltySignalConfirmed(state, 'eyesRolledUp')).toBe(false)
    expect(state.eyesRolledUp).toBe(1)
  })
})
