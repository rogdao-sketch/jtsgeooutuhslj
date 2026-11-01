/** One switch for heavy effects: phones, tablets and weak machines get a lighter scene. */
const coarse = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
const small = typeof screen !== 'undefined' && Math.min(screen.width, screen.height) < 820
const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 8 : 8

export const LOW = coarse || small || cores <= 4

export const quality = {
  maxDpr: LOW ? 1.5 : 2,
  terrainSeg: LOW ? 170 : 320,
  particles: LOW ? 1200 : 2600,
  shadowMap: LOW ? 1024 : 2048,
  multisampling: LOW ? 0 : 4,
  /** depth of field and chromatic fringing are the most expensive passes */
  lensEffects: !LOW,
}
