import { CHAPTERS } from '../lib/journey'
import { SERVICES } from '../lib/contacts'

const BASE = import.meta.env.BASE_URL

/** Plain page for browsers without WebGL 2: the same story as text over a still of the scene. */
export function Fallback() {
  return (
    <main className="fallback" style={{ backgroundImage: `url(${BASE}og.jpg)` }}>
      <header><b>REDIS</b><span>веб-студия / 3D / WebGL</span></header>
      <ol>
        {CHAPTERS.slice(0, -1).map((c, i) => (
          <li key={c.tag}><small>{String(i + 1).padStart(2, '0')} · {c.tag}</small><h2>{c.line}</h2><p>{c.note}</p></li>
        ))}
      </ol>
      <footer>
        <div className="contact__tags">{SERVICES.map((s) => <span key={s}>{s}</span>)}</div>
        <p>Ваш браузер не поддерживает WebGL 2, поэтому показана упрощённая версия сайта.</p>
      </footer>
    </main>
  )
}
