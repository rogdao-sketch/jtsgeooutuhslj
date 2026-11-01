import * as THREE from 'three'
import { DARK, segment } from './journey'

/** What the camera is looking at; depth of field keeps it sharp. */
export const focus = new THREE.Vector3()

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// one keyframe per chapter: where the camera stands and what it looks at
const POS = [v(0.8, 0.9, 15.5), v(0, -68.6, 9), v(0, -137.6, 13), v(0, -209.4, 10.5), v(0, -278.2, 15), v(0, -257, 1.5)]
const LOOK = [v(0, 0.2, 0), v(0, -70, 0), v(0, -140, 0), v(0, -210, 0), v(0, -280.1, 0), v(0, -282, 0)]

/**
 * Veiled transitions never travel the whole way: the camera drifts out of the old scene
 * (EXIT), the fog closes, it jumps, then settles into the new scene from ENTER.
 * Nothing is ever flown through, so no clipping into the ground.
 */
const EXIT = [v(0, 5, -3), v(3, 2.5, -2), v(0, 0, -17), v(0, 4, -2)]
const ENTER = [v(0, 5, 4), v(0, 1, 9), v(0, 1.5, 7), v(0, 3, 6)]

const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const tmp = new THREE.Vector3()

export function cameraAt(p: number, outPos: THREE.Vector3, outLook: THREE.Vector3) {
  const { i, e } = segment(p)
  if (!DARK[i]) {
    outPos.lerpVectors(POS[i], POS[i + 1], e)
    outLook.lerpVectors(LOOK[i], LOOK[i + 1], e)
    return
  }
  if (e < 0.5) {
    const k = ease(e * 2)
    tmp.copy(EXIT[i]).multiplyScalar(k)
    outPos.copy(POS[i]).add(tmp)
    // through the portal the gaze travels with the camera, elsewhere it stays on the subject a while
    outLook.copy(LOOK[i]).addScaledVector(EXIT[i], i === 2 ? k : k * 0.4)
  } else {
    const k = 1 - ease((e - 0.5) * 2)
    tmp.copy(ENTER[i]).multiplyScalar(k)
    outPos.copy(POS[i + 1]).add(tmp)
    outLook.copy(LOOK[i + 1]).addScaledVector(ENTER[i], k * 0.3)
  }
}
