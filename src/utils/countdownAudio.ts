let audioCtx: AudioContext | null = null

function getContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    audioCtx = new Ctor()
  }
  return audioCtx
}

/** Resume the audio context — call from a user gesture to satisfy autoplay policy. */
export function unlockAudio() {
  const ctx = getContext()
  if (ctx && ctx.state === 'suspended') void ctx.resume()
}

function tone(frequency: number, durationMs: number, gainValue = 0.15) {
  const ctx = getContext()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.value = frequency
  osc.connect(gain)
  gain.connect(ctx.destination)

  const now = ctx.currentTime
  const end = now + durationMs / 1000
  gain.gain.setValueAtTime(gainValue, now)
  gain.gain.exponentialRampToValueAtTime(0.0001, end)
  osc.start(now)
  osc.stop(end)
}

/** Countdown beep (played on 3, 2, 1). */
export function playTick() {
  tone(660, 150)
}

/** Capture tone (played at 0). */
export function playShutter() {
  tone(1040, 220, 0.2)
}
