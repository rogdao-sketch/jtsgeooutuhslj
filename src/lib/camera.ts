import * as THREE from 'three'
import { DARK, segment } from './journey'

/** What the camera is looking at; depth of field keeps it sharp. */
export const focus = new THREE.Vector3()

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

// one keyframe per chapter: where the camera stands and what it looks at
const POS = [v(0.6, 0.3, 12.5), v(0, -69, 9.5), v(0, -137.5, 13), v(-2.2, -209, 8.5), v(0, -277.4, 12.5), v(0, -263, 3)]
const LOOK = [v(0, 0.2, 0), v(0, -70, 0), v(0, -140, 0), v(0, -210, 0), v(0, -279.2, 0), v(0, -280, 0)]

export function cameraAt(p: number, outPos: THREE.Vector3, outLook: THREE.Vector3) {
  const { i, e } = segment(p)
  outPos.lerpVectors(POS[i], POS[i + 1], e)
  outLook.lerpVectors(LOOK[i], LOOK[i + 1], e)
  // dip the gaze down first, as if diving
  outLook.y -= Math.sin(e * Math.PI) * 6 * DARK[i]
}
