import { CONTACTS, SERVICES } from '../lib/contacts'

export function Contact({ on }: { on: boolean }) {
  const links: [string, string][] = []
  if (CONTACTS.telegram) links.push(['Telegram', CONTACTS.telegram])
  if (CONTACTS.email) links.push(['Почта', `mailto:${CONTACTS.email}`])
  if (CONTACTS.phone) links.push([CONTACTS.phone, `tel:${CONTACTS.phone.replace(/[^+\d]/g, '')}`])
  return (
    <div className={`contact${on ? ' contact--on' : ''}`}>
      <div className="contact__tags">{SERVICES.map((s) => <span key={s}>{s}</span>)}</div>
      <div className="contact__links">
        {links.length
          ? links.map(([label, href]) => <a key={href} href={href} target="_blank" rel="noreferrer">{label}</a>)
          : <span className="contact__soon">Контакты скоро появятся</span>}
      </div>
    </div>
  )
}
