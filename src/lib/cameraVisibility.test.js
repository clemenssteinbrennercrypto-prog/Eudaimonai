import { describe, expect, it } from 'vitest'
import {
  VISIBILITY_ISSUE_HOLD_MS,
  advanceCameraVisibilityState,
  cameraVisibilityCandidate,
  cameraVisibilityMessage,
  createCameraVisibilityState,
} from './cameraVisibility'

const quality = overrides => ({
  faceConfidence: 0.01,
  meanLuma: 0.5,
  darkFraction: 0.05,
  brightFraction: 0.05,
  ...overrides,
})

describe('camera visibility trust gate', () => {
  it('distinguishes extreme exposure and obscured-face evidence from a clear empty frame', () => {
    expect(cameraVisibilityCandidate({ hasFace: false, frameQuality: quality({ meanLuma: 0.1 }) })).toBe('too_dark')
    expect(cameraVisibilityCandidate({ hasFace: false, frameQuality: quality({ brightFraction: 0.8 }) })).toBe('too_bright')
    expect(cameraVisibilityCandidate({ hasFace: false, frameQuality: quality({ faceConfidence: 0.3 }) })).toBe('face_obscured')
    expect(cameraVisibilityCandidate({ hasFace: false, frameQuality: quality() })).toBeNull()
  })

  it('debounces visibility problems and clears immediately on a trustworthy frame', () => {
    const start = advanceCameraVisibilityState(createCameraVisibilityState(), 'too_dark', 1_000)
    expect(start.issue).toBeNull()
    const held = advanceCameraVisibilityState(start, 'too_dark', 1_000 + VISIBILITY_ISSUE_HOLD_MS)
    expect(held.issue).toBe('too_dark')
    expect(advanceCameraVisibilityState(held, null, 2_000)).toEqual(createCameraVisibilityState())
  })

  it('uses corrective copy without claiming why the face is obscured', () => {
    expect(cameraVisibilityMessage('face_obscured')).toContain('light or glasses')
    expect(cameraVisibilityMessage(null)).toBeNull()
  })
})
