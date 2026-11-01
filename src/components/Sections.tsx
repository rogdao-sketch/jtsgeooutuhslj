import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js'
import { CHAPTERS, SECTION_Y, progress } from '../lib/journey'
import { useRayHover } from '../lib/hover'
import { applyTriplanar, triMaps } from '../lib/triplanar'
import { HoverNet } from './HoverNet'
import { Depths } from './Atmosphere'

const BASE = import.meta.env.BASE_URL
const STEP = 1 / (CHAPTERS.length - 1)
const smooth = THREE.MathUtils.smoothstep
/** Signed distance from a chapter in chapter units: <0 on the way in, >0 on the way out. */
const localD = (chapter: number) => (progress.v - chapter * STEP) / STEP

/** Draws a chapter's scene only while the camera is near it. The veil hides the switch. */
function Stage({ chapter, span = 1, children }: { chapter: number; span?: number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => { if (ref.current) ref.current.visible = Math.abs(localD(chapter)) < 0.8 * span })
  return <group ref={ref} position={[0, SECTION_Y[Math.min(chapter, SECTION_Y.length - 1)], 0]}>{children}</group>
}

const perlin = new ImprovedNoise()
const fbm3 = (v: THREE.Vector3, f: number, oct = 4) => {
  let s = 0, a = 0.5, k = f
  for (let i = 0; i < oct; i++) { s += a * perlin.noise(v.x * k + i * 3.1, v.y * k, v.z * k); k *= 2.03; a *= 0.5 }
  return s
}

// ---------- 02: an ice floe; a fine survey grid crawls over its shell under the cursor ----------
function iceGeometry(seed: number, detail: number) {
  let g: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail)
  g.deleteAttribute('normal')
  g.deleteAttribute('uv')
  g = mergeVertices(g)
  // broken faces: a few cutting planes flatten the blob like split ice
  const planes = Array.from({ length: 9 }, (_, i) => {
    const phi = Math.acos(1 - 2 * ((i + 0.5) / 9)), th = i * 2.399963 + seed
    return { n: new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)), d: 0.62 + ((i * 7 + seed * 13) % 5) * 0.06 }
  })
  const p = g.attributes.position as THREE.BufferAttribute
  const v = new THREE.Vector3(), q = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).normalize()
    const r = 1 + 0.16 * fbm3(v, 1.6 + seed * 0.1) + 0.04 * fbm3(v, 6)
    q.copy(v).multiplyScalar(r)
    for (const pl of planes) { const dd = q.dot(pl.n); if (dd > pl.d) q.addScaledVector(pl.n, -(dd - pl.d) * 0.93) }
    q.set(q.x * 2.3, q.y * 1.1, q.z * 1.7)
    if (q.y > 0.62) q.y = 0.62 + (q.y - 0.62) * 0.12 // flat, snowy top of a floe
    p.setXYZ(i, q.x, q.y, q.z)
  }
  g.computeVertexNormals()
  return g
}

