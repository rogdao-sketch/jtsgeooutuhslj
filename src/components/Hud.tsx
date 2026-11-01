import { useEffect, useRef, useState } from 'react'
import { Contact } from './Contact'
import { sound } from '../lib/sound'
import { CHAPTERS, chapterAt, darknessAt, progress } from '../lib/journey'

export function Hud({ visible }: { visible: boolean }) {
  const [idx, setIdx] = useState(0)
  const bar = useRef<HTMLSpanElement>(null)
  const veil = useRef<HTMLDivElement>(null)
  const [soundOn, setSoundOn] = useState(sound.on)
  useEffect(() => sound.subscribe(setSoundOn), [])
  const first = useRef(true)
  useEffect(() => { if (first.current) { first.current = false; return } sound.whoosh() }, [idx])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const i = chapterAt(progress.v)
      setIdx((cur) => (cur === i ? cur : i))
      if (bar.current) bar.current.style.transform = `scaleX(${progress.v})`
      if (veil.current) veil.current.style.opacity = String(darknessAt(progress.v))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const ch = CHAPTERS[idx]
  const n = String(idx + 1).padStart(2, '0')
  return (
    <>
    <div className="veil" ref={veil} />
    <Contact on={visible && idx === CHAPTERS.length - 1} />
    <div className={`hud${visible ? ' hud--on' : ''}`}>
      <div className="hud__tl"><b>REDIS</b><span>веб-студия / 3D / WebGL</span></div>
      <div className="hud__tr"><span>{ch.tag}</span><span>{n} / {String(CHAPTERS.length).padStart(2, '0')}</span></div>
      <div className={`hud__bl${idx === 0 ? '' : ' hud__bl--off'}`}><span>листайте вниз</span><i /></div>
      <div className="hud__bc" key={idx}><span>{ch.line}</span>{ch.note && <em>{ch.note}</em>}</div>
      <div className="hud__bar"><span ref={bar} /></div>
      <button type="button" className={`hud__snd${soundOn ? ' hud__snd--on' : ''}`} onClick={() => sound.toggle()} aria-pressed={soundOn}>
        <span className="hud__eq" aria-hidden><i /><i /><i /><i /></span>
        Звук {soundOn ? 'вкл' : 'выкл'}
      </button>
    </div>
    </>
  )
}
