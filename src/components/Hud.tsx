import { useEffect, useRef, useState } from 'react'
import { Contact } from './Contact'
import { CHAPTERS, chapterAt, progress } from '../lib/journey'

export function Hud({ visible }: { visible: boolean }) {
  const [idx, setIdx] = useState(0)
  const bar = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const i = chapterAt(progress.v)
      setIdx((cur) => (cur === i ? cur : i))
      if (bar.current) bar.current.style.transform = `scaleX(${progress.v})`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const ch = CHAPTERS[idx]
  const n = String(idx + 1).padStart(2, '0')
  return (
    <>
    <Contact on={visible && idx === CHAPTERS.length - 1} />
    <div className={`hud${visible ? ' hud--on' : ''}`}>
      <div className="hud__tl"><b>REDIS</b><span>веб-студия / 3D / WebGL</span></div>
      <div className="hud__tr"><span>{ch.tag}</span><span>{n} / {String(CHAPTERS.length).padStart(2, '0')}</span></div>
      <div className={`hud__bl${idx === 0 ? '' : ' hud__bl--off'}`}><span>листайте вниз</span><i /></div>
      <div className="hud__bc" key={idx}><span>{ch.line}</span>{ch.note && <em>{ch.note}</em>}</div>
      <div className="hud__bar"><span ref={bar} /></div>
    </div>
    </>
  )
}
