import calendar from 'lucide-static/icons/calendar-days.svg?raw'
import house from 'lucide-static/icons/house.svg?raw'
import book from 'lucide-static/icons/notebook-pen.svg?raw'
import users from 'lucide-static/icons/users-round.svg?raw'
import settings from 'lucide-static/icons/settings.svg?raw'
import music from 'lucide-static/icons/audio-lines.svg?raw'
import guitar from 'lucide-static/icons/guitar.svg?raw'
import drum from 'lucide-static/icons/drum.svg?raw'
import logout from 'lucide-static/icons/log-out.svg?raw'
import plus from 'lucide-static/icons/plus.svg?raw'
import clock from 'lucide-static/icons/clock-3.svg?raw'
import chevron from 'lucide-static/icons/chevron-down.svg?raw'

const icons = { calendar,house,book,users,settings,music,guitar,drum,logout,plus,clock,chevron }
export const icon = (name: keyof typeof icons) => '<span class="icon" aria-hidden="true">'+icons[name]+'</span>'
export const instrumentIcon = (name: string) => icon(/viol|guit/i.test(name) ? 'guitar' : /bateria|percuss/i.test(name) ? 'drum' : 'music')
export function esc(value: unknown) {
  const entities: Record<string,string> = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }
  return String(value ?? '').replace(/[&<>"']/g, character => entities[character])
}
export function formatDate(date: string, options: Intl.DateTimeFormatOptions = { dateStyle:'long' }) {
  return new Intl.DateTimeFormat('pt-BR',{...options,timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))
}
export const time = (value: string) => value.slice(0,5)
export const shortDate = (date: string) => formatDate(date,{day:'2-digit',month:'2-digit',year:'numeric'})
export const statuses = {
  planned:'Planejado',completed:'Realizado',canceled:'Cancelado',
  invited:'Convidado',confirmed:'Confirmado',active:'Ativo',inactive:'Inativo',
}
export const badge = (status: keyof typeof statuses) => '<span class="badge '+status+'">'+statuses[status]+'</span>'
export const empty = (heading: string, body: string) => '<div class="empty">'+icon('calendar')+'<strong>'+esc(heading)+'</strong><p>'+esc(body)+'</p></div>'
export const heading = (title: string, description: string, action = '') => `<header class="page-heading"><div><h1>${esc(title)}</h1><p>${esc(description)}</p></div>${action}</header>`
export const options = (items: {id:string;name:string}[], selected = '') => items.map(item =>
  `<option value="${esc(item.id)}" ${item.id===selected?'selected':''}>${esc(item.name)}</option>`).join('')
export const select = (name: string, content: string, attrs = '') => `<span class="select"><select name="${name}" ${attrs}>${content}</select>${icon('chevron')}</span>`
export const link = (href: string, label: string, kind = 'secondary', accessibleLabel = '') =>
  `<a class="button ${kind}" href="#${href}" ${accessibleLabel ? 'aria-label="'+esc(accessibleLabel)+'"' : ''}>${label}</a>`
export const action = (label: string, kind = 'primary') => `<button class="button ${kind}" type="submit">${label}</button>`
export const field = (label: string, input: string) => `<label class="field"><span>${label}</span>${input}</label>`
export const input = (name: string, value = '', attrs = '') => `<input name="${name}" value="${esc(value)}" ${attrs}>`
export const textarea = (name: string, value = '', attrs = '') => `<textarea name="${name}" ${attrs}>${esc(value)}</textarea>`
export const val = (data: FormData, key: string) => String(data.get(key) ?? '').trim()
export function pager(path: string, page: number, more: boolean) {
  return page || more ? `<div class="pager">${page ? link(path+(page-1),'Página anterior') : ''}${more ? link(path+(page+1),'Próxima página') : ''}</div>` : ''
}
