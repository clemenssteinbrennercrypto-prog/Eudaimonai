// The signature sound: a soft two-note bell when a session starts (rising)
// and when it ends (falling). Synthesised with Web Audio, so no asset ships
// and nothing is fetched. Quiet on purpose (peak gain 0.05, about a fifth of
// the drift alert) — it marks a moment, it never asks for attention. Failures
// are swallowed: a missing audio device must never break a session.
let ctx = null
let lastPlayedAt = 0

function audioContext() {
  if (typeof window === 'undefined') return null
  const Ctor = window.AudioContext || window.webkitAudioContext
  if (!Ctor) return null
  if (!ctx || ctx.state === 'closed') ctx = new Ctor()
  return ctx
}

function bell(audio, frequency, startAt, peak) {
  // A sine fundamental plus a faint octave partial gives a glassy bell
  // rather than a beep; the long exponential tail is what makes it soft.
  ;[[frequency, peak], [frequency * 2, peak * 0.18]].forEach(([freq, gainPeak]) => {
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, startAt)
    gain.gain.setValueAtTime(0.0001, startAt)
    gain.gain.linearRampToValueAtTime(gainPeak, startAt + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 1.8)
    osc.connect(gain)
    gain.connect(audio.destination)
    osc.start(startAt)
    osc.stop(startAt + 1.9)
  })
}

function play(notes) {
  const now = Date.now()
  // React StrictMode mounts twice in development; one chime per moment.
  if (now - lastPlayedAt < 1000) return
  lastPlayedAt = now
  try {
    const audio = audioContext()
    if (!audio) return
    if (audio.state === 'suspended') audio.resume()
    const t = audio.currentTime + 0.02
    notes.forEach((frequency, index) => bell(audio, frequency, t + index * 0.16, 0.05))
  } catch {
    // Sound is decoration; never let it interrupt the session.
  }
}

// D5 → A5 (a rising fifth) to begin, A5 → D5 to close.
export const playSessionStartChime = () => play([587.33, 880])
export const playSessionEndChime = () => play([880, 587.33])
