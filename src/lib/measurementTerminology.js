import { NATIVE_CAMERA_MEASUREMENT_V2, NATIVE_CAMERA_MEASUREMENT_V3, WEBVIEW_CAMERA_MEASUREMENT } from './cameraMeasurement'

// Product copy names the measurement method, never its storage version. The
// numeric generations remain internal so historical comparisons stay honest.
export function measurementMethodLabel(generation) {
  if (generation === NATIVE_CAMERA_MEASUREMENT_V3.attentionScoringVersion) return 'Current camera measurement'
  if (generation === NATIVE_CAMERA_MEASUREMENT_V2.attentionScoringVersion) return 'Earlier score scale'
  if (generation === WEBVIEW_CAMERA_MEASUREMENT.attentionScoringVersion) return 'Earlier camera measurement'
  return 'Compatible camera measurement'
}

export function measurementSourceLabel(source, generation) {
  if (source === NATIVE_CAMERA_MEASUREMENT_V3.id) return 'Current camera measurement'
  if (source === NATIVE_CAMERA_MEASUREMENT_V2.id) return 'Earlier score scale'
  if (source === WEBVIEW_CAMERA_MEASUREMENT.id) return 'Earlier camera measurement'
  if (source) return 'Stored camera measurement'
  return generation == null ? 'Measurement method not stored' : measurementMethodLabel(generation)
}
