import * as THREE from 'three'
import { DARK, segment } from './journey'

/** What the camera is looking at; depth of field keeps it sharp. */
export const focus = new THREE.Vector3()

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// one keyframe per chapter: where the camera stands and what it looks at
const POS = [v(0.8, 0.9, 15.5), v(0, -68.6, 9), v(0, -137.6, 13), v(0, -209.4, 10.5), v(0, -278.2, 15), v(0, -257, 1.5)]
const LOOK = [v(0, 0.2, 0), v(0, -70, 0), v(0, -140, 0), v(0, -210, 0), v(0, -280.1, 0), v(0, -282, 0)]

/**
 * Veiled transitions are one continuous flight: the camera speeds up forward out of the old scene
 * (EXIT), cuts inside the cloud at full speed, and keeps flying forward into the new one from ENTER,
 * slowing down as it arrives. Speed never drops to zero at the cut, so the jump reads as a fly-through.
 */
const EXIT = [v(0, 3.5, -9), v(0, 0.6, -9), v(0, 0, -17), v(0, 0.8, -9)]
const ENTER = [v(0, 2.2, 9), v(0, 0.8, 9), v(0, 0.6, 9), v(0, 1.4, 9)]

const easeIn = (x: number) => x * x
const easeOut = (x: number) => 1 - (1 - x) * (1 - x)
const tmp = new THREE.Vector3()

export function cameraAt(p: number, outPos: THREE.Vector3, outLook: THREE.Vector3) {
  const { i, e } = segment(p)
  if (!DARK[i]) {
    outPos.lerpVectors(POS[i], POS[i + 1], e)
    outLook.lerpVectors(LOOK[i], LOOK[i + 1], e)
    return
  }
  if (e < 0.5) {
    const k = easeIn(e * 2)
    tmp.copy(EXIT[i]).multiplyScalar(k)
    outPos.copy(POS[i]).add(tmp)
    outLook.copy(LOOK[i]).addScaledVector(EXIT[i], k)
  } else {
    const k = 1 - easeOut((e - 0.5) * 2)
    tmp.copy(ENTER[i]).multiplyScalar(k)
    outPos.copy(POS[i + 1]).add(tmp)
    outLook.copy(LOOK[i + 1]).addScaledVector(ENTER[i], k)
  }
}
