import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { HDRLoader } from 'three/examples/jsm/loaders/HDRLoader.js'
import gsap from 'gsap'
import fogVert from '../shaders/fog.vert.glsl'
import fogFrag from '../shaders/fog.frag.glsl'
import { Effects } from './Effects'
import { WindPixels } from './Atmosphere'
import { Terrain } from './Terrain'
import { LAMP_Y, Lighthouse } from './Lighthouse'
import { Sections } from './Sections'
import { CHAPTERS, darknessAt, progress } from '../lib/journey'
import { cameraAt, focus } from '../lib/camera'
import { sound } from '../lib/sound'
import { quality } from '../lib/quality'
import { PerformanceMonitor, useProgress } from '@react-three/drei'
import { load } from '../lib/load'

const BASE = import.meta.env.BASE_URL
export const OFFSET_Y = -3.6

type Ref = React.RefObject<{ v: number }>

function FogBackdrop({ reveal }: { reveal: Ref }) {
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uMouse: { value: new THREE.Vector2() },
    uRes: { value: new THREE.Vector2(1, 1) }, uReveal: { value: 0 }, uPulse: { value: 0 }, uScroll: { value: 0 },
  }), [])
  useFrame(({ clock, pointer, size, gl }) => {
    uniforms.uTime.value = clock.elapsedTime
    uniforms.uMouse.value.lerp(pointer, 0.04)
    uniforms.uRes.value.set(size.width * gl.getPixelRatio(), size.height * gl.getPixelRatio())
    uniforms.uReveal.value = reveal.current.v
    uniforms.uScroll.value = progress.v
    uniforms.uPulse.value = Math.sin(clock.elapsedTime * 1.6) * 0.5 + 0.5
  })
  return (
    <mesh frustumCulled={false} renderOrder={-10}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial uniforms={uniforms} vertexShader={fogVert} fragmentShader={fogFrag}
        depthWrite={false} depthTest={false} toneMapped={false} />
    </mesh>
  )
}

