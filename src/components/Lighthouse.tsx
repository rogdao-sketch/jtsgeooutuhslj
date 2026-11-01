import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { applyTriplanar, triMaps } from '../lib/triplanar'
import { useRayHover } from '../lib/hover'
import { HoverNet } from './HoverNet'

const BASE = import.meta.env.BASE_URL
const MODEL = `${BASE}models/lighthouse.glb`
const DRACO = `${BASE}draco/`
export const LAMP_Y = 7.02

/**
 * The masonry is one merged mesh. Split it back into stones: weld vertices by position,
 * union-find over triangles, then store each stone's centre and a random value per vertex.
 */
function tagStones(g: THREE.BufferGeometry) {
  const pos = g.attributes.position as THREE.BufferAttribute
  const n = pos.count
  const weld = new Int32Array(n)
  const seen = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(pos.getX(i) * 2000)},${Math.round(pos.getY(i) * 2000)},${Math.round(pos.getZ(i) * 2000)}`
    const j = seen.get(k)
    if (j === undefined) { seen.set(k, i); weld[i] = i } else weld[i] = j
  }
  const parent = new Int32Array(n).map((_, i) => i)
  const find = (a: number): number => { while (parent[a] !== a) { parent[a] = parent[parent[a]]; a = parent[a] } return a }
  const join = (a: number, b: number) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb }
  const idx = g.index
  const tri = idx ? idx.count : n
  for (let t = 0; t < tri; t += 3) {
    const a = weld[idx ? idx.getX(t) : t], b = weld[idx ? idx.getX(t + 1) : t + 1], c = weld[idx ? idx.getX(t + 2) : t + 2]
    join(a, b); join(b, c)
  }
  const sum = new Map<number, [number, number, number, number]>()
  for (let i = 0; i < n; i++) {
    const r = find(weld[i])
    const s = sum.get(r) ?? [0, 0, 0, 0]
    s[0] += pos.getX(i); s[1] += pos.getY(i); s[2] += pos.getZ(i); s[3]++
    sum.set(r, s)
  }
  const stones: { c: THREE.Vector3; r: number }[] = []
  const index = new Map<number, number>()
  sum.forEach((s, r) => { index.set(r, stones.length); stones.push({ c: new THREE.Vector3(s[0] / s[3], s[1] / s[3], s[2] / s[3]), r: Math.random() }) })
  const center = new Float32Array(n * 3), rand = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const st = stones[index.get(find(weld[i]))!]
    center[i * 3] = st.c.x; center[i * 3 + 1] = st.c.y; center[i * 3 + 2] = st.c.z
    rand[i] = st.r
  }
  g.setAttribute('aCenter', new THREE.BufferAttribute(center, 3))
  g.setAttribute('aRand', new THREE.BufferAttribute(rand, 1))
  return stones
}

const HOVER_R = 1.9

/** Mirrors the vertex shader so the net can sit exactly on the moved stones. */
function pushStone(c: THREE.Vector3, r: number, hit: THREE.Vector3, amt: number, out: THREE.Vector3) {
  let hd = amt * (1 - THREE.MathUtils.smoothstep(c.distanceTo(hit), 0, HOVER_R))
  hd = hd * hd * (3 - 2 * hd)
  const len = Math.max(Math.hypot(c.x, c.z), 1e-4)
  const rx = c.x / len, rz = c.z / len
  const side = r * 2 - 1
  const out1 = hd * (0.1 + 0.3 * ((r * 7.31) % 1))
  out.set(c.x + rx * out1 - rz * hd * side * 0.16, c.y + hd * (((r * 3.7) % 1) - 0.5) * 0.1, c.z + rz * out1 + rx * hd * side * 0.16)
  return out
}

export function Lighthouse() {
  const { scene } = useGLTF(MODEL, DRACO)
  const hoverU = useMemo(() => ({ uHover: { value: new THREE.Vector3(0, -50, 0) }, uHoverAmt: { value: 0 }, uHoverR: { value: HOVER_R } }), [])
  const state = useRef({ version: 0, picked: [] as number[], pickedAt: new THREE.Vector3(0, -50, 0) })
  const proxy = useRef<THREE.Mesh>(null)
  const hov = useRayHover(proxy, 1.4)
  const flash = useRef(0)

  const { tower, stones, core } = useMemo(() => {
    let tower: THREE.Mesh | null = null
    let core: THREE.MeshStandardMaterial | null = null
    let stones: { c: THREE.Vector3; r: number }[] = []
    scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (!m.isMesh) return
      const mat = m.material as THREE.MeshStandardMaterial
      const glass = /Glass/i.test(mat.name)
      const lit = /Lamp|Lens/i.test(mat.name)
      m.castShadow = !glass && !lit
      m.receiveShadow = !glass && !lit
      if (glass) { mat.transparent = true; mat.opacity = 0.18; mat.depthWrite = false; mat.roughness = 0.05; mat.metalness = 0.2 }
      if (lit) { mat.toneMapped = false; mat.emissiveIntensity = /Lamp/i.test(mat.name) ? 9 : 1.6 }
      if (!/Stone/i.test(mat.name)) return
      const own = mat.clone()
      own.roughness = 0.95
      own.envMapIntensity = 0.6
      if (/Tower_Masonry/.test(m.name)) {
        tower = m
        own.color.setRGB(0.74, 0.77, 0.83)
        stones = tagStones(m.geometry)
        applyTriplanar(own, triMaps('rock_boulder_dry'), {
          scale: 1.4, mix: 0.7, normal: 0.55, snow: 0.55, key: 'masonry',
          extra: (shader) => {
            Object.assign(shader.uniforms, hoverU)
            shader.vertexShader = shader.vertexShader
              .replace('#include <common>', `#include <common>
                attribute vec3 aCenter; attribute float aRand;
                uniform vec3 uHover; uniform float uHoverAmt; uniform float uHoverR;
                varying float vHover;`)
              .replace('#include <begin_vertex>', `#include <begin_vertex>
                float hd = uHoverAmt * (1.0 - smoothstep(0.0, uHoverR, distance(aCenter, uHover)));
                hd = hd * hd * (3.0 - 2.0 * hd);
                vec2 rad = aCenter.xz / max(length(aCenter.xz), 1e-4);
                vec2 tg = vec2(-rad.y, rad.x);
                float side = aRand * 2.0 - 1.0;
                transformed.xz += rad * hd * (0.1 + 0.3 * fract(aRand * 7.31)) + tg * hd * side * 0.16;
                transformed.y += hd * (fract(aRand * 3.7) - 0.5) * 0.1;
                vHover = hd;`)
            shader.fragmentShader = shader.fragmentShader
              .replace('#include <common>', '#include <common>\nvarying float vHover;')
              .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
                totalEmissiveRadiance += vec3(1.0, 0.72, 0.42) * vHover * 0.28;`)
          },
        })
      } else if (/Tower_Core/.test(m.name)) {
        own.emissive = new THREE.Color('#ffb066')
        own.emissiveIntensity = 0
        core = own
      } else {
        const rock = /Cliff|Boulders/i.test(m.name)
        applyTriplanar(own, triMaps(rock ? 'rock_face_03' : 'rock_boulder_dry'),
          rock ? { scale: 0.45, mix: 0.85, normal: 0.9, snow: 0.95, key: 'cliff' } : { scale: 1.4, mix: 0.7, normal: 0.55, snow: 0.8, key: 'trim' })
      }
      m.material = own
    })
    return { tower: tower as THREE.Mesh | null, stones, core: core as THREE.MeshStandardMaterial | null }
  }, [scene, hoverU])

  const light = useRef<THREE.PointLight>(null)
  const local = useMemo(() => new THREE.Vector3(), [])

  useFrame((_, dt) => {
    const s = state.current
    const h = hov.current
    flash.current = Math.min(1, flash.current + dt * 1.6)
    if (h.target && tower) {
      local.copy(h.point)
      tower.worldToLocal(local)
      hoverU.uHover.value.lerp(local, h.amt < 0.02 ? 1 : 1 - Math.exp(-dt * 3))
    }
    hoverU.uHoverAmt.value = h.amt
    const a = h.amt
    if (core) core.emissiveIntensity = a * 2.5
    if (light.current && tower) {
      light.current.intensity = a * 6
      light.current.position.copy(hoverU.uHover.value)
      tower.localToWorld(light.current.position)
    }
    // pick the stones nearest to the cursor again once it has moved far enough
    if (h.target && hoverU.uHover.value.distanceTo(s.pickedAt) > 0.9) {
      s.pickedAt.copy(hoverU.uHover.value)
      s.picked = stones.map((st, i) => [st.c.distanceToSquared(s.pickedAt), i]).sort((x, y) => x[0] - y[0]).slice(0, 7).map((x) => x[1])
        // order around the cursor so the polyline does not cross itself
        .sort((x, y) => Math.atan2(stones[x].c.y - s.pickedAt.y, stones[x].c.x - s.pickedAt.x) - Math.atan2(stones[y].c.y - s.pickedAt.y, stones[y].c.x - s.pickedAt.x))
      s.version++
      flash.current = 0
    }
  })

  const netPoints = (out: THREE.Vector3[]) => {
    if (!tower) return 0
    const s = state.current
    s.picked.forEach((i, k) => {
      const st = stones[i]
      pushStone(st.c, st.r, hoverU.uHover.value, hoverU.uHoverAmt.value, out[k])
      // a little in front of the stone face
      const len = Math.max(Math.hypot(out[k].x, out[k].z), 1e-4)
      out[k].x += (out[k].x / len) * 0.14; out[k].z += (out[k].z / len) * 0.14
      tower.localToWorld(out[k])
    })
    return s.picked.length
  }

  return (
    <group>
      <primitive object={scene} />
      {/* invisible hit shape around the tower */}
      <mesh ref={proxy} position={[0, 3.5, 0]} visible={false}>
        <cylinderGeometry args={[0.78, 1.25, 5.3, 24, 1, false]} />
        <meshBasicMaterial />
      </mesh>
      <pointLight ref={light} color="#ffb47a" intensity={0} distance={3.5} decay={2} />
      <HoverNet points={netPoints} amount={() => { const f = flash.current; return hoverU.uHoverAmt.value * f * f * (3 - 2 * f) }} version={() => state.current.version} />
    </group>
  )
}
