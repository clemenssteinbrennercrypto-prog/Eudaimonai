import { describe, expect, it } from 'vitest'
import { CALIBRATION_SECS, FOCUSED_SCORE, GOOD_STREAK_SCORE } from './attention'
import {
  PARITY_FRAME_INTERVAL_MS,
  createCameraScoreReplay,
  replayCameraScores,
} from './cameraScoreReplay'

function makeLandmarks({ noseX = 0.5, irisShift = 0, mouthOpen = 0.02 } = {}) {
  const landmarks = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }))
  const set = (index, x, y) => { landmarks[index] = { x, y, z: 0 } }

  set(1, noseX, 0.50)
  set(10, 0.5, 0.20)
  set(152, 0.5, 0.80)
  set(33, 0.35, 0.45); set(133, 0.45, 0.45)
  set(263, 0.65, 0.45); set(362, 0.55, 0.45)
  set(160, 0.40, 0.43); set(144, 0.40, 0.47)
  set(158, 0.42, 0.43); set(153, 0.42, 0.47)
  set(387, 0.60, 0.43); set(373, 0.60, 0.47)
  set(385, 0.58, 0.43); set(380, 0.58, 0.47)
  set(468, 0.40 + irisShift * 0.10, 0.45)
  set(473, 0.60 + irisShift * 0.10, 0.45)
  set(61, 0.45, 0.68); set(291, 0.55, 0.68)
  set(13, 0.50, 0.68 - mouthOpen); set(14, 0.50, 0.68 + mouthOpen)
  set(312, 0.51, 0.68 - mouthOpen); set(317, 0.51, 0.68 + mouthOpen)
  return landmarks
}

const measuredFrame = landmarks => ({ frameMeasured: true, landmarks })

describe('camera parity score replay', () => {
  it('holds the live calibration score for the full calibration interval', () => {
    const frameCount = Math.ceil(CALIBRATION_SECS * 1000 / PARITY_FRAME_INTERVAL_MS)
    const scores = replayCameraScores(
      Array.from({ length: frameCount }, () => measuredFrame(makeLandmarks())),
    )

    expect(scores).toHaveLength(frameCount)
    expect(new Set(scores)).toEqual(new Set([68]))
  })

  it('is deterministic when both engines provide identical landmarks', () => {
    const records = Array.from({ length: 500 }, (_, index) => measuredFrame(makeLandmarks({
      noseX: index > 350 ? 0.56 : 0.5,
      irisShift: index > 400 ? 1 : 0,
    })))

    expect(replayCameraScores(records)).toEqual(replayCameraScores(records))
  })

  it('returns no score for a frame explicitly marked as unmeasured', () => {
    const replay = createCameraScoreReplay()
    const landmarks = makeLandmarks()

    expect(replay.step(measuredFrame(landmarks), 0)).toBe(68)
    expect(replay.step({ frameMeasured: false, landmarks }, 1)).toBeNull()
    expect(replay.step(measuredFrame(landmarks), 2)).toBe(68)
  })

  it('debounces analysed no-face results before decaying the trusted score', () => {
    const frameCount = Math.ceil(CALIBRATION_SECS * 1000 / PARITY_FRAME_INTERVAL_MS) + 2
    const replay = createCameraScoreReplay()
    const landmarks = makeLandmarks()
    let score = null

    for (let index = 0; index < frameCount - 1; index += 1) {
      score = replay.step(measuredFrame(landmarks), index)
    }
    const firstNoFaceScore = replay.step(measuredFrame(null), frameCount - 1)
    const secondNoFaceScore = replay.step(measuredFrame(null), frameCount)
    const confirmedNoFaceScore = replay.step(measuredFrame(null), frameCount + 1)

    expect(score).toBeGreaterThan(68)
    expect(firstNoFaceScore).toBe(score)
    expect(secondNoFaceScore).toBe(score)
    expect(confirmedNoFaceScore).toBeLessThan(score)
    expect(confirmedNoFaceScore).not.toBeNull()
  })
})