/** Two soft light shafts turning around the lamp. */
function Beam() {
  const g = useRef<THREE.Group>(null)
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vUv = uv; vP = position; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalMatrix*normal; vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vN; varying vec3 vV; varying vec3 vP; uniform float uTime;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
      float n3(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i), h(i+vec3(1,0,0)), f.x), mix(h(i+vec3(0,1,0)), h(i+vec3(1,1,0)), f.x), f.y),
                   mix(mix(h(i+vec3(0,0,1)), h(i+vec3(1,0,1)), f.x), mix(h(i+vec3(0,1,1)), h(i+vec3(1,1,1)), f.x), f.y), f.z); }
      void main(){ vec3 n = vN / max(length(vN), 1e-5); vec3 v = vV / max(length(vV), 1e-5);
        float edge = pow(abs(dot(n, v)), 2.2);
        float dust = 0.55 + 0.45 * n3(vP * 0.9 + vec3(0.0, uTime * 0.3, 0.0));
        float a = pow(clamp(1.0 - vUv.y, 0.0, 1.0), 2.2) * 0.3 * edge * dust; gl_FragColor = vec4(vec3(1.0, 0.7, 0.38) * a, a); }`,
  }), [])
  useFrame(({ clock }, dt) => { if (g.current) g.current.rotation.y += dt * 0.3; mat.uniforms.uTime.value = clock.elapsedTime })
  return (
    <group ref={g} position={[0, LAMP_Y, 0]}>
      {[0, Math.PI].map((r) => (
        <group key={r} rotation={[0, r, 0]}>
          <mesh position={[9, 0, 0]} rotation={[0, 0, -Math.PI / 2]} material={mat}>
            <coneGeometry args={[2.2, 18, 32, 1, true]} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/** Overcast sky HDRI (Poly Haven, CC0) as image-based light; the visible background stays the fog shader. */
function Env() {
  const { gl, scene } = useThree()
  useEffect(() => {
    const pm = new THREE.PMREMGenerator(gl)
    let rt: THREE.WebGLRenderTarget | null = null
    let alive = true
    new HDRLoader().load(`${BASE}env/overcast_soil_puresky_1k.hdr`, (tex) => {
      if (!alive) { tex.dispose(); return }
      tex.mapping = THREE.EquirectangularReflectionMapping
      rt = pm.fromEquirectangular(tex)
      tex.dispose()
      scene.environment = rt.texture
      scene.environmentIntensity = 0.35
    })
    return () => { alive = false; rt?.dispose(); pm.dispose(); scene.environment = null }
  }, [gl, scene])
  return null
}

// fog per chapter: wide and light on the surface, close and denser in the depths
const FOG = [
  { c: '#9aa3b5', near: 22, far: 150 },
  { c: '#7d879b', near: 6, far: 34 },
  { c: '#a2aabb', near: 8, far: 40 },
  { c: '#8a94a8', near: 6, far: 32 },
  { c: '#a9b0bf', near: 10, far: 46 },
  { c: '#a9b0bf', near: 10, far: 46 },
]
const fogCols = FOG.map((f) => new THREE.Color(f.c))

function FogRig() {
  const { scene } = useThree()
  useFrame(() => {
    const fog = scene.fog as THREE.Fog | null
    if (!fog) return
    const c = THREE.MathUtils.clamp(progress.v, 0, 1) * (CHAPTERS.length - 1)
    const i = Math.min(Math.floor(c), CHAPTERS.length - 2)
    const u = THREE.MathUtils.smoothstep(c - i, 0.3, 0.7)
    fog.color.lerpColors(fogCols[i], fogCols[i + 1], u)
    fog.near = THREE.MathUtils.lerp(FOG[i].near, FOG[i + 1].near, u)
    fog.far = THREE.MathUtils.lerp(FOG[i].far, FOG[i + 1].far, u)
    // mid-dive the fog closes in, the world dissolves before the next scene comes out of it
    const dive = darknessAt(progress.v)
    fog.near *= 1 - dive * 0.9
    fog.far *= 1 - dive * 0.75
  })
  return null
}

/** The surface world is drawn only while the camera is up there. */
function Surface({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => { if (ref.current) ref.current.visible = progress.v < 0.16 })
  return <group ref={ref}>{children}</group>
}

/** Hands loader progress to the preloader, which lives outside this chunk. */
function LoadReporter() {
  const { progress, active } = useProgress()
  useEffect(() => { load.progress = active ? Math.min(progress, 99) : 100 }, [progress, active])
  return null
}

const _pos = new THREE.Vector3()
const _look = new THREE.Vector3()

function Rig({ intro }: { intro: Ref }) {
  useFrame(({ camera, pointer }, dt) => {
    progress.v += (progress.raw - progress.v) * Math.min(1, dt * 3.5)
    cameraAt(progress.v, _pos, _look)
    // narrow screens: step back so the subject still fits horizontally
    const aspect = (camera as THREE.PerspectiveCamera).aspect
    if (aspect < 1.3) _pos.sub(_look).multiplyScalar(Math.pow(1.3 / aspect, 0.95)).add(_look)
    const k = intro.current.v
    _pos.y += (1 - k) * 7
    _pos.z += (1 - k) * 18
    _pos.x += pointer.x * 0.9
    _pos.y += pointer.y * 0.45
    const f = 1 - Math.exp(-dt * 5)
    camera.position.lerp(_pos, f)
    focus.lerp(_look, f)
    camera.lookAt(focus)
    // dive: lens stretches and the horizon tilts a little, then everything settles
    const dive = darknessAt(progress.v)
    const cam = camera as THREE.PerspectiveCamera
    const fov = 34 + dive * 9
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix() }
    camera.rotateZ(Math.sin(progress.v * 23) * dive * 0.04)
    sound.update(performance.now() / 1000, dive)
  })
  return null
}

export default function Scene({ ready }: { ready: boolean }) {
  const intro = useRef({ v: 0 })
  const reveal = useRef({ v: 0 })
  // resolution steps down by itself if the frame rate drops
  const [dpr, setDpr] = useState(quality.maxDpr)
  useEffect(() => {
    if (!ready) return
    gsap.to(reveal.current, { v: 1, duration: 1.6, ease: 'power2.out' })
    gsap.to(intro.current, { v: 1, duration: 4.2, ease: 'power3.out' })
  }, [ready])
  return (
    <Canvas style={{ position: 'fixed', inset: 0 }} flat shadows
      camera={{ fov: 34, near: 0.1, far: 400, position: [0, 9, 34] }} dpr={[1, dpr]}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false }}>
      <PerformanceMonitor onDecline={() => setDpr((d) => Math.max(1, d - 0.5))} flipflops={3} onFallback={() => setDpr(1)} />
      <fog attach="fog" args={['#9aa3b5', 22, 150]} />
      <FogRig />
      <LoadReporter />
      <FogBackdrop reveal={reveal} />
      <Env />
      <hemisphereLight args={['#dfe6f2', '#3c4456', 0.45]} />
      <directionalLight position={[-12, 16, 9]} intensity={1.7} color="#eef2ff" castShadow
        shadow-mapSize={[quality.shadowMap, quality.shadowMap]} shadow-bias={-0.0004} shadow-normalBias={0.04}
        shadow-camera-left={-12} shadow-camera-right={12} shadow-camera-top={14} shadow-camera-bottom={-8} shadow-camera-far={60} />
      <Suspense fallback={null}>
        <Surface>
          <Terrain />
          <group position={[0, OFFSET_Y, 0]}>
            <Lighthouse />
            <Beam />
            <pointLight position={[0, LAMP_Y, 0]} color="#ffa24d" intensity={6} distance={14} />
          </group>
        </Surface>
        <Sections />
      </Suspense>
      <WindPixels count={quality.particles} />
      <Rig intro={intro} />
      <Effects />
    </Canvas>
  )
}
