import { describe, expect, it } from 'vitest'
import {
  NATIVE_CAMERA_MEASUREMENT_V2,
  NATIVE_CAMERA_MEASUREMENT_V3,
  NATIVE_CAMERA_MEASUREMENT_V4,
  NATIVE_CAMERA_MEASUREMENT_V5,
  WEBVIEW_CAMERA_MEASUREMENT,
} from './cameraMeasurement'
import { measurementMethodLabel, measurementSourceLabel } from './measurementTerminology'

describe('measurement terminology', () => {
  it('uses descriptive product language for known camera methods', () => {
    expect(measurementMethodLabel(NATIVE_CAMERA_MEASUREMENT_V5.attentionScoringVersion)).toBe('Current attention measurement')
    expect(measurementMethodLabel(NATIVE_CAMERA_MEASUREMENT_V4.attentionScoringVersion)).toBe('Earlier score scale')
    expect(measurementMethodLabel(NATIVE_CAMERA_MEASUREMENT_V3.attentionScoringVersion)).toBe('Earlier score scale')
    expect(measurementMethodLabel(NATIVE_CAMERA_MEASUREMENT_V2.attentionScoringVersion)).toBe('Earlier score scale')
    expect(measurementMethodLabel(WEBVIEW_CAMERA_MEASUREMENT.attentionScoringVersion)).toBe('Earlier camera measurement')
    expect(measurementSourceLabel(NATIVE_CAMERA_MEASUREMENT_V5.id, 5)).toBe('Current attention measurement')
    expect(measurementSourceLabel(NATIVE_CAMERA_MEASUREMENT_V4.id, 4)).toBe('Earlier score scale')
    expect(measurementSourceLabel(NATIVE_CAMERA_MEASUREMENT_V3.id, 3)).toBe('Earlier score scale')
    expect(measurementSourceLabel(NATIVE_CAMERA_MEASUREMENT_V2.id, 2)).toBe('Earlier score scale')
    expect(measurementSourceLabel(WEBVIEW_CAMERA_MEASUREMENT.id, 1)).toBe('Earlier camera measurement')
  })

  it('keeps unknown and missing metadata understandable without version jargon', () => {
    expect(measurementMethodLabel(99)).toBe('Compatible attention measurement')
    expect(measurementSourceLabel('future_source', 99)).toBe('Stored attention measurement')
    expect(measurementSourceLabel(null, null)).toBe('Measurement method not stored')
  })
})
