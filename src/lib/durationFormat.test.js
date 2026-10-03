import { describe, expect, it } from 'vitest'
import { formatDuration, formatDurationCompact, formatMinutes, formatTimer } from './durationFormat'

describe('duration display policy', () => {
  it('uses seconds and minutes below one hour', () => {
    expect(formatDuration(42)).toBe('42s')
    expect(formatDuration(38 * 60 + 12)).toBe('38m 12s')
    expect(formatDuration(59 * 60)).toBe('59m')
  })

  it('rounds once before choosing the display unit', () => {
    expect(formatDuration(59.4)).toBe('59s')
    expect(formatDuration(59.6)).toBe('1m')
    expect(formatDuration(3599.4)).toBe('59m 59s')
    expect(formatDuration(3599.6)).toBe('1h')
  })

  it('switches every duration to hours at one hour', () => {
    expect(formatDuration(60 * 60)).toBe('1h')
    expect(formatDuration(90 * 60)).toBe('1h 30m')
    expect(formatDuration(2 * 60 * 60 + 59)).toBe('2h 59s')
    expect(formatMinutes(120)).toBe('2h')
  })

  it('uses an hour field for running clocks', () => {
    expect(formatTimer(59 * 60 + 59)).toBe('59:59')
    expect(formatTimer(60 * 60)).toBe('1:00:00')
    expect(formatTimer(90 * 60 + 5)).toBe('1:30:05')
  })

  it('normalizes invalid inputs and fractional planned minutes', () => {
    expect(formatDuration(Number.NaN)).toBe('0s')
    expect(formatDuration(-30)).toBe('0s')
    expect(formatMinutes(60.5)).toBe('1h 30s')
  })
})

describe('formatDurationCompact', () => {
  it('rounds summaries to the minute and keeps seconds only below one minute', () => {
    expect(formatDurationCompact(0)).toBe('0s')
    expect(formatDurationCompact(45)).toBe('45s')
    expect(formatDurationCompact(89)).toBe('1m')
    expect(formatDurationCompact(90)).toBe('2m')
    expect(formatDurationCompact(22174)).toBe('6h 10m')
    expect(formatDurationCompact(7200 + 40)).toBe('2h 1m')
    expect(formatDurationCompact(7200 + 20)).toBe('2h')
  })
})
