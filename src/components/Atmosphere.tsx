import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { darknessAt, progress } from '../lib/journey'

const BOX = 36

/**
 * Pixel snow: tiny square flakes carried by gusty wind. The field wraps around the camera,
 * so every chapter has it. A few flakes are warm "signal" pixels that flicker.
 */
export function WindPixels({ count = 2600 }: { count?: number }) {
  const { geo, mat } = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const p = new Float32Array(count * 3), s = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      p[i * 3] = Math.random() * BOX
      p[i * 3 + 1] = Math.random() * BOX
      p[i * 3 + 2] = Math.random() * BOX
      s[i] = Math.random()
    }
    g.setAttribute('position', new THREE.BufferAttribute(p, 3))
    g.setAttribute('seed', new THREE.BufferAttribute(s, 1))
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uPx: { value: Math.min(window.devicePixelRatio, 2) }, uRush: { value: 0 }, uRushT: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float uTime; uniform vec3 uCam; uniform float uPx; uniform float uRush; uniform float uRushT;
        varying float vA; varying float vWarm;
        void main() {
          float gust = 1.0 + 0.8 * sin(uTime * 0.35 + seed * 2.0) * sin(uTime * 0.13);
          vec3 wind = vec3(1.6, -0.35, 0.5) * uTime * (0.6 + seed * 0.8) * gust;
          vec3 q = position + wind;
          // during a dive the flakes stream upward past the camera
          q.y += uRushT * (8.0 + seed * 10.0);
          q.y += sin(uTime * 1.3 + seed * 40.0) * 0.25;
          q.x += sin(uTime * 0.9 + seed * 25.0) * 0.35;
          // wrap into a box centred on the camera
          q = mod(q - uCam + ${BOX / 2}.0, ${BOX}.0) - ${BOX / 2}.0 + uCam;
          vec4 mv = viewMatrix * vec4(q, 1.0);
          float d = -mv.z;
          float fade = smoothstep(0.6, 2.5, d) * (1.0 - smoothstep(10.0, ${BOX / 2 - 1}.0, d));
          vWarm = step(0.965, seed) * (0.5 + 0.5 * sin(uTime * 6.0 + seed * 90.0));
          vA = (0.35 + seed * 0.5) * fade * (1.0 + uRush * 1.5);
          gl_PointSize = uPx * (1.2 + seed * 2.2) * (1.0 + uRush * 1.8) * (14.0 / max(d, 1.0));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vA; varying float vWarm;
        void main() {
          vec2 c = abs(gl_PointCoord - 0.5);
          float sq = 1.0 - smoothstep(0.38, 0.5, max(c.x, c.y));
          vec3 col = mix(vec3(0.95, 0.97, 1.0), vec3(2.2, 1.3, 0.55), vWarm);
          gl_FragColor = vec4(col, sq * vA);
        }`,
    })
    return { geo: g, mat: m }
  }, [count])
  useFrame(({ clock, camera }, dt) => {
    mat.uniforms.uTime.value = clock.elapsedTime
    mat.uniforms.uCam.value.copy(camera.position)
    const rush = darknessAt(progress.v)
    mat.uniforms.uRush.value = rush
    mat.uniforms.uRushT.value += rush * dt
  })
  return <points geometry={geo} material={mat} frustumCulled={false} />
}

const mistFrag = /* glsl */ `
  varying vec3 vWorld;
  varying vec2 vUv;
  uniform float uTime;
  uniform float uSeed;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y); }
  float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.07 + 13.1; a *= 0.5; } return v; }
  void main() {
    vec2 p = vWorld.xz * 0.09 + uSeed * 7.0;
    float n = fbm(p + vec2(uTime * 0.02, uTime * 0.013) + fbm(p * 1.6 - uTime * 0.015));
    float r = length(vUv - 0.5) * 2.0;
    float a = smoothstep(0.3, 0.8, n) * (1.0 - smoothstep(0.55, 1.0, r));
    vec3 col = mix(vec3(0.62, 0.66, 0.74), vec3(0.93, 0.95, 0.98), smoothstep(0.4, 0.9, n));
    gl_FragColor = vec4(col, a * 0.75);
  }`
const mistVert = /* glsl */ `
  varying vec3 vWorld; varying vec2 vUv;
  void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`

/**
 * Surroundings for the scenes in the depths: a drifting floor of mist below the object
 * and huge faint rings far behind it, so the void reads as a place.
 */
export function Depths({ floor, seed, tilt = false }: { floor: number; seed: number; tilt?: boolean }) {
  const mats = useMemo(() => [0, 1].map((i) => new THREE.ShaderMaterial({
    vertexShader: mistVert, fragmentShader: mistFrag, transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uSeed: { value: seed + i * 0.37 } },
  })), [seed])
  const rings = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color(1.15, 1.18, 1.25), transparent: true, opacity: 0.18, depthWrite: false, toneMapped: false }), [])
  const ringGroup = useMemo(() => ({ current: null as THREE.Group | null }), [])
  useFrame(({ clock }) => {
    mats.forEach((m) => { m.uniforms.uTime.value = clock.elapsedTime })
    if (ringGroup.current) ringGroup.current.rotation.z = clock.elapsedTime * 0.02
  })
  return (
    <group>
      {mats.map((m, i) => (
        <mesh key={i} material={m} rotation={[-Math.PI / 2, 0, 0]} position={[0, floor - i * 0.9, 0]}>
          <planeGeometry args={[70, 70]} />
        </mesh>
      ))}
      <group ref={(g) => { ringGroup.current = g }} position={[0, 1, -26]} rotation={[tilt ? 0.5 : 0.15, 0, 0]}>
        {[13, 18.5, 25].map((r, i) => (
          <mesh key={r} material={rings} rotation={[0, 0, i * 0.7]}>
            <torusGeometry args={[r, 0.07 + i * 0.03, 8, 160, Math.PI * (1.4 + i * 0.2)]} />
          </mesh>
        ))}
      </group>
    </group>
  )
}
