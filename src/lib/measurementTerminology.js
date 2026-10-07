import {
  NATIVE_CAMERA_MEASUREMENT_V2,
  NATIVE_CAMERA_MEASUREMENT_V3,
  NATIVE_CAMERA_MEASUREMENT_V4,
  WEBVIEW_CAMERA_MEASUREMENT,
} from './cameraMeasurement'

// Product copy names the measurement method, never its storage version. The
// numeric generations remain internal so historical comparisons stay honest.
export function measurementMethodLabel(generation) {
  if (generation === NATIVE_CAMERA_MEASUREMENT_V4.attentionScoringVersion) return 'Current attention measurement'
  if (generation === NATIVE_CAMERA_MEASUREMENT_V3.attentionScoringVersion) return 'Earlier score scale'
  if (generation === NATIVE_CAMERA_MEASUREMENT_V2.attentionScoringVersion) return 'Earlier score scale'
  if (generation === WEBVIEW_CAMERA_MEASUREMENT.attentionScoringVersion) return 'Earlier camera measurement'
  return 'Compatible attention measurement'
}

export function measurementSourceLabel(source, generation) {
  if (source === NATIVE_CAMERA_MEASUREMENT_V4.id) return 'Current attention measurement'
  if (source === NATIVE_CAMERA_MEASUREMENT_V3.id) return 'Earlier score scale'
  if (source === NATIVE_CAMERA_MEASUREMENT_V2.id) return 'Earlier score scale'
  if (source === WEBVIEW_CAMERA_MEASUREMENT.id) return 'Earlier camera measurement'
  if (source) return 'Stored attention measurement'
  return generation == null ? 'Measurement method not stored' : measurementMethodLabel(generation)
}
