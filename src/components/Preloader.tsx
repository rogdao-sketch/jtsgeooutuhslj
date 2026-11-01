import { useEffect, useRef, useState } from 'react'
import { load } from '../lib/load'

const RAMP = ' .:-=+*#'
const LEN = 12
const MIN_MS = 2600

export function Preloader({ onDone }: { onDone: () => void }) {
  const [text, setText] = useState(''.padEnd(LEN, '-'))
  const [gone, setGone] = useState(false)
  const start = useRef(performance.now())

  useEffect(() => {
    let raf = 0
    let finished = false
    const tick = () => {
      const now = performance.now()
      const t = (now - start.current) / 1000
      const shown = Math.min(load.progress / 100, (now - start.current) / MIN_MS)
      let s = ''
      for (let i = 0; i < LEN; i++) {
        const wave = Math.sin(t * 3.1 + i * 0.85) * 0.5 + 0.5
        const filled = i / LEN < shown
        const lvl = filled ? 4 + Math.floor(wave * 3.99) : Math.floor(wave * 3.2)
        s += RAMP[Math.min(lvl, RAMP.length - 1)]
      }
      setText(s)
      if (!finished && shown >= 1) {
        finished = true
        setTimeout(() => { setGone(true); setTimeout(onDone, 900) }, 350)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [onDone])

  return (
    <div className={`preloader${gone ? ' preloader--gone' : ''}`} aria-hidden>
      <pre>{text}</pre>
    </div>
  )
}
