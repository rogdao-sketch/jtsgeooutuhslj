import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import {
  BlendFunction, BloomEffect, Effect, ChromaticAberrationEffect, DepthOfFieldEffect, EffectComposer, EffectPass,
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
    c.userData = { dof }
    const bloom = new BloomEffect({ intensity: 1.25, luminanceThreshold: 0.82, luminanceSmoothing: 0.2, mipmapBlur: true, radius: 0.72 })
    const tone = new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC })
    const vignette = new VignetteEffect({ offset: 0.32, darkness: 0.5 })
    const noise = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY })
    noise.blendMode.opacity.value = 0.07
    const fringe = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0.0007, 0.0005), radialModulation: true, modulationOffset: 0.35 })
    // one convolution effect per pass
    if (quality.lensEffects) c.addPass(new EffectPass(camera, dof))
    c.addPass(new EffectPass(camera, bloom))
    c.addPass(new EffectPass(camera, tone, vignette, noise))
    if (quality.lensEffects) c.addPass(new EffectPass(camera, fringe))
    return c
  }, [gl, scene, camera])

  useEffect(() => { composer.setSize(size.width, size.height) }, [composer, size])
  useEffect(() => () => composer.dispose(), [composer])
  useFrame((_, dt) => {
    // transitions blur out of focus and back
    const { dof } = composer.userData as { dof: { bokehScale: number } }
    dof.bokehScale = 2.2 + darknessAt(progress.v) * 9
    composer.render(dt)
  }, 1)
  return null
}
