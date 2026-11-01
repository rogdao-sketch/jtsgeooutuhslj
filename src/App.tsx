import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react'
import Lenis from 'lenis'
import { Preloader } from './components/Preloader'
import { Hud } from './components/Hud'
import { progress } from './lib/journey'
import { REDUCED, hasWebGL2 } from './lib/quality'
import { Fallback } from './components/Fallback'

// three.js and the whole scene load as a separate chunk while the preloader runs
const Scene = lazy(() => import('./components/Scene'))

export default function App() {
  return hasWebGL2 ? <Journey /> : <Fallback />
}

function Journey() {
  const [ready, setReady] = useState(false)
  const lenis = useRef<Lenis | null>(null)
  const onDone = useCallback(() => setReady(true), [])

  useEffect(() => {
    history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)
    const l = new Lenis({ lerp: REDUCED ? 1 : 0.09, wheelMultiplier: 0.9 })
    lenis.current = l
    l.stop()
    l.on('scroll', ({ scroll, limit }: { scroll: number; limit: number }) => {
      progress.raw = limit > 0 ? Math.min(1, Math.max(0, scroll / limit)) : 0
    })
    let raf = 0
    const tick = (t: number) => { l.raf(t); raf = requestAnimationFrame(tick) }
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); l.destroy() }
  }, [])

  useEffect(() => { if (ready) lenis.current?.start() }, [ready])

  return (
    <>
      <Suspense fallback={null}><Scene ready={ready} /></Suspense>
      <Hud visible={ready} />
      {!ready && <Preloader onDone={onDone} />}
      <div className="vignette" />
      <div className="scroller" />
    </>
  )
}
