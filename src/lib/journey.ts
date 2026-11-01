/** Scroll progress shared between Lenis (DOM) and the render loop. raw: 0..1 from scroll, v: smoothed. */
export const progress = { raw: 0, v: 0 }

export interface Chapter {
  tag: string
  line: string
  note: string
}

export const CHAPTERS: Chapter[] = [
  { tag: 'Сигнал', line: 'Сайты, которые видно издалека', note: 'Веб-студия: сайты, 3D, магазины, Telegram Mini Apps' },
  { tag: '3D и WebGL', line: 'Свет внутри: сцены, которые живут в браузере', note: '3D-сайты, WebGL-сцены, анимации' },
  { tag: 'Магазины', line: 'Витрина, которая собирается сама', note: 'Интернет-магазины с админ-панелью и заказами в Telegram' },
  { tag: 'Telegram Mini Apps', line: 'Магазин в одном касании', note: 'Мини-приложения и боты внутри Telegram' },
  { tag: 'Работы', line: 'Шесть маяков', note: 'Apple Favorite · Гербарий №7 · ПОЛЕ · Maison Pétale · ЗЕРНО · Bubble Tea Love' },
  { tag: 'Контакты', line: 'Зажжём ваш сигнал', note: '' },
]

/** Scenes are stacked downwards: the hero sits on the surface, every next chapter lives deeper in the fog. */
export const SECTION_Y = [0, -70, -140, -210, -280]

// how dark the screen gets on the way from chapter i to i+1 (long dives hide behind darkness)
export const DARK = [1, 1, 1, 1, 0]

const N = CHAPTERS.length
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smoother = (x: number) => x * x * x * (x * (x * 6 - 15) + 10)

/** Where we are between two chapters: i is the segment, e is the eased 0..1 inside it (with holds at the ends). */
export function segment(p: number) {
  const c = clamp01(p) * (N - 1)
  const i = Math.min(Math.floor(c), N - 2)
  const u = c - i
  return { i, e: smoother(clamp01((u - 0.18) / 0.64)) }
}

/** 0..1 darkness of the transition veil. */
export function darknessAt(p: number) {
  const { i, e } = segment(p)
  return Math.pow(Math.sin(e * Math.PI), 1.6) * DARK[i]
}

export const chapterAt = (p: number) => Math.min(CHAPTERS.length - 1, Math.round(p * (CHAPTERS.length - 1)))
