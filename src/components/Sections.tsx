import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, useGLTF, useTexture } from '@react-three/drei'
import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { CHAPTERS, SECTION_Y, darknessAt, progress } from '../lib/journey'
import { quality } from '../lib/quality'
import { DRACO } from './Lighthouse'
import { useRayHover } from '../lib/hover'
import { applyTriplanar, triMaps } from '../lib/triplanar'
import { HoverNet, type NetNode } from './HoverNet'
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

// ---------- 02: a chunk of clear ice (modelled in Blender) with a crawling grid and ripples under the cursor ----------
const CRYSTAL = `${BASE}models/crystal.glb`

function Callout({ anchor, elbow, end, align, title, sub, live }: {
  anchor: [number, number, number]; elbow: [number, number, number]; end: [number, number, number]
  align: 'left' | 'right'; title: string; sub?: string; live?: boolean
}) {
  const line = useMemo(() => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(...anchor), new THREE.Vector3(...elbow), new THREE.Vector3(...end)])
    const m = new THREE.LineBasicMaterial({ color: new THREE.Color(1.3, 1.35, 1.45), transparent: true, toneMapped: false, depthTest: false })
    return new THREE.Line(g, m)
  }, [anchor, elbow, end])
  const box = useRef<HTMLDivElement>(null)
  const num = useRef<HTMLSpanElement>(null)
  const tick = useRef(0)
  useFrame(({ clock }) => {
    const vis = (1 - smooth(Math.abs(localD(1)), 0.15, 0.35)) * (1 - Math.min(1, darknessAt(progress.v) * 3))
    ;(line.material as THREE.LineBasicMaterial).opacity = vis * 0.8
    if (box.current) box.current.style.opacity = String(vis)
    if (live && num.current && clock.elapsedTime - tick.current > 0.18) {
      tick.current = clock.elapsedTime
      num.current.textContent = `${(-18.6 + Math.sin(clock.elapsedTime * 0.7) * 1.4 + Math.random() * 0.08).toFixed(2)}° · ${(4.27 + Math.random() * 0.04).toFixed(2)}`
    }
  })
  return (
    <group>
      <primitive object={line} renderOrder={22} />
      <Html position={end} zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
        <div ref={box} className={`callout callout--${align}`} style={{ opacity: 0 }}>
          <b>{title}</b>
          {live ? <span ref={num}>-18.60° · 4.27</span> : sub && <span>{sub}</span>}
        </div>
      </Html>
    </group>
  )
}

/** A loose constellation beside the crystal: crosses joined by thin lines, slowly turning. */
function Constellation() {
  const ref = useRef<THREE.Group>(null)
  const { lines, dots } = useMemo(() => {
    const pts = [[0, 0, 0], [0.9, 0.7, 0.2], [1.5, -0.2, -0.3], [0.7, -0.9, 0.1], [1.9, 0.9, -0.5]].map((a) => new THREE.Vector3(a[0], a[1], a[2]))
    const seg = [0, 1, 1, 2, 2, 3, 3, 0, 1, 4, 2, 4].map((i) => pts[i])
    return {
      lines: new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg),
        new THREE.LineBasicMaterial({ color: new THREE.Color(1.2, 1.25, 1.35), transparent: true, opacity: 0.55, toneMapped: false })),
      dots: new THREE.Points(new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.6, 1.7), size: 5, sizeAttenuation: false, toneMapped: false })),
    }
  }, [])
  useFrame(({ clock }) => { if (ref.current) ref.current.rotation.set(Math.sin(clock.elapsedTime * 0.2) * 0.2, clock.elapsedTime * 0.08, 0) })
  return <group ref={ref} position={[2.6, 1.4, -0.6]}><primitive object={lines} /><primitive object={dots} /></group>
}