// Synthetic face for a given head pose, using analyzeFrame's own geometry:
// pitch from the nose's height between forehead (y .2) and chin (y .8), yaw
// from the nose's offset to the eye-corner midpoint (eye width .3).
function poseLandmarks({ pitchDeg = 0, yawDeg = 0, irisShift = 0 } = {}) {
  const lowerRatio = 0.5 - Math.sin(pitchDeg * Math.PI / 180) / 2
  const noseY = 0.8 - lowerRatio * 0.6
  const noseX = 0.5 + Math.sign(yawDeg) * Math.sin(Math.abs(yawDeg) * Math.PI / 180) * 0.15
  const landmarks = makeLandmarks({ noseX, irisShift })
  landmarks[1] = { x: noseX, y: noseY, z: 0 }
  return landmarks
}

describe('writing on a pad beside the keyboard', () => {
  // What the 3D editor stores: a pad and the mouse to the right, near the user.
  // Before the fix this row (= scene.z) was read as "far back", the pad was
  // invisible to the layout, and the head-down, head-turn and eyes-off
  // penalties all applied while writing.
  const devices = [
    { id: 'screen', type: 'monitor', role: 'primary_screen', col: 0.5, row: 0.28 },
    { id: 'camera', type: 'camera', role: 'neutral', col: 0.5, row: 0.08 },
    { id: 'padRight', type: 'notebook', role: 'writing_surface', col: 0.8, row: 0.15 },
    { id: 'mouse', type: 'mouse', role: 'input_area', col: 0.72, row: 0.2 },
  ]
  const calibrationFrames = Math.ceil(CALIBRATION_SECS * 1000 / PARITY_FRAME_INTERVAL_MS)
  const writingFrames = Math.ceil(60_000 / PARITY_FRAME_INTERVAL_MS)

  function replayWriting(pose, workspace = null) {
    const records = [
      ...Array.from({ length: calibrationFrames }, () => measuredFrame(poseLandmarks())),
      ...Array.from({ length: writingFrames }, () => measuredFrame(poseLandmarks(pose))),
    ]
    return replayCameraScores(records, { devices, workspace }).slice(calibrationFrames)
  }

  it('stays focused for a minute of writing with the head down and turned toward the pad', () => {
    const scores = replayWriting({ pitchDeg: 32, yawDeg: -22, irisShift: 0.8 })
    expect(Math.min(...scores.slice(-300))).toBeGreaterThanOrEqual(65)
  })

  it('still treats the same posture as distraction when no work object is there', () => {
    const scores = replayWriting({ pitchDeg: 32, yawDeg: 22, irisShift: -0.8 })
    // Head-turn, head-down and eyes-off penalties all still apply: "distracted".
    expect(Math.max(...scores.slice(-300))).toBeLessThan(GOOD_STREAK_SCORE)
  })
})

describe('looking away from every work zone', () => {
  const devices = [
    { id: 'screen', type: 'monitor', role: 'primary_screen', col: 0.5, row: 0.28 },
    { id: 'camera', type: 'camera', role: 'neutral', col: 0.5, row: 0.08 },
  ]
  const calibrationFrames = Math.ceil(CALIBRATION_SECS * 1000 / PARITY_FRAME_INTERVAL_MS)
  const frames = seconds => Math.ceil(seconds * 1000 / PARITY_FRAME_INTERVAL_MS)

  function replayAway(pose, seconds) {
    const focused = frames(120)
    const records = [
      ...Array.from({ length: calibrationFrames + focused }, () => measuredFrame(poseLandmarks())),
      ...Array.from({ length: frames(seconds) }, () => measuredFrame(poseLandmarks(pose))),
    ]
    return replayCameraScores(records, { devices }).slice(calibrationFrames + focused)
  }

  it('drops below the focused band within seconds when the head turns fully aside or down', () => {
    for (const pose of [{ yawDeg: -85 }, { yawDeg: 85 }, { pitchDeg: 70 }, { pitchDeg: -45 }]) {
      const scores = replayAway(pose, 10)
      expect(scores[frames(5)]).toBeLessThan(FOCUSED_SCORE)
      expect(scores.at(-1)).toBeLessThan(10)
    }
  })

  it('lets a short glance pass without leaving the focused band', () => {
    const scores = replayAway({ yawDeg: -60 }, 1.5)
    expect(Math.min(...scores)).toBeGreaterThanOrEqual(FOCUSED_SCORE)
  })
})
