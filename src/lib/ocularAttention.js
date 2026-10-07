import { EYE_CLOSURE_BASELINE_RATIO } from './cameraScoringConstants.js'

export const DEFAULT_OPEN_EYE_EAR = 0.28

const MIN_PLAUSIBLE_EAR = 0.08
const MAX_PLAUSIBLE_EAR = 0.60
const OPEN_SAMPLE_MIN_RATIO = 0.80
const OPEN_SAMPLE_MAX_RATIO = 1.25

function median(values) {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

/**
 * Robust personal open-eye reference learned while the calibration UI asks the
 * user to look at the screen. A median tolerates ordinary blinks without the
 * absolute EAR cutoff that varies with anatomy and landmark geometry.
 */
export function personalOpenEyeBaseline(samples, fallback = DEFAULT_OPEN_EYE_EAR) {
  const plausible = Array.isArray(samples)
    ? samples.filter(value => Number.isFinite(value) && value >= MIN_PLAUSIBLE_EAR && value <= MAX_PLAUSIBLE_EAR)
    : []
  return plausible.length ? median(plausible) : fallback
}

export function isOpenEyeSample(ear, baseline) {
  if (!Number.isFinite(ear) || !Number.isFinite(baseline) || baseline <= 0) return false
  const ratio = ear / baseline
  return ratio >= OPEN_SAMPLE_MIN_RATIO && ratio <= OPEN_SAMPLE_MAX_RATIO
}

export function eyeClosureRatio(ear, baseline) {
  if (!Number.isFinite(ear) || !Number.isFinite(baseline) || baseline <= 0) return null
  return ear / baseline
}

export function hasSubstantialEyeClosure(ear, baseline) {
  const ratio = eyeClosureRatio(ear, baseline)
  return ratio != null && ratio <= EYE_CLOSURE_BASELINE_RATIO
}
