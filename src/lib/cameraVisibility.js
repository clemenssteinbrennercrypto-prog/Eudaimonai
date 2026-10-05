// Product-estimate trust gates for camera visibility. These do not alter the
// face model or its pinned acceptance threshold; they decide only whether a
// delivered frame is trustworthy enough to enter attention accumulators.
export const VISIBILITY_ISSUE_HOLD_MS = 700
export const MIN_OBSCURED_FACE_EVIDENCE = 0.15
export const DARK_MEAN_LUMA_MAX = 0.12
export const BRIGHT_MEAN_LUMA_MIN = 0.88
export const CLIPPED_PIXEL_FRACTION = 0.65

export function cameraVisibilityCandidate({ hasFace, frameQuality } = {}) {
  if (!frameQuality) return null
  if (
    frameQuality.meanLuma <= DARK_MEAN_LUMA_MAX ||
    frameQuality.darkFraction >= CLIPPED_PIXEL_FRACTION
  ) return 'too_dark'
  if (
    frameQuality.meanLuma >= BRIGHT_MEAN_LUMA_MIN ||
    frameQuality.brightFraction >= CLIPPED_PIXEL_FRACTION
  ) return 'too_bright'
  if (!hasFace && frameQuality.faceConfidence >= MIN_OBSCURED_FACE_EVIDENCE) {
    return 'face_obscured'
  }
  return null
}

export function createCameraVisibilityState() {
  return { candidate: null, candidateSince: null, issue: null }
}

export function advanceCameraVisibilityState(previous, candidate, now) {
  const state = previous || createCameraVisibilityState()
  if (!candidate || !Number.isFinite(now)) return createCameraVisibilityState()
  if (state.candidate !== candidate || !Number.isFinite(state.candidateSince)) {
    return { candidate, candidateSince: now, issue: null }
  }
  return {
    candidate,
    candidateSince: state.candidateSince,
    issue: now - state.candidateSince >= VISIBILITY_ISSUE_HOLD_MS ? candidate : null,
  }
}

export function cameraVisibilityMessage(issue) {
  switch (issue) {
    case 'too_dark': return 'Too dark — add some light'
    case 'too_bright': return 'Too bright — reduce backlight'
    case 'face_obscured': return 'Face unclear — adjust light or glasses'
    default: return null
  }
}