function IceFloe() {
  const group = useRef<THREE.Group>(null)
  const ice = useRef<THREE.Mesh>(null)
  const geo = useMemo(() => iceGeometry(1, 28), [])
  const chip = useMemo(() => iceGeometry(4, 6), [])
  const uniforms = useMemo(() => ({ uHit: { value: new THREE.Vector3(0, -999, 0) }, uHitAmt: { value: 0 }, uTime: { value: 0 } }), [])
  const mat = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      color: '#c2d7ee', roughness: 0.16, transmission: 0.8, thickness: 3, ior: 1.31,
      attenuationColor: new THREE.Color('#5f8fc4'), attenuationDistance: 1.4, clearcoat: 1, clearcoatRoughness: 0.12, envMapIntensity: 1.5,
      sheen: 0.4, sheenColor: new THREE.Color('#e8f2ff'),
    })
    applyTriplanar(m, triMaps('rock_boulder_dry'), {
      scale: 0.8, mix: 0.18, normal: 0.35, snow: 0.6, key: 'ice',
      extra: (shader) => {
        Object.assign(shader.uniforms, uniforms)
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uHit;\nuniform float uHitAmt;\nuniform float uTime;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            {
              // fine grid on the shell, fading out from the cursor
              float dh = distance(vTriPos, uHit);
              float m = uHitAmt * (1.0 - smoothstep(0.2, 1.15, dh));
              vec3 gp = vTriPos / 0.085;
              vec3 gq = abs(fract(gp - 0.5) - 0.5) / max(fwidth(gp), vec3(1e-4));
              float line = (1.0 - min(min(gq.y, gq.z), 1.0)) * triWt.x
                         + (1.0 - min(min(gq.x, gq.z), 1.0)) * triWt.y
                         + (1.0 - min(min(gq.x, gq.y), 1.0)) * triWt.z;
              float ring = 1.0 - smoothstep(0.0, 0.02, abs(dh - 0.5 - 0.07 * sin(uTime * 2.4)));
              totalEmissiveRadiance += vec3(0.85, 0.93, 1.0) * (line * 0.75 + ring * 0.6) * m * 1.5;
            }`)
      },
    })
    return m
  }, [uniforms])
  const chips = useMemo(() => Array.from({ length: 7 }, (_, i) => ({
    a: (i / 7) * Math.PI * 2, r: 4.6 + (i % 3) * 0.8, y: ((i * 5) % 7 - 3) * 0.45, s: 0.08 + (i % 4) * 0.035,
  })), [])
  const chipRefs = useRef<(THREE.Mesh | null)[]>([])
  const hov = useRayHover(ice, 2.2)
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    if (group.current) { group.current.rotation.y += dt * 0.06; group.current.position.y = Math.sin(t * 0.5) * 0.08 }
    const h = hov.current
    if (h.target) uniforms.uHit.value.lerp(h.point, h.amt < 0.02 ? 1 : 1 - Math.exp(-dt * 10))
    uniforms.uHitAmt.value = h.amt
    uniforms.uTime.value = t
    chips.forEach((c, i) => {
      const m = chipRefs.current[i]
      if (!m) return
      const a = c.a + t * 0.05
      m.position.set(Math.cos(a) * c.r, c.y + Math.sin(t * 0.7 + i) * 0.12, Math.sin(a) * c.r)
      m.rotation.set(t * 0.1 + i, t * 0.07, i)
    })
  })
  return (
    <group ref={group}>
      <mesh ref={ice} geometry={geo} material={mat} castShadow />
      {chips.map((c, i) => <mesh key={i} ref={(m) => { chipRefs.current[i] = m }} geometry={chip} material={mat} scale={c.s} />)}
      <pointLight position={[0, -0.2, 0]} color="#a9c8ff" intensity={14} distance={7} />
    </group>
  )
}

// ---------- 03: storefront portal; three shards fly into it and the camera follows ----------
function Portal() {
  const COUNT = 46
  const mesh = useRef<THREE.InstancedMesh>(null)
  const geo = useMemo(() => new RoundedBoxGeometry(0.9, 0.62, 0.7, 3, 0.09), [])
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#c3c9d4', roughness: 0.9 })
    applyTriplanar(m, triMaps('rock_boulder_dry'), { scale: 1.1, mix: 0.7, normal: 0.6, snow: 0.5, key: 'shop' })
    return m
  }, [])
  const blocks = useMemo(() => Array.from({ length: COUNT }, (_, i) => {
    const a = (i / COUNT) * Math.PI * 2
    return {
      a, gap: Math.sin(a * 3) > 0.82,
      home: new THREE.Vector3(Math.cos(a) * 4.4, Math.sin(a) * 4.4, ((i * 7) % 3 - 1) * 0.12),
      scatter: new THREE.Vector3(Math.cos(a) * (6 + (i % 5)), Math.sin(a) * (6 + (i % 4)), ((i * 11) % 7 - 3) * 1.4),
      spin: new THREE.Euler(((i * 3) % 5) * 0.4, ((i * 5) % 7) * 0.3, a + Math.PI / 2),
    }
  }), [])
  const proxy = useRef<THREE.Mesh>(null)
  const hov = useRayHover(proxy, 2.5)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const local = useMemo(() => new THREE.Vector3(), [])
  const push = useMemo(() => new THREE.Vector3(), [])
  const group = useRef<THREE.Group>(null)
  const shards = useRef<(THREE.Mesh | null)[]>([])
  const core = useRef<THREE.Mesh>(null)
  const light = useRef<THREE.PointLight>(null)
  useFrame(({ clock }) => {
    if (!mesh.current || !group.current) return
    const t = clock.elapsedTime
    const d = localD(2)
    // assembles on the way in, stays whole while the camera flies through
    const k = d < 0 ? 1 - smooth(-d, 0.1, 0.6) : 1
    local.copy(hov.current.point)
    group.current.worldToLocal(local)
    blocks.forEach((b, i) => {
      dummy.position.lerpVectors(b.scatter, b.home, k)
      if (b.gap) dummy.position.multiplyScalar(1.12)
      dummy.position.y += Math.sin(t * 0.7 + i) * 0.05
      const f = hov.current.amt * (1 - smooth(dummy.position.distanceTo(local), 0, 2.2))
      push.set(Math.cos(b.a), Math.sin(b.a), 0.6 * ((i % 2) * 2 - 1)).multiplyScalar(f * 0.7)
      dummy.position.add(push)
      dummy.rotation.set(b.spin.x * (1 - k), b.spin.y * (1 - k), b.a + Math.PI / 2)
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
    group.current.rotation.z = t * 0.04
    // three shards circle the ring, then spiral into its centre as the camera starts moving in
    const dive = smooth(d, 0.04, 0.4)
    const flash = Math.exp(-Math.pow((dive - 0.97) / 0.06, 2))
    shards.current.forEach((m, i) => {
      if (!m) return
      const a = t * 0.5 + i * 2.094 + dive * 7
      const r = 3.1 * (1 - dive)
      m.position.set(Math.cos(a) * r, Math.sin(a) * r, 0.9 - dive * 1.4)
      m.scale.setScalar(0.24 * (1 - smooth(dive, 0.88, 1)) + 0.0001)
      m.rotation.set(t, t * 1.3, i)
    })
    if (core.current) core.current.scale.setScalar(0.05 + flash * 1.4)
    if (light.current) light.current.intensity = 4 + flash * 60
  })
  const net = (out: THREE.Vector3[]) => {
    if (!group.current || !mesh.current) return 0
    const m = new THREE.Matrix4(), p = new THREE.Vector3()
    const near = blocks.map((_, i) => { mesh.current!.getMatrixAt(i, m); p.setFromMatrixPosition(m); return [p.distanceToSquared(local), p.clone()] as const })
      .sort((x, y) => x[0] - y[0]).slice(0, 6)
    near.forEach(([, q], k) => { out[k].copy(q); out[k].z += 0.5; group.current!.localToWorld(out[k]) })
    return near.length
  }
  return (
    <group>
      <group ref={group}>
        <instancedMesh ref={mesh} args={[geo, mat, COUNT]} castShadow />
        {[0, 1, 2].map((i) => (
          <mesh key={i} ref={(m) => { shards.current[i] = m }}>
            <octahedronGeometry args={[1, 0]} />
            <meshBasicMaterial color={[2.6, 1.7, 0.9]} toneMapped={false} />
          </mesh>
        ))}
        <mesh ref={core}><sphereGeometry args={[1, 24, 16]} /><meshBasicMaterial color={[3, 2.1, 1.2]} toneMapped={false} /></mesh>
        <pointLight ref={light} position={[0, 0, 1.5]} color="#ffb066" intensity={4} distance={14} />
      </group>
      <mesh ref={proxy} visible={false}>
        <ringGeometry args={[3.2, 5.6, 48]} />
        <meshBasicMaterial side={THREE.DoubleSide} />
      </mesh>
      <HoverNet points={net} amount={() => hov.current.amt} version={() => hov.current.version} />
    </group>
  )
}

// ---------- 04: Telegram Mini Apps: a slowly turning thread of frosted glass app cards ----------
function uiTexture(variant: number) {
  const c = document.createElement('canvas')
  c.width = 512; c.height = 320
  const g = c.getContext('2d')!
  const rr = (x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.roundRect(x, y, w, h, r) }
  g.fillStyle = 'rgba(255,255,255,0.9)'
  g.strokeStyle = 'rgba(255,255,255,0.9)'
  g.lineWidth = 3
  // header: avatar and title
  g.beginPath(); g.arc(52, 48, 22, 0, Math.PI * 2); g.fill()
  rr(90, 34, 150 + variant * 30, 12, 6); g.fill()
  rr(90, 56, 90, 8, 4); g.globalAlpha = 0.6; g.fill(); g.globalAlpha = 1
  // content
  if (variant === 0) {
    for (let i = 0; i < 3; i++) { rr(30 + i * 158, 96, 140, 120, 14); g.stroke(); rr(46 + i * 158, 220, 90, 9, 4); g.fill() }
  } else if (variant === 1) {
    for (let i = 0; i < 4; i++) { rr(30, 100 + i * 34, 300 + ((i * 97) % 140), 12, 6); g.globalAlpha = 0.85 - i * 0.12; g.fill() }
    g.globalAlpha = 1
  } else {
    rr(30, 96, 452, 110, 16); g.stroke()
    g.beginPath(); g.arc(256, 151, 26, 0, Math.PI * 2); g.stroke()
  }
  // button
  rr(30, 256, 452, 40, 20); g.globalAlpha = 0.95; g.fill()
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function Thread() {
  const N = 22
  const group = useRef<THREE.Group>(null)
  const geo = useMemo(() => new RoundedBoxGeometry(1.7, 1.06, 0.07, 2, 0.1), [])
  const glass = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#dfe7f2', transmission: 0.6, roughness: 0.32, thickness: 0.4, ior: 1.4, clearcoat: 1, clearcoatRoughness: 0.2, envMapIntensity: 1.2,
  }), [])
  const screens = useMemo(() => [0, 1, 2].map((v) => new THREE.MeshBasicMaterial({
    map: uiTexture(v), transparent: true, depthWrite: false, toneMapped: false, color: new THREE.Color(1.25, 1.32, 1.5), opacity: 0.85,
  })), [])
  const tiles = useMemo(() => Array.from({ length: N }, (_, i) => ({ a: i * 0.55, y: (i - N / 2) * 0.36, v: (i * 7) % 3, push: 0 })), [])
  const refs = useRef<(THREE.Group | null)[]>([])
  const dots = useRef<(THREE.Mesh | null)[]>([])
  const proxy = useRef<THREE.Mesh>(null)
  const hov = useRayHover(proxy, 2.5)
  const w = useMemo(() => new THREE.Vector3(), [])
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    if (group.current) group.current.rotation.y += dt * 0.1
    tiles.forEach((tl, i) => {
      const g = refs.current[i]
      if (!g) return
      g.getWorldPosition(w)
      const target = hov.current.amt * (1 - smooth(w.distanceTo(hov.current.point), 0, 1.8))
      tl.push += (target - tl.push) * (1 - Math.exp(-dt * 5))
      const r = 2.7 + tl.push * 0.7
      g.position.set(Math.cos(tl.a) * r, tl.y + Math.sin(t * 0.6 + i) * 0.04, Math.sin(tl.a) * r)
    })
    // messages travelling up the thread
    dots.current.forEach((m, k) => {
      if (!m) return
      const u = (t * 0.04 + k / 10) % 1
      const a = u * N * 0.55, y = (u * N - N / 2) * 0.36
      m.position.set(Math.cos(a) * 2.2, y, Math.sin(a) * 2.2)
    })
  })
  return (
    <group>
      <group ref={group}>
        {tiles.map((tl, i) => (
          <group key={i} ref={(g) => { refs.current[i] = g }} rotation={[0, -tl.a + Math.PI / 2, 0]}>
            <mesh geometry={geo} material={glass} />
            <mesh position={[0, 0, 0.045]} material={screens[tl.v]}><planeGeometry args={[1.5, 0.94]} /></mesh>
          </group>
        ))}
        {Array.from({ length: 10 }, (_, k) => (
          <mesh key={k} ref={(m) => { dots.current[k] = m }}>
            <sphereGeometry args={[0.05, 12, 8]} />
            <meshBasicMaterial color={[2.6, 1.6, 0.8]} toneMapped={false} />
          </mesh>
        ))}
        <pointLight color="#d6e4ff" intensity={10} distance={9} />
      </group>
      <mesh ref={proxy} visible={false}>
        <cylinderGeometry args={[3.3, 3.3, 9, 32, 1, true]} />
        <meshBasicMaterial side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

// ---------- 05/06: works as screens set into stone monoliths standing in a turning circle ----------
const WORKS = ['apple-favorite', 'gerbariy', 'pole', 'maison-petale', 'zerno', 'bubble-tea']
const RING_R = 6.5

function Monolith({ slug, a, geo, stone }: { slug: string; a: number; geo: THREE.BufferGeometry; stone: THREE.Material }) {
  const tex = useTexture(`${BASE}works/${slug}-thumb.webp`)
  tex.colorSpace = THREE.SRGBColorSpace
  const body = useRef<THREE.Mesh>(null)
  const lift = useRef<THREE.Group>(null)
  const screen = useRef<THREE.MeshBasicMaterial>(null)
  const hov = useRayHover(body, 2.5)
  useFrame(() => {
    const h = hov.current.amt
    if (lift.current) lift.current.position.y = h * 0.22
    if (screen.current) screen.current.color.setScalar(0.85 + h * 0.5)
  })
  return (
    <group position={[Math.sin(a) * RING_R, 0, Math.cos(a) * RING_R]} rotation={[0, a, 0]}>
      <group ref={lift}>
        <mesh ref={body} geometry={geo} material={stone} position={[0, -0.4, 0]} castShadow receiveShadow />
        <mesh position={[0, 0.25, 0.205]}>
          <planeGeometry args={[1.98, 1.24]} />
          <meshBasicMaterial ref={screen} map={tex} toneMapped={false} />
        </mesh>
        {/* warm strip of light at the foot */}
        <mesh position={[0, -2.15, 0.25]}><boxGeometry args={[1.9, 0.03, 0.03]} /><meshBasicMaterial color={[2.4, 1.4, 0.6]} toneMapped={false} /></mesh>
      </group>
    </group>
  )
}

function Exhibition() {
  const ring = useRef<THREE.Group>(null)
  const geo = useMemo(() => new RoundedBoxGeometry(2.3, 3.6, 0.4, 3, 0.08), [])
  const stone = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#b7bec9', roughness: 0.9 })
    applyTriplanar(m, triMaps('rock_boulder_dry'), { scale: 0.9, mix: 0.7, normal: 0.6, snow: 0.55, key: 'monolith' })
    return m
  }, [])
  const ground = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.42, 0.45, 0.52), roughness: 0.95 })
    applyTriplanar(m, triMaps('rock_face_03'), { scale: 0.3, mix: 0.7, normal: 0.8, snow: 1, key: 'arena' })
    return m
  }, [])
  useFrame((_, dt) => { if (ring.current) ring.current.rotation.y += dt * 0.045 })
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.2, 0]} material={ground} receiveShadow>
        <circleGeometry args={[16, 96]} />
      </mesh>
      {[3.2, 9.4].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.17, 0]}>
          <ringGeometry args={[r - 0.025, r + 0.025, 160]} />
          <meshBasicMaterial color={[2.0, 1.2, 0.55]} toneMapped={false} />
        </mesh>
      ))}
      <group ref={ring}>
        {WORKS.map((s, i) => <Monolith key={s} slug={s} a={(i / WORKS.length) * Math.PI * 2} geo={geo} stone={stone} />)}
      </group>
      <pointLight position={[0, 3, 0]} color="#ffe2c2" intensity={14} distance={20} />
    </group>
  )
}

export function Sections() {
  return (
    <>
      <Stage chapter={1}><Depths floor={-4.5} seed={1} /><IceFloe /></Stage>
      <Stage chapter={2}><Depths floor={-6.5} seed={2} tilt /><Portal /></Stage>
      <Stage chapter={3}><Depths floor={-5.5} seed={3} /><Thread /></Stage>
      <Stage chapter={4} span={2.2}><Depths floor={-1.7} seed={4} /><Exhibition /></Stage>
    </>
  )
}
