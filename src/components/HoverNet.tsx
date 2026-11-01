import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { randomLabel } from '../lib/hover'
import { sound } from '../lib/sound'
import { darknessAt, progress } from '../lib/journey'

const MAX = 8
// polyline through the nodes plus a few diagonals, like a measurement overlay
const LINKS = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 0, 3, 2, 5, 1, 6]

interface Props {
  /** fills `out` with up to MAX world-space points and returns how many were written */
  points: (out: THREE.Vector3[]) => number
  /** 0..1 visibility, read every frame */
  amount: () => number
  /** changes whenever the set of nodes changes, so the numbers are rolled again */
  version: () => number
}

/** Thin lines between hovered points, cross markers and small random numbers next to them. */
export function HoverNet({ points, amount, version }: Props) {
  const pts = useMemo(() => Array.from({ length: MAX }, () => new THREE.Vector3()), [])
  const lineGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(LINKS.length * 3), 3))
    return g
  }, [])
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ color: new THREE.Color(1.6, 1.7, 1.8), transparent: true, depthTest: false, toneMapped: false }), [])
  const dotGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3))
    return g
  }, [])
  const dotMat = useMemo(() => new THREE.PointsMaterial({ color: new THREE.Color(1.8, 1.8, 1.8), size: 5, sizeAttenuation: false, transparent: true, depthTest: false, toneMapped: false }), [])
  const anchors = useRef<(THREE.Group | null)[]>([])
  const labels = useRef<(HTMLSpanElement | null)[]>([])
  const seen = useRef(-1)
  const count = useRef(0)
  const root = useRef<THREE.Group>(null)

  useFrame(() => {
    // the labels are DOM and would sit on top of the transition fog: hide them while it is up
    const a = amount() * (1 - Math.min(1, darknessAt(progress.v) * 3))
    const n = a > 0.01 ? points(pts) : 0
    count.current = n
    // points come in world space; this overlay may sit inside a moved group
    if (root.current) for (let i = 0; i < n; i++) root.current.worldToLocal(pts[i])
    if (version() !== seen.current) {
      if (seen.current !== -1 && a > 0.02) sound.ping()
      seen.current = version()
      labels.current.forEach((l) => { if (l) l.textContent = String(randomLabel()) })
    }
    const lp = lineGeo.attributes.position as THREE.BufferAttribute
    let k = 0
    for (let i = 0; i < LINKS.length; i += 2) {
      const p = LINKS[i], q = LINKS[i + 1]
      if (p < n && q < n) { lp.setXYZ(k++, pts[p].x, pts[p].y, pts[p].z); lp.setXYZ(k++, pts[q].x, pts[q].y, pts[q].z) }
    }
    lp.needsUpdate = true
    lineGeo.setDrawRange(0, k)
    const dp = dotGeo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < n; i++) dp.setXYZ(i, pts[i].x, pts[i].y, pts[i].z)
    dp.needsUpdate = true
    dotGeo.setDrawRange(0, n)
    lineMat.opacity = a * 0.85
    dotMat.opacity = a
    anchors.current.forEach((g, i) => { if (g) { g.visible = i < n; g.position.copy(pts[i]) } })
    labels.current.forEach((l, i) => { if (l) l.style.opacity = String(i < n ? a : 0) })
  })

  return (
    <group ref={root}>
      <lineSegments geometry={lineGeo} material={lineMat} renderOrder={20} frustumCulled={false} />
      <points geometry={dotGeo} material={dotMat} renderOrder={21} frustumCulled={false} />
      {pts.map((_, i) => (
        <group key={i} ref={(g) => { anchors.current[i] = g }}>
          <Html zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
            <span className="net-label" ref={(l) => { labels.current[i] = l }}>{randomLabel()}</span>
          </Html>
        </group>
      ))}
    </group>
  )
}
