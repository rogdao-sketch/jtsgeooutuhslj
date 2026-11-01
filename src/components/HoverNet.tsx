import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { randomLabel } from '../lib/hover'
import { darknessAt, progress } from '../lib/journey'

export interface NetNode { id: number; p: THREE.Vector3 }

const SLOTS = 12
const WANT = 8

interface Slot { id: number; w: number; target: number; p: THREE.Vector3; local: THREE.Vector3 }

interface Props {
  /** fills `out` with the nodes the net should hold right now (world space, nearest first); returns how many */
  nodes: (out: NetNode[]) => number
  /** 0..1 visibility, read every frame */
  amount: () => number
}

/**
 * A web over hovered pieces: every node is pinned to one piece (one brick, one block).
 * Pieces that come into reach fade in, those left behind fade out, and every node is
 * threaded to its two nearest neighbours, so the web re-knots itself as the cursor moves.
 */
export function HoverNet({ nodes, amount }: Props) {
  const buf = useMemo(() => Array.from({ length: WANT }, () => ({ id: -1, p: new THREE.Vector3() })), [])
  const slots = useMemo<Slot[]>(() => Array.from({ length: SLOTS }, () => ({ id: -1, w: 0, target: 0, p: new THREE.Vector3(), local: new THREE.Vector3() })), [])
  const MAXSEG = SLOTS * 2
  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXSEG * 2 * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXSEG * 2 * 3), 3))
    return g
  }, [MAXSEG])
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false }), [])
  const dotGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SLOTS * 3), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(SLOTS * 3), 3))
    return g
  }, [])
  const dotMat = useMemo(() => new THREE.PointsMaterial({ vertexColors: true, size: 5, sizeAttenuation: false, transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false, toneMapped: false }), [])
  const anchors = useRef<(THREE.Group | null)[]>([])
  const labels = useRef<(HTMLSpanElement | null)[]>([])
  const root = useRef<THREE.Group>(null)
  const seen = useMemo(() => new Set<number>(), [])

  useFrame((_, dt) => {
    // the labels are DOM and would sit on top of the transition fog: hide them while it is up
    const a = amount() * (1 - Math.min(1, darknessAt(progress.v) * 3))
    const n = a > 0.005 ? nodes(buf) : 0
    for (const s of slots) s.target = 0
    seen.clear()
    for (let k = 0; k < n; k++) {
      const { id, p } = buf[k]
      seen.add(id)
      let s = slots.find((x) => x.id === id)
      if (!s) {
        // take a free slot, or the faintest fading one
        s = slots.filter((x) => !seen.has(x.id) && x.target === 0).sort((x, y) => x.w - y.w)[0]
        if (!s) continue
        s.id = id
        s.w = 0
        const l = labels.current[slots.indexOf(s)]
        if (l) l.textContent = String(randomLabel())
      }
      s.target = 1
      s.p.copy(p)
    }
    const fade = 1 - Math.exp(-Math.min(dt, 0.1) * 5)
    for (const s of slots) {
      s.w += (s.target - s.w) * fade
      if (s.w < 0.002 && s.target === 0) s.id = -1
      s.local.copy(s.p)
      root.current?.worldToLocal(s.local)
    }

    // thread every live node to its two nearest live neighbours
    const lp = lineGeo.attributes.position as THREE.BufferAttribute
    const lc = lineGeo.attributes.color as THREE.BufferAttribute
    let seg = 0
    const live = slots.map((s, i) => [s, i] as const).filter(([s]) => s.id >= 0 && s.w > 0.01)
    const done = new Set<number>()
    for (const [s, i] of live) {
      const near = live.filter(([, j]) => j !== i).map(([o, j]) => [o.local.distanceToSquared(s.local), o, j] as const).sort((x, y) => x[0] - y[0]).slice(0, 2)
      for (const [, o, j] of near) {
        const key = Math.min(i, j) * 64 + Math.max(i, j)
        if (done.has(key) || seg >= MAXSEG) continue
        done.add(key)
        const w = Math.min(s.w, o.w) * a * 1.5
        lp.setXYZ(seg * 2, s.local.x, s.local.y, s.local.z)
        lp.setXYZ(seg * 2 + 1, o.local.x, o.local.y, o.local.z)
        lc.setXYZ(seg * 2, w, w * 1.05, w * 1.12)
        lc.setXYZ(seg * 2 + 1, w, w * 1.05, w * 1.12)
        seg++
      }
    }
    lp.needsUpdate = true
    lc.needsUpdate = true
    lineGeo.setDrawRange(0, seg * 2)

    const dp = dotGeo.attributes.position as THREE.BufferAttribute
    const dc = dotGeo.attributes.color as THREE.BufferAttribute
    slots.forEach((s, i) => {
      const w = s.id >= 0 ? s.w * a * 1.8 : 0
      dp.setXYZ(i, s.local.x, s.local.y, s.local.z)
      dc.setXYZ(i, w, w, w)
      const g = anchors.current[i]
      if (g) { g.visible = w > 0.01; g.position.copy(s.local) }
      const l = labels.current[i]
      if (l) l.style.opacity = String(s.id >= 0 ? s.w * a : 0)
    })
    dp.needsUpdate = true
    dc.needsUpdate = true
  })

  return (
    <group ref={root}>
      <lineSegments geometry={lineGeo} material={lineMat} renderOrder={20} frustumCulled={false} />
      <points geometry={dotGeo} material={dotMat} renderOrder={21} frustumCulled={false} />
      {slots.map((_, i) => (
        <group key={i} ref={(g) => { anchors.current[i] = g }}>
          <Html zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
            <span className="net-label" ref={(l) => { labels.current[i] = l }} style={{ opacity: 0 }}>{randomLabel()}</span>
          </Html>
        </group>
      ))}
    </group>
  )
}
