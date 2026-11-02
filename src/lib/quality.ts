/** One switch for heavy effects: phones, tablets and weak machines get a lighter scene. */
const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
const small = typeof screen !== 'undefined' && Math.min(screen.width, screen.height) < 820
const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 8 : 8

export const LOW = coarse || small || cores <= 4

/** The visitor asked the system for less motion: no smooth scroll, no lens tilt, calmer snow. */
export const REDUCED = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

export const hasWebGL2 = (() => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2')
    gl?.getExtension('WEBGL_lose_context')?.loseContext() // free the probe context right away
    return !!gl
  } catch { return false }
})()

export const quality = {
  maxDpr: LOW ? 1.25 : 1.5,
  terrainSeg: LOW ? 150 : 240,
  particles: REDUCED ? 600 : LOW ? 1200 : 2600,
  shadowMap: LOW ? 1024 : 1536,
  multisampling: LOW ? 0 : 2,
  /** depth of field and chromatic fringing are the most expensive passes */
  lensEffects: !LOW,
}
