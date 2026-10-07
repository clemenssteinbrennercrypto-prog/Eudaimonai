import { describe, expect, it } from 'vitest'
import {
  NATIVE_CAMERA_MEASUREMENT_V2,
  NATIVE_CAMERA_MEASUREMENT_V3,
  PRIMARY_CAMERA_MEASUREMENT,
  WEBVIEW_CAMERA_MEASUREMENT,
  nativeCameraFaultFor,
  nativeLandmarksForScoring,
} from './cameraMeasurement'

describe('primary camera measurement', () => {
  // Revised 31 Aug 2026: native V2 is deliberately the only source for new
  // sessions. Existing V1 records retain their generation instead of silently
  // crossing the ruler boundary.
  it('uses native V2 without retaining a WebView runtime fallback', () => {
    expect(NATIVE_CAMERA_MEASUREMENT_V2.attentionScoringVersion)
      .not.toBe(WEBVIEW_CAMERA_MEASUREMENT.attentionScoringVersion)
  })

  // 7 Oct 2026: the earned-top scale (attentionScore.js) is a new ruler on the
  // same camera. It must be its own generation so a V2 day and a V3 day are
  // never averaged, and must keep the V2 model identity it was measured with.
  it('records new sessions on the earned-top scale as their own generation', () => {
    expect(PRIMARY_CAMERA_MEASUREMENT).toBe(NATIVE_CAMERA_MEASUREMENT_V3)
    expect(NATIVE_CAMERA_MEASUREMENT_V3.attentionScoringVersion)
      .not.toBe(NATIVE_CAMERA_MEASUREMENT_V2.attentionScoringVersion)
    expect(NATIVE_CAMERA_MEASUREMENT_V3.id).not.toBe(NATIVE_CAMERA_MEASUREMENT_V2.id)
    expect(NATIVE_CAMERA_MEASUREMENT_V3.landmarkModelSha256).toBe(NATIVE_CAMERA_MEASUREMENT_V2.landmarkModelSha256)
    expect(NATIVE_CAMERA_MEASUREMENT_V3.detectorModelSha256).toBe(NATIVE_CAMERA_MEASUREMENT_V2.detectorModelSha256)
  })

  it('maps native failures to existing honest no-measurement states', () => {
    expect(nativeCameraFaultFor({ state: 'faulted', fault: 'no_frames' })).toBe('no_frames')
    expect(nativeCameraFaultFor({ state: 'faulted', fault: 'capture' })).toBe('no_camera')
    expect(nativeCameraFaultFor({ state: 'faulted', fault: 'inference' })).toBe('library')
    expect(nativeCameraFaultFor({ state: 'running', fault: null })).toBeNull()
  })

  it('refuses malformed IPC landmarks instead of treating them as a real frame', () => {
    const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }))
    expect(nativeLandmarksForScoring({
      framePresent: true, frameSequence: 1, capturedAtMs: 100, facePresent: true, landmarks,
    })).toBe(landmarks)
    expect(nativeLandmarksForScoring({
      framePresent: true, frameSequence: 2, capturedAtMs: 200, facePresent: false, landmarks: null,
    })).toEqual([])
    expect(nativeLandmarksForScoring({
      framePresent: true, frameSequence: 3, capturedAtMs: 300, facePresent: true, landmarks: landmarks.slice(1),
    })).toBeNull()
    expect(nativeLandmarksForScoring({
      framePresent: true,
      frameSequence: 4,
      capturedAtMs: 400,
      facePresent: true,
      landmarks: landmarks.map((point, index) => index === 100 ? { ...point, x: NaN } : point),
    })).toBeNull()
    expect(nativeLandmarksForScoring({
      framePresent: true, frameSequence: 5, facePresent: false, landmarks: null,
    })).toBeNull()
  })
})
