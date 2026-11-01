/**
 * Procedural sound, no audio files: gusty wind from filtered noise, a low cold drone,
 * soft glassy pings for the hover net and a whoosh on every dive. Starts muted:
 * browsers only allow audio after a click.
 */
class Sound {
  on = false
  private ctx: AudioContext | null = null
  private master!: GainNode
  private windGain!: GainNode
  private windFilter!: BiquadFilterNode
  private rumbleGain!: GainNode
  private droneGain!: GainNode
  private listeners = new Set<(on: boolean) => void>()
  private lastPing = 0

  subscribe(fn: (on: boolean) => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn) } }

  toggle() { if (this.on) this.disable(); else this.enable() }

  enable() {
    if (!this.ctx) this.build()
    const c = this.ctx!
    void c.resume()
    this.master.gain.cancelScheduledValues(c.currentTime)
    this.master.gain.setTargetAtTime(0.7, c.currentTime, 0.6)
    this.set(true)
  }

  disable() {
    if (!this.ctx) return
    this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25)
    this.set(false)
  }

  private set(on: boolean) { this.on = on; this.listeners.forEach((f) => f(on)) }

  private build() {
    const c = new AudioContext()
    this.ctx = c
    this.master = c.createGain()
    this.master.gain.value = 0
    this.master.connect(c.destination)

    // 4 s of pink-ish noise, looped
    const len = c.sampleRate * 4
    const buf = c.createBuffer(1, len, c.sampleRate)
    const d = buf.getChannelData(0)
    let b0 = 0, b1 = 0, b2 = 0
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1
      b0 = 0.997 * b0 + w * 0.029; b1 = 0.985 * b1 + w * 0.032; b2 = 0.95 * b2 + w * 0.048
      d[i] = (b0 + b1 + b2 + w * 0.02) * 0.9
    }
    const noise = (rate: number) => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate; s.start(); return s }

    this.windFilter = c.createBiquadFilter()
    this.windFilter.type = 'bandpass'
    this.windFilter.frequency.value = 420
    this.windFilter.Q.value = 0.8
    this.windGain = c.createGain()
    this.windGain.gain.value = 0.35
    noise(1).connect(this.windFilter).connect(this.windGain).connect(this.master)

    const low = c.createBiquadFilter()
    low.type = 'lowpass'
    low.frequency.value = 160
    this.rumbleGain = c.createGain()
    this.rumbleGain.gain.value = 0.5
    noise(0.6).connect(low).connect(this.rumbleGain).connect(this.master)

    // drone: a fifth, slightly detuned, very quiet
    this.droneGain = c.createGain()
    this.droneGain.gain.value = 0.035
    this.droneGain.connect(this.master)
    for (const [f, det] of [[55, -4], [82.4, 3], [110, 6]]) {
      const o = c.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      o.detune.value = det
      o.connect(this.droneGain)
      o.start()
    }
  }

  /** Called every frame: t seconds, dive 0..1 (transition strength). */
  update(t: number, dive: number) {
    if (!this.ctx || !this.on) return
    const now = this.ctx.currentTime
    const gust = 0.5 + 0.5 * Math.sin(t * 0.31) * Math.sin(t * 0.13 + 1.7)
    this.windFilter.frequency.setTargetAtTime(320 + gust * 520 + dive * 900, now, 0.3)
    this.windGain.gain.setTargetAtTime(0.22 + gust * 0.25 + dive * 0.5, now, 0.3)
    this.rumbleGain.gain.setTargetAtTime(0.4 + dive * 0.6, now, 0.4)
    this.droneGain.gain.setTargetAtTime(0.035 * (1 - dive * 0.6), now, 0.5)
  }

  /** Glassy ping, pentatonic, for a new hover net. */
  ping() {
    if (!this.ctx || !this.on) return
    const c = this.ctx
    if (c.currentTime - this.lastPing < 0.12) return
    this.lastPing = c.currentTime
    const notes = [880, 987.8, 1174.7, 1318.5, 1568]
    const f = notes[Math.floor(Math.random() * notes.length)]
    const g = c.createGain()
    g.gain.setValueAtTime(0, c.currentTime)
    g.gain.linearRampToValueAtTime(0.07, c.currentTime + 0.01)
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.4)
    g.connect(this.master)
    for (const [mul, type] of [[1, 'sine'], [2.01, 'triangle']] as const) {
      const o = c.createOscillator()
      o.type = type
      o.frequency.value = f * mul
      o.connect(g)
      o.start()
      o.stop(c.currentTime + 1.5)
    }
  }

  /** Soft whoosh when a new chapter arrives. */
  whoosh() {
    if (!this.ctx || !this.on) return
    const c = this.ctx
    const len = c.sampleRate * 1.6
    const buf = c.createBuffer(1, len, c.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    const s = c.createBufferSource()
    s.buffer = buf
    const f = c.createBiquadFilter()
    f.type = 'bandpass'
    f.Q.value = 1.2
    f.frequency.setValueAtTime(300, c.currentTime)
    f.frequency.exponentialRampToValueAtTime(2400, c.currentTime + 0.6)
    f.frequency.exponentialRampToValueAtTime(500, c.currentTime + 1.5)
    const g = c.createGain()
    g.gain.setValueAtTime(0, c.currentTime)
    g.gain.linearRampToValueAtTime(0.12, c.currentTime + 0.5)
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 1.55)
    s.connect(f).connect(g).connect(this.master)
    s.start()
  }
}

export const sound = new Sound()
