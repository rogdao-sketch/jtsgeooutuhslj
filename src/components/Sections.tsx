import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { CHAPTERS, SECTION_Y, progress } from '../lib/journey'
import { useRayHover } from '../lib/hover'
import { applyTriplanar, triMaps } from '../lib/triplanar'
import { HoverNet } from './HoverNet'
import { Depths } from './Atmosphere'

const BASE = import.meta.env.BASE_URL
const STEP = 1 / (CHAPTERS.length - 1)

const tiled = (t: THREE.Texture) => {
  const c = t.clone()
  c.wrapS = c.wrapT = THREE.RepeatWrapping
  c.repeat.set(1.6, 1.6)
  c.needsUpdate = true
  return c
}

/** Renders a chapter's scene only while the camera is near it, and lets it rise out of the fog. */
function Stage({ chapter, span = 1, children }: { chapter: number; span?: number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    if (!ref.current) return
    const d = Math.abs(progress.v - chapter * STEP) / STEP
    const k = 1 - THREE.MathUtils.smoothstep(d, 0.35 * span, 0.85 * span)
    ref.current.visible = k > 0.001
    ref.current.position.y = SECTION_Y[Math.min(chapter, SECTION_Y.length - 1)] - (1 - k) * 4
    ref.current.scale.setScalar(0.85 + 0.15 * k)
  })
  return <group ref={ref}>{children}</group>
}

/** Hover via an invisible proxy mesh; returns the ref to put on the proxy and the hover state. */
function useHover() {
  const proxy = useRef<THREE.Mesh>(null)
  const s = useRayHover(proxy)
  return { s, proxy }
}

// ---------- 02: crystal lens, light inside ----------
function Crystal() {
  const group = useRef<THREE.Group>(null)
  const shards = useMemo(() => {
    const out: { dir: THREE.Vector3; len: number; w: number; q: THREE.Quaternion }[] = []
    const up = new THREE.Vector3(0, 1, 0)
    for (let i = 0; i < 15; i++) {
      // golden-spiral directions with a wobble, so the cluster is not a flat star
      const phi = Math.acos(1 - 2 * ((i + 0.5) / 15)), th = i * 2.399963 + Math.sin(i * 12.9) * 0.4
      const dir = new THREE.Vector3(Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)).normalize()
      out.push({ dir, len: 1.1 + ((i * 37) % 11) / 11 * 1.7, w: 0.3 + ((i * 13) % 7) / 14, q: new THREE.Quaternion().setFromUnitVectors(up, dir) })
    }
    return out
  }, [])
  const geo = useMemo(() => {
    const g = new THREE.OctahedronGeometry(1, 0)
    g.scale(1, 1, 1)
    return g
  }, [])
  const mat = useMemo(() => new THREE.MeshPhysicalMaterial({
    color: '#dbe5f3', roughness: 0.22, transmission: 0.85, thickness: 2.2, ior: 1.45, iridescence: 0.5,
    clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 1.6, flatShading: true,
    attenuationColor: new THREE.Color('#aebfd8'), attenuationDistance: 2.2,
    // frosted, chipped ice: stone grain as normal and roughness detail
    normalMap: tiled(triMaps('rock_boulder_dry').nor), normalScale: new THREE.Vector2(0.7, 0.7),
    roughnessMap: tiled(triMaps('rock_boulder_dry').rough),
  }), [])
  const refs = useRef<(THREE.Mesh | null)[]>([])
  const { s, proxy } = useHover()
  useFrame(({ clock }, dt) => {
    if (group.current) group.current.rotation.y += dt * 0.12
    const a = s.current.amt
    shards.forEach((sh, i) => {
      const m = refs.current[i]
      if (!m) return
      const breathe = Math.sin(clock.elapsedTime * 0.8 + i) * 0.04
      m.position.copy(sh.dir).multiplyScalar(sh.len * 0.55 + a * (0.5 + (i % 3) * 0.25) + breathe)
    })
  })
  const net = (out: THREE.Vector3[]) => {
    let n = 0
    shards.forEach((sh, i) => {
      const m = refs.current[i]
      if (!m || n >= 8 || i % 2) return
      out[n].copy(sh.dir).multiplyScalar(sh.len * 1.05).applyQuaternion(new THREE.Quaternion()).add(m.position)
      m.parent!.localToWorld(out[n])
      n++
    })
    return n
  }
  return (
    <group>
      <group ref={group} scale={0.72}>
        {shards.map((sh, i) => (
          <mesh key={i} ref={(m) => { refs.current[i] = m }} geometry={geo} material={mat} quaternion={sh.q} scale={[sh.w, sh.len, sh.w]} />
        ))}
        <mesh><icosahedronGeometry args={[0.45, 2]} /><meshBasicMaterial color={[3.2, 1.9, 0.9]} toneMapped={false} /></mesh>
        <pointLight color="#ffb066" intensity={30} distance={14} />
      </group>
      <mesh ref={proxy} visible={false}>
        <sphereGeometry args={[1.9, 24, 16]} />
        <meshBasicMaterial />
      </mesh>
      <HoverNet points={net} amount={() => s.current.amt} version={() => s.current.version} />
    </group>
  )
}

