import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OPEN_EYE_EAR,
  eyeClosureRatio,
  hasSubstantialEyeClosure,
  isOpenEyeSample,
  personalOpenEyeBaseline,
} from './ocularAttention'

describe('personal ocular attention boundary', () => {
  it('uses a robust personal median instead of one absolute EAR threshold', () => {
    expect(personalOpenEyeBaseline([0.31, 0.30, 0.08, 0.32, 0.29])).toBe(0.30)
    expect(personalOpenEyeBaseline([], DEFAULT_OPEN_EYE_EAR)).toBe(DEFAULT_OPEN_EYE_EAR)
  })

  it('classifies substantial closure relative to the same person', () => {
    expect(hasSubstantialEyeClosure(0.16, 0.30)).toBe(true)
    expect(hasSubstantialEyeClosure(0.18, 0.30)).toBe(false)
    expect(hasSubstantialEyeClosure(0.11, 0.20)).toBe(true)
    expect(eyeClosureRatio(0.15, 0.30)).toBeCloseTo(0.5)
  })

  it('only drifts the baseline from plausible open-eye samples', () => {
    expect(isOpenEyeSample(0.30, 0.30)).toBe(true)
    expect(isOpenEyeSample(0.12, 0.30)).toBe(false)
    expect(isOpenEyeSample(0.50, 0.30)).toBe(false)
    expect(isOpenEyeSample(NaN, 0.30)).toBe(false)
  })
})
