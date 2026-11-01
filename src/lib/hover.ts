import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/** Which hover target owns the cursor right now; the terrain grid steps back while an object is hovered. */
export const hoverState = { object: false, owner: null as object | null }

/** Random readout numbers for the hover net: 1..100. */
export const randomLabel = () => 1 + Math.floor(Math.random() * 100)

export const ray = new THREE.Raycaster()

export interface HoverInfo {
  /** 0 or 1: is the cursor over the target */
  target: number
  /** smoothed 0..1 */
  amt: number
  /** last world-space hit point */
  point: THREE.Vector3
  /** bumps on every new hover, used to re-roll the numbers */
  version: number
}

/**
 * Hover by casting the cursor ray against an (invisible) proxy mesh every frame.
 * Pointer events on meshes are unreliable here (fixed canvas under a scrolling page), the pointer itself is not.
 */
export function useRayHover(proxy: React.RefObject<THREE.Object3D | null>, rate = 3) {
  const s = useRef<HoverInfo>({ target: 0, amt: 0, point: new THREE.Vector3(), version: 0 })
  const hits = useRef<THREE.Intersection[]>([])
  useFrame(({ camera, pointer }, dt) => {
    const h = s.current
    const obj = proxy.current
    let over = false
    if (obj && isShown(obj) && (!hoverState.owner || hoverState.owner === s.current)) {
      ray.setFromCamera(pointer, camera)
      hits.current.length = 0
      obj.raycast(ray, hits.current)
      if (hits.current.length) {
        hits.current.sort((a, b) => a.distance - b.distance)
        h.point.copy(hits.current[0].point)
        over = true
      }
    }
    if (over && !h.target) h.version++
    h.target = over ? 1 : 0
    if (over) { hoverState.owner = s.current; hoverState.object = true }
    else if (hoverState.owner === s.current) { hoverState.owner = null; hoverState.object = false }
    // eased in time, not per frame: same feel at 60 and 144 fps
    h.amt += (h.target - h.amt) * (1 - Math.exp(-Math.min(dt, 0.1) * rate))
  })
  return s
}

function isShown(o: THREE.Object3D) {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (!p.visible && p !== o) return false
  return true
}
