let sharedAudioContext = null

function getAudioContext() {
  if (!sharedAudioContext || sharedAudioContext.state === 'closed') {
    sharedAudioContext = new (window.AudioContext || window.webkitAudioContext)()
  }
  return sharedAudioContext
}

export function playAlertSound() {
  try {
    const context = getAudioContext()
    if (context.state === 'suspended') context.resume()
    const startTime = context.currentTime

    const pulses = [
      { startFrequency: 880, endFrequency: 550, start: 0, duration: 0.9 },
      { startFrequency: 660, endFrequency: 440, start: 1.1, duration: 0.9 },
    ]

    pulses.forEach(({ startFrequency, endFrequency, start, duration }) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(startFrequency, startTime + start)
      oscillator.frequency.exponentialRampToValueAtTime(endFrequency, startTime + start + duration * 0.7)
      gain.gain.setValueAtTime(0.0001, startTime + start)
      gain.gain.linearRampToValueAtTime(0.42, startTime + start + 0.06)
      gain.gain.setValueAtTime(0.42, startTime + start + duration * 0.5)
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + start + duration)
      oscillator.start(startTime + start)
      oscillator.stop(startTime + start + duration)
    })
  } catch {
    // Sound is a best-effort intervention; session scoring must continue.
  }
}

export function playGentleReminderSound() {
  try {
    const context = getAudioContext()
    if (context.state === 'suspended') context.resume()

    const master = context.createGain()
    master.gain.setValueAtTime(0.0001, context.currentTime)
    master.gain.linearRampToValueAtTime(0.035, context.currentTime + 0.08)
    master.gain.setValueAtTime(0.035, context.currentTime + 0.55)
    master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.25)
    master.connect(context.destination)

    const notes = [
      { frequency: 523.25, start: 0, stop: 0.75 },
      { frequency: 659.25, start: 0.18, stop: 1.15 },
    ]

    notes.forEach(({ frequency, start, stop }) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, context.currentTime + start)
      gain.gain.setValueAtTime(0.0001, context.currentTime + start)
      gain.gain.linearRampToValueAtTime(0.5, context.currentTime + start + 0.08)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + stop)
      oscillator.connect(gain)
      gain.connect(master)
      oscillator.start(context.currentTime + start)
      oscillator.stop(context.currentTime + stop)
    })
  } catch {
    // Sound is optional on WebViews without an available audio context.
  }
}

export const AMBIENT_MODES = ['off', 'rain', 'white', 'brown']
export const AMBIENT_LABELS = { off: 'Off', rain: 'Rain', white: 'White', brown: 'Brown' }

export function createAmbientSource(context, mode) {
  const bufferSize = context.sampleRate * 2
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate)
  const data = buffer.getChannelData(0)

  if (mode === 'white') {
    for (let index = 0; index < bufferSize; index += 1) data[index] = Math.random() * 2 - 1
  } else if (mode === 'brown' || mode === 'rain') {
    let previous = 0
    for (let index = 0; index < bufferSize; index += 1) {
      const white = Math.random() * 2 - 1
      previous = previous * 0.99 + white * 0.01
      data[index] = previous
    }
    const max = Math.max(...data.map(Math.abs))
    if (max > 0) {
      for (let index = 0; index < bufferSize; index += 1) data[index] /= max
    }
  }

  const source = context.createBufferSource()
  source.buffer = buffer
  source.loop = true

  const gain = context.createGain()
  gain.gain.value = 0.06

  if (mode === 'rain') {
    const filter = context.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 400
    source.connect(filter)
    filter.connect(gain)
  } else {
    source.connect(gain)
  }
  gain.connect(context.destination)
  return { source, gain }
}

export function getSessionAudioContext() {
  return getAudioContext()
}
