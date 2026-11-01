import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Uniform } from 'three'
import {
  BlendFunction, BloomEffect, Effect, EffectAttribute, ChromaticAberrationEffect, DepthOfFieldEffect, EffectComposer, EffectPass,
  NoiseEffect, RenderPass, ToneMappingEffect, ToneMappingMode, VignetteEffect,
} from 'postprocessing'
import { darknessAt, progress } from '../lib/journey'
import { focus } from '../lib/camera'
import { quality } from '../lib/quality'

/** Film look: depth of field on the current subject, bloom on the lamp, ACES, grain, vignette, slight fringing. */
export function Effects() {
  const { gl, scene, camera, size } = useThree()
  const composer = useMemo(() => {
    const c = new EffectComposer(gl, { frameBufferType: THREE.HalfFloatType, multisampling: quality.multisampling })
    c.addPass(new RenderPass(scene, camera))
    // drop NaN / Inf pixels before any blur: otherwise bloom spreads one bad pixel into black flashes
    c.addPass(new EffectPass(camera, new Effect('Sanitize', `
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        bool bad = any(isnan(c)) || any(isinf(c));
        outputColor = vec4(bad ? vec3(0.6) : clamp(c, 0.0, 64.0), inputColor.a);
      }`)))
    const dof = new DepthOfFieldEffect(camera, { worldFocusRange: 9, bokehScale: 2.2, resolutionScale: 0.5 })
    dof.target = focus
    const bloom = new BloomEffect({ intensity: 1.25, luminanceThreshold: 0.82, luminanceSmoothing: 0.2, mipmapBlur: true, radius: 0.72 })
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })
    // transition: a short wash to the fog colour right at the cut, edges first, with a faint frost grain
    const veil = new Effect('Veil', `
      uniform float uAmount;
      uniform float uTime;
      uniform vec3 uColor;
      float vh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vn(vec2 p) { vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(vh(i), vh(i + vec2(1, 0)), u.x), mix(vh(i + vec2(0, 1)), vh(i + vec2(1, 1)), u.x), u.y); }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        float a = uAmount;
        if (a < 0.001) { outputColor = inputColor; return; }
        vec2 q = (uv - 0.5) * vec2(aspect, 1.0);
        float frost = vn(q * 9.0 + uTime * 0.03) * 0.6 + vn(q * 3.0 - uTime * 0.05) * 0.4;
        vec3 haze = uColor * (1.06 + 0.12 * a) + (frost - 0.5) * 0.04;
        float edge = smoothstep(0.15, 0.85, length(q));
        float m = clamp(smoothstep(0.3, 0.95, a) * (0.7 + 0.3 * edge) + smoothstep(0.85, 1.0, a), 0.0, 1.0);
        // the picture brightens a touch before it washes out, like light through cloud
        outputColor = vec4(mix(inputColor.rgb * (1.0 + a * 0.3), haze, m), inputColor.a);
      }`, { uniforms: new Map<string, Uniform>([['uAmount', new Uniform(0)], ['uTime', new Uniform(0)], ['uColor', new Uniform(new THREE.Color('#9aa3b5'))]]) })
    // speed: the picture smears outward from the centre while the camera rushes
    const zoom = new Effect('ZoomBlur', `
      uniform float uStrength;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        if (uStrength < 0.0005) { outputColor = inputColor; return; }
        vec2 dir = (uv - 0.5) * uStrength;
        vec4 acc = vec4(0.0);
        float wsum = 0.0;
        for (int i = 0; i < 12; i++) {
          float t = float(i) / 11.0;
          float w = 1.0 - t * 0.6;
          acc += texture2D(inputBuffer, uv - dir * t) * w;
          wsum += w;
        }
        outputColor = acc / wsum;
      }`, { attributes: EffectAttribute.CONVOLUTION, uniforms: new Map<string, Uniform>([['uStrength', new Uniform(0)]]) })
    const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.5 })
    const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY })
    noise.blendMode.opacity.value = 0.07
    const fringe = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0007, 0.0005), radialModulation: true, modulationOffset: 0.35 })
    // one convolution effect per pass
    if (quality.lensEffects) c.addPass(new EffectPass(camera, dof))
    c.addPass(new EffectPass(camera, bloom))
    c.addPass(new EffectPass(camera, zoom))
    c.addPass(new EffectPass(camera, tone, veil, vignette, noise))
    c.userData = { dof, veil, zoom }
    if (quality.lensEffects) c.addPass(new EffectPass(camera, fringe))
    return c
  }, [gl, scene, camera])

  useEffect(() => { composer.setSize(size.width, size.height) }, [composer, size])
  useEffect(() => () => composer.dispose(), [composer])
  useFrame((_, dt) => {
    // transitions blur out of focus and back
    const { dof, veil, zoom } = composer.userData as { dof: { bokehScale: number }; veil: { uniforms: Map<string, Uniform> }; zoom: { uniforms: Map<string, Uniform> } }
    const dive = darknessAt(progress.v)
    // no lens blur at the works: the screens must stay readable
    dof.bokehScale = (2.2 + dive * 7) * (1 - THREE.MathUtils.smoothstep(progress.v, 0.66, 0.74))
    veil.uniforms.get('uAmount')!.value = dive
    zoom.uniforms.get('uStrength')!.value = Math.pow(dive, 1.5) * 0.14
    veil.uniforms.get('uTime')!.value += dt
    const fog = scene.fog as THREE.Fog | null
    if (fog) (veil.uniforms.get('uColor')!.value as THREE.Color).copy(fog.color)
    composer.render(dt)
  }, 1)
  return null
}
