import * as THREE from 'three'

const BASE = import.meta.env.BASE_URL
const loader = new THREE.TextureLoader()
const cache = new Map<string, TriMaps>()

export interface TriMaps { diff: THREE.Texture; nor: THREE.Texture; rough: THREE.Texture }

/** Loads a Poly Haven texture set from public/textures (diff / nor_gl / rough, 1k webp). */
export function triMaps(id: string): TriMaps {
  let m = cache.get(id)
  if (m) return m
  const load = (kind: string, srgb: boolean) => {
    const t = loader.load(`${BASE}textures/${id}_${kind}_1k.webp`)
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
    t.anisotropy = 4
    return t
  }
  m = { diff: load('diff', true), nor: load('nor_gl', false), rough: load('rough', false) }
  cache.set(id, m)
  return m
}

type Shader = THREE.WebGLProgramParametersWithUniforms

interface Opts {
  scale: number
  mix?: number
  normal?: number
  /** 0..1: how much snow settles on upward-facing surfaces */
  snow?: number
  /** further shader edits, run after the triplanar ones */
  extra?: (shader: Shader) => void
  key?: string
}

/**
 * Projects a texture set onto a MeshStandardMaterial from three world axes, so meshes without UVs
 * still get stone grain. Albedo is used as luminance only: the model keeps its own palette and baked AO.
 * Exposes vTriPos / vTriN (world position / normal) and triP / triWt to later chunks.
 */
export function applyTriplanar(mat: THREE.MeshStandardMaterial, maps: TriMaps, { scale, mix = 0.75, normal = 0.6, snow = 0, extra, key = '' }: Opts) {
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      tTriDiff: { value: maps.diff }, tTriNor: { value: maps.nor }, tTriRough: { value: maps.rough },
      uTriScale: { value: scale }, uTriMix: { value: mix }, uTriNormal: { value: normal }, uSnow: { value: snow },
    })
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTriPos;\nvarying vec3 vTriN;')
      .replace('#include <project_vertex>', `#include <project_vertex>
        vTriPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTriN = mat3(modelMatrix) * objectNormal;`)
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vTriPos;
        varying vec3 vTriN;
        uniform sampler2D tTriDiff, tTriNor, tTriRough;
        uniform float uTriScale, uTriMix, uTriNormal, uSnow;
        // every normalize is guarded: a single NaN pixel turns black and bloom smears it over the screen
        vec3 safeN(vec3 n) { float l = length(n); return l > 1e-5 ? n / l : vec3(0.0, 1.0, 0.0); }
        vec3 triW(vec3 n) { vec3 w = pow(abs(n), vec3(4.0)) + 1e-4; return w / (w.x + w.y + w.z); }
        vec4 tri(sampler2D t, vec3 p, vec3 w) {
          return texture2D(t, p.zy) * w.x + texture2D(t, p.xz) * w.y + texture2D(t, p.xy) * w.z;
        }
        float triHash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 triNw = safeN(vTriN);
        vec3 triP = vTriPos * uTriScale;
        vec3 triWt = triW(triNw);
        vec4 triD = tri(tTriDiff, triP, triWt);
        float triL = dot(triD.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb *= mix(1.0, clamp(triL * 2.4, 0.0, 1.6), uTriMix);
        // snow: settles where the surface faces up, broken up by the texture
        float triSnow = uSnow * smoothstep(0.45, 0.8, triNw.y + (triL - 0.45) * 0.9);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.74, 0.77, 0.83) * (0.85 + 0.3 * triL), triSnow);`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness;
        roughnessFactor *= mix(1.0, tri(tTriRough, triP, triWt).r * 1.5, uTriMix);
        roughnessFactor = mix(roughnessFactor, 0.55, triSnow);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 tx = texture2D(tTriNor, triP.zy).xyz * 2.0 - 1.0;
          vec3 ty = texture2D(tTriNor, triP.xz).xyz * 2.0 - 1.0;
          vec3 tz = texture2D(tTriNor, triP.xy).xyz * 2.0 - 1.0;
          vec3 off = vec3(0.0, tx.y, tx.x) * triWt.x + vec3(ty.x, 0.0, ty.y) * triWt.y + vec3(tz.x, tz.y, 0.0) * triWt.z;
          vec3 wn = safeN(triNw + off * uTriNormal * (1.0 - triSnow * 0.7));
          normal = safeN((viewMatrix * vec4(wn, 0.0)).xyz);
        }`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // snow glints
        float triSpark = step(0.9965, triHash(floor(vTriPos * 38.0))) * triSnow;
        totalEmissiveRadiance += vec3(0.9, 0.95, 1.0) * triSpark * 1.6;`)
    extra?.(shader)
  }
  mat.customProgramCacheKey = () => `tri-${scale}-${mix}-${normal}-${snow}-${key}`
  mat.needsUpdate = true
}
