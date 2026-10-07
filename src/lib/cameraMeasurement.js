export const WEBVIEW_CAMERA_MEASUREMENT = Object.freeze({
  id: 'webview_mediapipe_v1',
  attentionScoringVersion: 1,
})

export const NATIVE_CAMERA_MEASUREMENT_V2 = Object.freeze({
  id: 'native_mediapipe_v2',
  attentionScoringVersion: 2,
  modelPackage: '@mediapipe/face_mesh@0.4.1633559619',
  landmarkModelSha256: '883b7411747bac657c30c462d305d312e9dec6adbf8b85e2f5d8d722fca9455d',
  detectorModelSha256: '3bc182eb9f33925d9e58b5c8d59308a760f4adea8f282370e428c51212c26633',
})

// Same native camera and models as V2; the scale changed. Above 75 the score
// now has to be earned with unbroken attention (attentionScore.js,
// earnedTopCeiling), which moves mean attention and the Focus Score's quality
// factor. Every band decision is unchanged, but a V2 day and a V3 day still
// must not be averaged or compared as if read off one ruler.
export const NATIVE_CAMERA_MEASUREMENT_V3 = Object.freeze({
  ...NATIVE_CAMERA_MEASUREMENT_V2,
  id: 'native_mediapipe_v3_earned_top',
  attentionScoringVersion: 3,
})

// V4 retains that earned-top scale but removes unsupported blink/yawn/
// closure-share heuristics, personalises sustained eye closure, and uses one
// recovery-ramp rate. The camera and model hashes are still byte-for-byte V2.
export const NATIVE_CAMERA_MEASUREMENT_V4 = Object.freeze({
  ...NATIVE_CAMERA_MEASUREMENT_V3,
  id: 'native_mediapipe_v4_evidence_clean',
  attentionScoringVersion: 4,
})

// Earlier generations remain exported solely so stored history can identify
// its original ruler; none is a runtime fallback.
export const PRIMARY_CAMERA_MEASUREMENT = NATIVE_CAMERA_MEASUREMENT_V4

export function nativeCameraFaultFor(status) {
  if (status?.state !== 'faulted') return null
  switch (status.fault) {
    case 'no_frames': return 'no_frames'
    case 'capture': return 'no_camera'
    case 'inference':
    case 'architecture':
    case 'worker':
      return 'library'
    default:
      return 'stalled'
  }
}

export function nativeLandmarksForScoring(payload) {
  if (
    payload?.framePresent !== true ||
    !Number.isFinite(payload?.frameSequence) ||
    !Number.isFinite(payload?.capturedAtMs) ||
    payload.capturedAtMs <= 0
  ) return null
  if (payload.facePresent === false) return []
  if (payload.facePresent !== true || !Array.isArray(payload.landmarks) || payload.landmarks.length !== 478) {
    return null
  }
  return payload.landmarks.every(point =>
    Number.isFinite(point?.x) && Number.isFinite(point?.y) && Number.isFinite(point?.z))
    ? payload.landmarks
    : null
}