// ---------- 03: storefront ring of stones that assembles itself ----------
function Storefront() {
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
    const gap = Math.sin(a * 3) > 0.82 // broken places in the ring
    return {
      a, gap,
      home: new THREE.Vector3(Math.cos(a) * 4.4, Math.sin(a) * 4.4, ((i * 7) % 3 - 1) * 0.12),
      scatter: new THREE.Vector3(Math.cos(a) * (6 + (i % 5)), Math.sin(a) * (6 + (i % 4)), ((i * 11) % 7 - 3) * 1.4),
      spin: new THREE.Euler(((i * 3) % 5) * 0.4, ((i * 5) % 7) * 0.3, a + Math.PI / 2),
    }
  }), [])
  const { s, proxy } = useHover()
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const local = useMemo(() => new THREE.Vector3(), [])
  const group = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    if (!mesh.current || !group.current) return
    const d = Math.abs(progress.v - 2 * STEP) / STEP
    const k = 1 - THREE.MathUtils.smoothstep(d, 0.1, 0.6) // assembled when the camera arrives
    local.copy(s.current.point)
    group.current.worldToLocal(local)
    blocks.forEach((b, i) => {
      dummy.position.lerpVectors(b.scatter, b.home, k)
      if (b.gap) dummy.position.multiplyScalar(1.12)
      dummy.position.y += Math.sin(clock.elapsedTime * 0.7 + i) * 0.05
      const push = s.current.amt * (1 - THREE.MathUtils.smoothstep(dummy.position.distanceTo(local), 0, 2.2))
      dummy.position.add(new THREE.Vector3(Math.cos(b.a), Math.sin(b.a), 0.6 * ((i % 2) * 2 - 1)).multiplyScalar(push * 0.7))
      dummy.rotation.set(b.spin.x * (1 - k), b.spin.y * (1 - k), b.a + Math.PI / 2)
      dummy.updateMatrix()
      mesh.current!.setMatrixAt(i, dummy.matrix)
    })
    mesh.current.instanceMatrix.needsUpdate = true
    group.current.rotation.z = clock.elapsedTime * 0.05
  })
  const net = (out: THREE.Vector3[]) => {
    if (!group.current) return 0
    const m = new THREE.Matrix4(), p = new THREE.Vector3()
    const near = blocks.map((_, i) => { mesh.current!.getMatrixAt(i, m); p.setFromMatrixPosition(m); return [p.distanceToSquared(local), i, p.clone()] as const })
      .sort((x, y) => x[0] - y[0]).slice(0, 6)
    near.forEach(([, , q], k) => { out[k].copy(q); out[k].z += 0.5; group.current!.localToWorld(out[k]) })
    return near.length
  }
  return (
    <group>
      <group ref={group}>
        <instancedMesh ref={mesh} args={[geo, mat, COUNT]} castShadow />
        {/* shop window light in the middle of the ring */}
        <mesh position={[0, 0, -0.8]}><icosahedronGeometry args={[0.5, 2]} /><meshBasicMaterial color={[2.6, 1.6, 0.8]} toneMapped={false} /></mesh>
        <pointLight position={[0, 0, 2]} color="#ffb066" intensity={14} distance={12} />
      </group>
      <mesh ref={proxy} visible={false}>
        <circleGeometry args={[6, 32]} />
        <meshBasicMaterial side={THREE.DoubleSide} />
      </mesh>
      <HoverNet points={net} amount={() => s.current.amt} version={() => s.current.version} />
    </group>
  )
}

// ---------- 04: Telegram Mini App ----------
function PaperPlane() {
  const ref = useRef<THREE.Group>(null)
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
      0, 0, -1.2, -0.7, 0.05, 0.6, 0, -0.18, 0.35,
      0, 0, -1.2, 0, -0.18, 0.35, 0.7, 0.05, 0.6,
    ]), 3))
    g.computeVertexNormals()
    return g
  }, [])
  useFrame(({ clock }) => {
    if (!ref.current) return
    const t = clock.elapsedTime * 0.45
    ref.current.position.set(Math.cos(t) * 4.2, Math.sin(t * 2) * 0.6 + 0.4, Math.sin(t) * 2.6)
    ref.current.rotation.set(0, -t + Math.PI, Math.sin(t * 2) * 0.35)
  })
  return (
    <group ref={ref} scale={0.6}>
      <mesh geometry={geo}><meshStandardMaterial color="#f4f6fa" side={THREE.DoubleSide} flatShading roughness={0.6} /></mesh>
    </group>
  )
}

