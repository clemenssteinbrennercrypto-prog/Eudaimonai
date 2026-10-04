// One noisy landmark frame must never subtract score. Keep the consecutive-
// frame bookkeeping pure so SessionScreen only owns the ref, while tests can
// prove every negative signal uses the same deadzone.

export const PENALTY_DEBOUNCE_FRAMES = 3

export const PENALTY_SIGNALS = Object.freeze([
  'faceAbsent',
  'unknownPhoneDownward',
  'softHeadDown',
  'softHeadLeft',
  'softHeadRight',
  'eyesRolledUp',
])

export function createPenaltyFrameState() {
  return Object.fromEntries(PENALTY_SIGNALS.map(signal => [signal, 0]))
}

export function advancePenaltyFrameState(previous = {}, signals = {}) {
  return Object.fromEntries(PENALTY_SIGNALS.map(signal => [
    signal,
    signals[signal]
      ? Math.min(PENALTY_DEBOUNCE_FRAMES, (previous[signal] || 0) + 1)
      : 0,
  ]))
}

export function penaltySignalConfirmed(state, signal) {
  return PENALTY_SIGNALS.includes(signal) &&
    Number(state?.[signal]) >= PENALTY_DEBOUNCE_FRAMES
}
