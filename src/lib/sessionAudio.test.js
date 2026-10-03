// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AMBIENT_LABELS,
  AMBIENT_MODES,
  createAmbientSource,
  getSessionAudioContext,
  playAlertSound,
  playGentleReminderSound,
} from './sessionAudio'

function audioParam() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  }
}

function createFakeContext() {
  const destination = {}
  const sources = []
  const gains = []
  const filters = []
  const oscillators = []
  const context = {
    state: 'running',
    currentTime: 10,
    sampleRate: 4,
    destination,
    resume: vi.fn(),
    createBuffer: vi.fn((_channels, size) => ({
      getChannelData: () => new Float32Array(size),
    })),
    createBufferSource: vi.fn(() => {
      const source = { connect: vi.fn(), start: vi.fn(), stop: vi.fn(), loop: false, buffer: null }
      sources.push(source)
      return source
    }),
    createGain: vi.fn(() => {
      const gain = { connect: vi.fn(), gain: audioParam() }
      gains.push(gain)
      return gain
    }),
    createBiquadFilter: vi.fn(() => {
      const filter = { connect: vi.fn(), frequency: { value: 0 }, type: '' }
      filters.push(filter)
      return filter
    }),
    createOscillator: vi.fn(() => {
      const oscillator = {
        connect: vi.fn(),
        frequency: audioParam(),
        start: vi.fn(),
        stop: vi.fn(),
        type: '',
      }
      oscillators.push(oscillator)
      return oscillator
    }),
    sources,
    gains,
    filters,
    oscillators,
  }
  return context
}

describe('session audio', () => {
  let context

  beforeEach(() => {
    const bootstrapContext = createFakeContext()
    window.AudioContext = vi.fn(function MockAudioContext() { return bootstrapContext })
    getSessionAudioContext().state = 'closed'
    context = createFakeContext()
    window.AudioContext = vi.fn(function MockAudioContext() { return context })
  })

  it('exposes stable ambient choices and reuses an open context', () => {
    const first = getSessionAudioContext()
    const second = getSessionAudioContext()

    expect(first).toBe(second)
    expect(AMBIENT_MODES).toEqual(['off', 'rain', 'white', 'brown'])
    expect(AMBIENT_LABELS.rain).toBe('Rain')
  })

  it('plays the alert and gentle reminder envelopes', () => {
    playAlertSound()
    playGentleReminderSound()

    expect(context.oscillators).toHaveLength(4)
    expect(context.oscillators.every(oscillator => oscillator.start.mock.calls.length === 1)).toBe(true)
    expect(context.gains.length).toBeGreaterThanOrEqual(5)
  })

  it.each(['white', 'brown', 'rain', 'off'])('creates a connected %s ambient source', (mode) => {
    const result = createAmbientSource(context, mode)

    expect(result.source.loop).toBe(true)
    expect(result.gain.connect).toHaveBeenCalledWith(context.destination)
    if (mode === 'rain') {
      expect(context.filters.at(-1).type).toBe('lowpass')
      expect(context.filters.at(-1).connect).toHaveBeenCalledWith(result.gain)
    } else {
      expect(result.source.connect).toHaveBeenCalledWith(result.gain)
    }
  })

  it('resumes a suspended audio context before playing', () => {
    const active = getSessionAudioContext()
    active.state = 'suspended'

    playAlertSound()

    expect(active.resume).toHaveBeenCalledOnce()
  })
})