function Phone() {
  const tex = useTexture(`${BASE}works/apple-favorite-tg.webp`)
  tex.colorSpace = THREE.SRGBColorSpace
  const img = tex.image as { width: number; height: number }
  const h = 4.4, w = h * Math.min(img.width / img.height, 0.62)
  const ref = useRef<THREE.Group>(null)
  const { s, proxy } = useHover()
  useFrame(({ clock, pointer }) => {
    if (!ref.current) return
    const a = s.current.amt
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.6) * 0.15
    ref.current.rotation.y += ((-0.35 + pointer.x * 0.5 * a + Math.sin(clock.elapsedTime * 0.3) * 0.08) - ref.current.rotation.y) * 0.08
    ref.current.rotation.x += ((-pointer.y * 0.3 * a) - ref.current.rotation.x) * 0.08
  })
  return (
    <group ref={ref}>
      <mesh ref={proxy} castShadow>
        <boxGeometry args={[w + 0.28, h + 0.28, 0.16]} />
        <meshStandardMaterial color="#14171f" roughness={0.3} metalness={0.7} />
      </mesh>
      <mesh position={[0, 0, 0.085]}><planeGeometry args={[w, h]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
    </group>
  )
}

// ---------- 05/06: pedestal with works ----------
const WORKS = ['apple-favorite', 'gerbariy', 'pole', 'maison-petale', 'zerno', 'bubble-tea']

function Card({ slug, a }: { slug: string; a: number }) {
  const tex = useTexture(`${BASE}works/${slug}-thumb.webp`)
  tex.colorSpace = THREE.SRGBColorSpace
  const ref = useRef<THREE.Group>(null)
  const { s, proxy } = useHover()
  useFrame(({ clock }) => {
    if (!ref.current) return
    ref.current.position.y = Math.sin(clock.elapsedTime * 0.7 + a * 3) * 0.12 + s.current.amt * 0.35
    ref.current.scale.setScalar(1 + s.current.amt * 0.08)
  })
  const R = 6.2
  return (
    <group position={[Math.sin(a) * R, 1.6, Math.cos(a) * R * 0.6 - 1]} rotation={[0, a * 0.85, 0]}>
      <group ref={ref}>
        <mesh position={[0, 0, -0.05]} ref={proxy}><boxGeometry args={[2.7, 1.8, 0.08]} /><meshStandardMaterial color="#1b2030" roughness={0.4} metalness={0.5} /></mesh>
        <mesh><planeGeometry args={[2.55, 1.6]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
      </group>
    </group>
  )
}

function Pedestal() {
  const discs = [9, 7, 5.2, 3.4, 1.8]
  const mat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({ color: '#b9c0ce', roughness: 0.75 })
    applyTriplanar(m, triMaps('rock_boulder_dry'), { scale: 0.6, mix: 0.45, normal: 0.35, snow: 0.3, key: 'pedestal' })
    return m
  }, [])
  const ring = useRef<THREE.Group>(null)
  useFrame(({ clock }) => { if (ring.current) ring.current.rotation.y = clock.elapsedTime * 0.1 })
  return (
    <group>
      <group position={[0, -3.4, 0]}>
        {discs.map((r, i) => (
          <mesh key={r} position={[0, i * 0.22, 0]} material={mat} receiveShadow castShadow>
            <cylinderGeometry args={[r, r + 0.08, 0.22, 96]} />
          </mesh>
        ))}
        <group ref={ring}>
          {[8.1, 6.1, 4.3].map((r, i) => (
            <mesh key={r} position={[0, 0.12 + i * 0.22 + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
              <ringGeometry args={[r - 0.03, r + 0.03, 128]} />
              <meshBasicMaterial color={[2.0, 1.15, 0.5]} toneMapped={false} />
            </mesh>
          ))}
        </group>
        <pointLight position={[0, 3, 0]} color="#ffd2a1" intensity={20} distance={16} />
      </group>
      {WORKS.map((sl, i) => <Card key={sl} slug={sl} a={(i - 2.5) * 0.5} />)}
    </group>
  )
}

export function Sections() {
  return (
    <>
      <Stage chapter={1}><Depths floor={-5} seed={1} /><Crystal /></Stage>
      <Stage chapter={2}><Depths floor={-6.5} seed={2} tilt /><Storefront /></Stage>
      <Stage chapter={3}><Depths floor={-5.5} seed={3} /><Phone /><PaperPlane /></Stage>
      <Stage chapter={4} span={2.2}><Depths floor={-4.4} seed={4} /><Pedestal /></Stage>
    </>
  )
}
