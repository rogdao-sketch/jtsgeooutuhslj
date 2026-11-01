import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js'
import { applyTriplanar, triMaps } from '../lib/triplanar'
import { hoverState, randomLabel, ray } from '../lib/hover'
import { progress } from '../lib/journey'
import { quality } from '../lib/quality'

const perlin = new ImprovedNoise()
const fbm = (x: number, z: number, oct: number, seed = 0) => {
  let v = 0, a = 0.5, f = 1
  for (let i = 0; i < oct; i++) { v += a * perlin.noise(x * f, seed + i * 7.1, z * f); f *= 2.02; a *= 0.5 }
  return v
}
const smooth = THREE.MathUtils.smoothstep

/** Snowy highland: a calm plateau around the lighthouse, drifts in the middle, ridged mountains far away. */
export function heightAt(x: number, z: number) {
  const d = Math.hypot(x, z)
  const plateau = smooth(d, 5, 16)
  const drifts = fbm(x * 0.05, z * 0.05, 4, 3) * 2.2 + fbm(x * 0.2, z * 0.2, 2, 9) * 0.25
  const r = 1 - Math.abs(fbm(x * 0.014, z * 0.014, 5, 1))
  const ridges = r * r * r * 34 * smooth(d, 28, 95)
  const near = fbm(x * 0.3, z * 0.3, 3, 5) * 0.2
  // snow drift piled around the lighthouse rock, so the cliff sits in the ground instead of on it
  const mound = 1.05 * Math.exp(-((d / 4.3) ** 2)) * (1 + 0.25 * fbm(x * 0.6, z * 0.6, 2, 11))
  return -3.95 + mound + (1 - plateau) * near + plateau * (drifts + ridges)
}

const SIZE = 300
const SEG = quality.terrainSeg

export function Terrain() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG)
    g.rotateX(-Math.PI / 2)
    const p = g.attributes.position
    for (let i = 0; i < p.count; i++) p.setY(i, heightAt(p.getX(i), p.getZ(i)))
    g.computeVertexNormals()
    return g
  }, [])

  const uniforms = useMemo(() => ({ uHit: { value: new THREE.Vector3(0, -100, 0) }, uHitAmt: { value: 0 }, uTime: { value: 0 } }), [])
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.42, 0.45, 0.52), roughness: 0.95 })
    applyTriplanar(m, triMaps('rock_face_03'), {
      scale: 0.22, mix: 0.8, normal: 1.0, snow: 1.0, key: 'terrain',
      extra: (shader) => {
        Object.assign(shader.uniforms, uniforms)
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uHit;\nuniform float uHitAmt;\nuniform float uTime;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            {
              // survey grid around the cursor: square grid, height contours and a pulsing ring
              float dh = distance(vTriPos.xz, uHit.xz);
              float m = uHitAmt * (1.0 - smoothstep(1.0, 6.5, dh));
              vec2 gp = vTriPos.xz / 0.8;
              vec2 g = abs(fract(gp - 0.5) - 0.5) / max(fwidth(gp), vec2(1e-4));
              float line = 1.0 - min(min(g.x, g.y), 1.0);
              float cy = vTriPos.y * 3.0;
              float c = abs(fract(cy - 0.5) - 0.5) / max(fwidth(cy), 1e-4);
              float contour = 1.0 - min(c, 1.0);
              float ring = 1.0 - smoothstep(0.0, 0.05, abs(dh - (1.4 + 0.25 * sin(uTime * 2.0))));
              totalEmissiveRadiance += vec3(0.8, 0.9, 1.0) * (line * 0.8 + contour * 0.45 + ring * 0.9) * m * 1.3;
            }`)
      },
    })
    return m
  }, [uniforms])

  const label = useRef<THREE.Group>(null)
  const text = useRef<HTMLSpanElement>(null)
  const hit = useMemo(() => new THREE.Vector3(), [])
  const last = useMemo(() => new THREE.Vector3(0, -100, 0), [])
  const p = useMemo(() => new THREE.Vector3(), [])

  useFrame(({ camera, pointer, clock }) => {
    uniforms.uTime.value = clock.elapsedTime
    let found = false
    if (progress.v < 0.12 && !hoverState.object) {
      // march the cursor ray over the height field (cheaper than raycasting 200k triangles)
      ray.setFromCamera(pointer, camera)
      const o = ray.ray.origin, d = ray.ray.direction
      let t0 = 0
      for (let t = 0.5; t < 160; t += 0.6) {
        p.copy(o).addScaledVector(d, t)
        if (p.y < heightAt(p.x, p.z)) {
          let lo = t0, hi = t
          for (let k = 0; k < 8; k++) {
            const mid = (lo + hi) / 2
            p.copy(o).addScaledVector(d, mid)
            if (p.y < heightAt(p.x, p.z)) hi = mid; else lo = mid
          }
          hit.copy(o).addScaledVector(d, hi)
          found = true
          break
        }
        t0 = t
      }
    }
    if (found) {
      uniforms.uHit.value.lerp(hit, uniforms.uHitAmt.value < 0.05 ? 1 : 0.25)
      if (hit.distanceTo(last) > 1.5) { last.copy(hit); if (text.current) text.current.textContent = `${randomLabel()} · ${randomLabel()}` }
    }
    uniforms.uHitAmt.value += ((found ? 1 : 0) - uniforms.uHitAmt.value) * 0.08
    if (label.current) label.current.position.copy(uniforms.uHit.value).add(new THREE.Vector3(0, 0.6, 0))
    if (text.current) text.current.style.opacity = String(uniforms.uHitAmt.value)
  })

  return (
    <group>
      <mesh geometry={geo} material={mat} receiveShadow />
      <group ref={label}>
        <Html zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
          <span className="net-label net-label--ground" ref={text}>00 · 00</span>
        </Html>
      </group>
    </group>
  )
}