function Crystal() {
  const group = useRef<THREE.Group>(null)
  const ice = useRef<THREE.Mesh>(null)
  const { scene: model } = useGLTF(CRYSTAL, DRACO)
  // modelled in Blender: the ice shell, frosted fracture sheets inside it and clusters of air bubbles
  const { geo, cracks, bubbles } = useMemo(() => {
    const find = (name: string) => {
      let g: THREE.BufferGeometry | null = null
      model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && m.name.startsWith(name)) g = m.geometry })
      return g as unknown as THREE.BufferGeometry
    }
    return { geo: find('Ice'), cracks: find('Fractures'), bubbles: find('Bubbles') }
  }, [model])
  // opaque with hashed alpha, so the refraction pass of the ice actually sees them
  const crackMat = useMemo(() => new THREE.MeshStandardMaterial({
    color: '#e9f1fc', roughness: 0.45, opacity: 0.5, alphaHash: true, side: THREE.DoubleSide,
    emissive: new THREE.Color('#d4e3ff'), emissiveIntensity: 0.3,
  }), [])
  const bubbleMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.1, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.45 }), [])
  const uniforms = useMemo(() => ({ uHit: { value: new THREE.Vector3(0, -999, 0) }, uHitAmt: { value: 0 }, uTime: { value: 0 } }), [])
  const mat = useMemo(() => {
    const m = new THREE.MeshPhysicalMaterial({
      color: '#eef4fb', roughness: 0.04, transmission: 1, thickness: 2.4, ior: 1.31, dispersion: quality.lensEffects ? 1.1 : 0,
      attenuationColor: new THREE.Color('#a9c4e6'), attenuationDistance: 3, clearcoat: 1, clearcoatRoughness: 0.03,
      specularIntensity: 1, envMapIntensity: 2,
    })
    applyTriplanar(m, triMaps('rock_boulder_dry'), {
      scale: 1.6, mix: 0.04, normal: 0.18, snow: 0.06, key: 'crystal2',
      extra: (shader) => {
        Object.assign(shader.uniforms, uniforms)
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>\nuniform vec3 uHit;\nuniform float uHitAmt;\nuniform float uTime;')
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            {
              float dh = distance(vTriPos, uHit);
              float reach = uHitAmt * (1.0 - smoothstep(0.15, 1.45, dh));
              // ripples running out from the cursor and a slower swell rocking back and forth
              float ripple = sin(dh * 28.0 - uTime * 9.0) * 0.5 + 0.5;
              float swell = sin(dh * 6.0 - uTime * 2.6 + sin(uTime * 1.4) * 2.2) * 0.5 + 0.5;
              // very fine grid that keeps crawling over the ice; the waves bend it
              vec3 gp = vTriPos / 0.034 + vec3(uTime * 0.9, uTime * 0.55, -uTime * 0.7) + triNw * ripple * 0.35;
              vec3 gq = abs(fract(gp - 0.5) - 0.5) / max(fwidth(gp) * 0.5, vec3(1e-4));
              float line = (1.0 - min(min(gq.y, gq.z), 1.0)) * triWt.x
                         + (1.0 - min(min(gq.x, gq.z), 1.0)) * triWt.y
                         + (1.0 - min(min(gq.x, gq.y), 1.0)) * triWt.z;
              float rings = smoothstep(0.93, 1.0, ripple) * reach;
              totalEmissiveRadiance += vec3(0.85, 0.93, 1.0) * (line * (0.2 + 0.8 * swell) * reach * 0.5 + rings * 0.3);
              // cold rim on the silhouette so the crystal stands out of the fog
              float fres = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.5);
              totalEmissiveRadiance += vec3(0.7, 0.82, 1.0) * fres * 0.45;
            }`)
      },
    })
    return m
  }, [uniforms])
  const shards = useMemo(() => Array.from({ length: 5 }, (_, i) => ({
    a: (i / 5) * Math.PI * 2 + 0.4, r: 3.6 + (i % 2) * 0.9, y: ((i * 5) % 5 - 2) * 0.6, s: 0.12 + (i % 3) * 0.04,
  })), [])
  const shardRefs = useRef<(THREE.Mesh | null)[]>([])
  const hov = useRayHover(ice, 2.2)
  useFrame(({ clock, pointer }, dt) => {
    const t = clock.elapsedTime
    if (group.current) {
      // sways instead of spinning, so the callouts stay pinned to it
      group.current.rotation.y += ((Math.sin(t * 0.25) * 0.35 + pointer.x * 0.18) - group.current.rotation.y) * (1 - Math.exp(-dt * 2))
      group.current.rotation.x += ((-pointer.y * 0.08) - group.current.rotation.x) * (1 - Math.exp(-dt * 2))
      group.current.position.y = Math.sin(t * 0.5) * 0.06
    }
    const h = hov.current
    if (h.target) uniforms.uHit.value.lerp(h.point, h.amt < 0.02 ? 1 : 1 - Math.exp(-dt * 6))
    uniforms.uHitAmt.value = h.amt
    uniforms.uTime.value = t
    shards.forEach((c, i) => {
      const m = shardRefs.current[i]
      if (!m) return
      const a = c.a + t * 0.04
      m.position.set(Math.cos(a) * c.r, c.y + Math.sin(t * 0.6 + i) * 0.1, Math.sin(a) * c.r - 1)
      m.rotation.set(t * 0.1 + i, t * 0.08, i)
    })
  })
  return (
    <group>
      <group ref={group}>
        <group scale={0.95}>
          <mesh ref={ice} geometry={geo} material={mat} />
          <mesh geometry={cracks} material={crackMat} />
          <mesh geometry={bubbles} material={bubbleMat} />
        </group>
        <pointLight position={[0, 0.2, 0]} color="#cfe0ff" intensity={6} distance={5} />
      </group>
      {shards.map((c, i) => <mesh key={i} ref={(m) => { shardRefs.current[i] = m }} geometry={geo} material={mat} scale={c.s * 1.4} />)}
      <Callout anchor={[-0.55, 0.9, 0.6]} elbow={[-1.5, 1.4, 0.6]} end={[-3.0, 1.4, 0.6]} align="left" title="СЦЕНА_02" sub="ЧИСТЫЙ ЛЁД" />
      <Callout anchor={[0.6, 0.2, 0.5]} elbow={[1.55, 0.75, 0.5]} end={[2.7, 0.75, 0.5]} align="right" title="T" live />
      <Callout anchor={[0.5, -1.25, 0.7]} elbow={[1.35, -1.6, 0.7]} end={[3.0, -1.6, 0.7]} align="right" title="WEBGL 2.0" sub="ЛИСТАЙТЕ ДАЛЬШЕ" />
      <Constellation />
      <pointLight position={[2, 3, 4]} color="#e8f0ff" intensity={18} distance={14} />
      <pointLight position={[-3, -1, -3]} color="#c8d8ff" intensity={14} distance={12} />
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
  const net = (out: NetNode[]) => {
    if (!group.current || !mesh.current) return 0
    const m = new THREE.Matrix4(), p = new THREE.Vector3()
    const near = blocks.map((_, i) => { mesh.current!.getMatrixAt(i, m); p.setFromMatrixPosition(m); return [p.distanceToSquared(local), p.clone(), i] as const })
      .sort((x, y) => x[0] - y[0]).slice(0, 6)
    near.forEach(([, q, i], k) => { out[k].p.copy(q); out[k].p.z += 0.5; group.current!.localToWorld(out[k].p); out[k].id = i })
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
      <HoverNet nodes={net} amount={() => hov.current.amt} />
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

const PICS = ['apple-favorite-tg', 'gerbariy-thumb', 'pole-thumb', 'maison-petale-thumb', 'zerno-thumb', 'bubble-tea-thumb', 'apple-favorite-thumb']

/**
 * An endless thread: cards crawl up the spiral forever and melt into cloud at both ends
 * (top into light mist, bottom into shade), so it never visibly starts or stops.
 */
function Thread() {
  const N = 34
  const SPAN = N * 0.36
  const group = useRef<THREE.Group>(null)
  const pics = useTexture(PICS.map((p) => `${BASE}works/${p}.webp`))
  pics.forEach((t) => { t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4 })
  const geo = useMemo(() => new RoundedBoxGeometry(1.7, 1.06, 0.07, 2, 0.1), [])
  const ui = useMemo(() => [0, 1, 2].map((v) => uiTexture(v)), [])
  const tiles = useMemo(() => Array.from({ length: N }, (_, i) => {
    const pic = i % 3 !== 2
    return {
      push: 0,
      glass: new THREE.MeshPhysicalMaterial({
        color: '#dfe7f2', transmission: 0.6, roughness: 0.32, thickness: 0.4, ior: 1.4, clearcoat: 1, clearcoatRoughness: 0.2,
        envMapIntensity: 1.2, transparent: true,
      }),
      screen: new THREE.MeshBasicMaterial({
        map: pic ? pics[i % pics.length] : ui[i % 3], transparent: true, depthWrite: false, toneMapped: false,
        color: pic ? new THREE.Color(1, 1, 1) : new THREE.Color(1.25, 1.32, 1.5),
      }),
      pic,
    }
  }), [pics, ui])
  const refs = useRef<(THREE.Group | null)[]>([])
  const dots = useRef<(THREE.Mesh | null)[]>([])
  const proxy = useRef<THREE.Mesh>(null)
  const hov = useRayHover(proxy, 2.5)
  const w = useMemo(() => new THREE.Vector3(), [])
  const shade = useMemo(() => new THREE.Color(), [])
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime
    if (group.current) group.current.rotation.y += dt * 0.08
    const crawl = t * 0.22 // cards per second travelling upward
    tiles.forEach((tl, i) => {
      const g = refs.current[i]
      if (!g) return
      const sIdx = (((i + crawl) % N) + N) % N
      const y = (sIdx - N / 2) * 0.36
      const a = sIdx * 0.55
      g.getWorldPosition(w)
      const target = hov.current.amt * (1 - smooth(w.distanceTo(hov.current.point), 0, 1.8))
      tl.push += (target - tl.push) * (1 - Math.exp(-dt * 5))
      const r = 2.7 + tl.push * 0.7
      g.position.set(Math.cos(a) * r, y, Math.sin(a) * r)
      g.rotation.set(0, -a + Math.PI / 2, 0)
      // fade into the clouds at both ends; the lower end also sinks into shade
      const up = smooth(y, SPAN * 0.18, SPAN * 0.42)
      const down = smooth(-y, SPAN * 0.16, SPAN * 0.42)
      const vis = 1 - Math.max(up, down)
      tl.glass.opacity = vis
      tl.screen.opacity = vis * (tl.pic ? 0.95 : 0.85)
      shade.setScalar(1 - down * 0.6)
      tl.glass.color.set('#dfe7f2').multiply(shade)
      g.visible = vis > 0.01
    })
    // messages travelling up the thread
    dots.current.forEach((m, k) => {
      if (!m) return
      const u = (t * 0.035 + k / 12) % 1
      const sIdx = u * N
      const y = (sIdx - N / 2) * 0.36
      m.position.set(Math.cos(sIdx * 0.55) * 2.2, y, Math.sin(sIdx * 0.55) * 2.2)
      m.visible = Math.abs(y) < SPAN * 0.36
    })
  })
  return (
    <group>
      <group ref={group}>
        {tiles.map((tl, i) => (
          <group key={i} ref={(g) => { refs.current[i] = g }}>
            <mesh geometry={geo} material={tl.glass} />
            <mesh position={[0, 0, 0.045]} material={tl.screen}><planeGeometry args={[1.5, 0.94]} /></mesh>
          </group>
        ))}
        {Array.from({ length: 12 }, (_, k) => (
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
const WORKS = [
  { slug: 'apple-favorite', name: 'Apple Favorite', kind: 'Интернет-магазин техники', url: 'https://rogday.ru/' },
  { slug: 'gerbariy', name: 'Гербарий №7', kind: 'Цветочная мастерская', url: 'https://rogday8.github.io/flow-3/' },
  { slug: 'pole', name: 'ПОЛЕ', kind: 'Цветочная лавка', url: 'https://rogday8.github.io/flow_2/' },
  { slug: 'maison-petale', name: 'Maison Pétale', kind: 'Цветочный дом', url: 'https://rogday8.github.io/flow_1/' },
  { slug: 'zerno', name: 'ЗЕРНО', kind: 'Кофейня', url: 'https://rogday8.github.io/coffeerog/' },
  { slug: 'bubble-tea', name: 'Bubble Tea Love', kind: 'Бар бабл-ти', url: 'https://rogday8.github.io/bubletealove/' },
]

/** The work under the cursor, so a click (not a drag) can open it. */
let hoveredWork: typeof WORKS[number] | null = null
const RING_R = 6.5

function Monolith({ work, a, geo, stone }: { work: typeof WORKS[number]; a: number; geo: THREE.BufferGeometry; stone: THREE.Material }) {
  const { slug } = work
  const tex = useTexture(`${BASE}works/${slug}-thumb.webp`)
  tex.colorSpace = THREE.SRGBColorSpace
  const body = useRef<THREE.Mesh>(null)
  const lift = useRef<THREE.Group>(null)
  const screen = useRef<THREE.MeshBasicMaterial>(null)
  const label = useRef<HTMLDivElement>(null)
  const hov = useRayHover(body, 2.5)
  useFrame(() => {
    const h = hov.current.amt
    if (lift.current) lift.current.position.y = h * 0.22
    if (screen.current) screen.current.color.setScalar(0.85 + h * 0.5)
    if (label.current) { label.current.style.opacity = String(h); label.current.style.transform = `translate(-50%, ${(1 - h) * 8}px)` }
    if (hov.current.target) hoveredWork = work
    else if (hoveredWork === work) hoveredWork = null
  })
  return (
    <group position={[Math.sin(a) * RING_R, 0, Math.cos(a) * RING_R]} rotation={[0, a, 0]}>
      <group ref={lift}>
        <mesh ref={body} geometry={geo} material={stone} position={[0, -0.4, 0]} castShadow receiveShadow />
        <mesh position={[0, 0.25, 0.205]}>
          <planeGeometry args={[1.98, 1.24]} />
          <meshBasicMaterial ref={screen} map={tex} toneMapped={false} />
        </mesh>
        <Html position={[0, -0.75, 0.25]} zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
          <div className="work-label" ref={label} style={{ opacity: 0 }}><b>{work.name}</b><span>{work.kind}</span><i>открыть сайт ↗</i></div>
        </Html>
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
  // the circle turns by itself; drag sideways to spin it, it keeps some momentum
  const spin = useRef({ angle: 0, vel: 0, drag: false, x: 0, moved: 0, active: false })
  useEffect(() => {
    const s = spin.current
    const down = (e: PointerEvent) => { if (!s.active) return; s.drag = true; s.x = e.clientX; s.moved = 0; document.body.classList.add('is-grabbing') }
    const move = (e: PointerEvent) => {
      if (!s.drag) return
      const dx = e.clientX - s.x
      s.x = e.clientX
      s.moved += Math.abs(dx)
      s.vel = dx * 0.0045
      s.angle += s.vel
    }
    const up = () => {
      // a click without dragging opens the hovered work
      if (s.drag && s.moved < 6 && hoveredWork) window.open(hoveredWork.url, '_blank', 'noopener')
      s.drag = false
      document.body.classList.remove('is-grabbing')
    }
    window.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      document.body.classList.remove('is-grabbing', 'can-grab', 'can-open')
    }
  }, [])
  useFrame((_, dt) => {
    const s = spin.current
    const active = Math.abs(localD(4)) < 0.45
    if (active !== s.active) { s.active = active; document.body.classList.toggle('can-grab', active) }
    document.body.classList.toggle('can-open', active && !!hoveredWork && !s.drag)
    if (!s.drag) {
      s.angle += s.vel
      s.vel *= Math.exp(-dt * 2.5)
      s.angle += dt * 0.035 * (1 - Math.min(1, Math.abs(s.vel) * 40))
    }
    if (ring.current) ring.current.rotation.y = s.angle
  })
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
        {WORKS.map((w, i) => <Monolith key={w.slug} work={w} a={(i / WORKS.length) * Math.PI * 2} geo={geo} stone={stone} />)}
      </group>
      <pointLight position={[0, 3, 0]} color="#ffe2c2" intensity={14} distance={20} />
    </group>
  )
}

export function Sections() {
  return (
    <>
      <Stage chapter={1}><Depths floor={-4.5} seed={1} /><Crystal /></Stage>
      <Stage chapter={2}><Depths floor={-6.5} seed={2} tilt /><Portal /></Stage>
      <Stage chapter={3}><Depths floor={-4.8} seed={3} /><Depths floor={5.2} seed={5} ceiling /><Thread /></Stage>
      <Stage chapter={4} span={2.2}><Depths floor={-1.7} seed={4} /><Exhibition /></Stage>
    </>
  )
}
