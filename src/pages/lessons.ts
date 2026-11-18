import { action,badge,empty,esc,field,heading,icon,input,instrumentIcon,link,options,pager,select,shortDate,statuses,textarea,time,val } from '../components/ui'
import { instrumentName,teacherName,type Context } from '../lib/context'
import { mayRecord,schoolNow,shiftMonth } from '../lib/domain'
import { db,details,history,latest,monthMeetings,nextMeetings,read } from '../services/db'
import type { Meeting,RecordEntry } from '../types'

export const validId = (value: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
export const validMonth = (value: string) => /^20\d\d-(0[1-9]|1[0-2])$/.test(value)
const sessionLink = (item: Meeting) => 'encontro/'+item.id
const title = (ctx: Context,item: Meeting) => esc(instrumentName(ctx,item.instrument_id))
const staff = (ctx: Context,item: Meeting) => esc(teacherName(ctx,item.teacher_id))
const newMeeting = (month: string) => 'editar-encontro/novo/'+month
const recordText = (record: RecordEntry) => `<dl class="record-text">
  <dt>Conteúdo ensinado</dt><dd>${esc(record.content)}</dd>
  <dt>Observações</dt><dd>${esc(record.observations || 'Sem observações.')}</dd>
  <dt>Recomendações para a próxima aula</dt><dd>${esc(record.next_lesson_suggestions || 'Sem recomendações.')}</dd></dl>`

export async function dashboard(ctx: Context) {
  const now = schoolNow()
  const active = ctx.instruments.filter(item=>item.active)
  const [upcoming,records] = await Promise.all([
    nextMeetings(now.date,now.time,ctx.teacherId),
    Promise.all(active.map(async instrument=>({instrument,record:await latest(instrument.id)}))),
  ])
  const next = upcoming.day[0]
  return heading('Início','Acompanhe a escala e dê continuidade às aulas da escola.')+`
    <div class="dashboard-grid">
      <section class="card featured"><div class="section-label">${icon('calendar')} Próximo encontro</div>
      ${next ? `<h2>${new Intl.DateTimeFormat('pt-BR',{day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(next.date+'T12:00:00Z'))}</h2>
        <p>${esc(ctx.settings.location)}</p><div class="featured-lessons">${upcoming.day.map(item=>`<a href="#${sessionLink(item)}">${instrumentIcon(instrumentName(ctx,item.instrument_id))}<span><strong>${title(ctx,item)}</strong><small>${staff(ctx,item)} · ${time(item.start_time)}</small></span></a>`).join('')}</div>`
        : `<h2>Sem encontros previstos</h2><p>${esc(ctx.settings.location)}</p>${link('escalas','Consultar escala','light')}`}</section>
      <section class="card next-card"><div class="section-label">${icon('clock')} Minha próxima aula</div>
      ${upcoming.mine ? `<h2>${title(ctx,upcoming.mine)}</h2><p>${shortDate(upcoming.mine.date)} · ${time(upcoming.mine.start_time)}</p>${link(sessionLink(upcoming.mine),'Abrir encontro')}`
        : '<h2>Nenhuma aula atribuída</h2><p>Suas próximas aulas aparecerão aqui quando a escala for definida.</p>'}</section>
    </div>
    <section class="section"><h2>Últimos registros</h2><div class="cards">${records.map(({instrument,record})=>`
      <article class="card"><div class="section-label">${instrumentIcon(instrument.name)} ${esc(instrument.name)}</div>
      ${record ? `<p class="snippet">${esc(record.content)}</p><p class="meta">${shortDate(record.session.date)} · ${esc(teacherName(ctx,record.teacher_id))}</p>${link(sessionLink(record.session),'Ver registro')}`
        : '<p class="muted">Ainda não há registro para esta modalidade.</p>'}</article>`).join('') || empty('Sem modalidades','As modalidades ativas aparecerão aqui.')}</div></section>
    <section class="section"><h2>Acesso rápido</h2><div class="quick">${link('escalas',icon('calendar')+' Escalas')}${link('registros',icon('book')+' Registros')}${link('alunos',icon('users')+' Alunos')}</div></section>`
}

export async function schedule(ctx: Context, month: string) {
  const meetings = await monthMeetings(month)
  const groups = new Map<string,Meeting[]>()
  for (const item of meetings) {
    const group = groups.get(item.date)
    if (group) group.push(item)
    else groups.set(item.date,[item])
  }
  return heading('Escalas','Encontros e professores responsáveis por modalidade.',
    ctx.admin ? link(newMeeting(month),icon('plus')+' Novo encontro','primary') : '')+
    `<div class="toolbar"><div class="month-control">${link('escalas/'+shiftMonth(month,-1),'‹','secondary','Mês anterior')}${new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(month+'-01T12:00:00Z'))}${link('escalas/'+shiftMonth(month,1),'›','secondary','Próximo mês')}</div>
    ${ctx.admin ? `<form data-op="generate"><input type="hidden" name="month" value="${month}">${action('Gerar encontros do mês','secondary')}</form>` : ''}</div>
    ${meetings.length ? [...groups].map(([date,items])=>`<section class="section"><h2>${new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long',timeZone:'UTC'}).format(new Date(date+'T12:00:00Z'))}</h2><div class="cards">${items.map(item=>`<article class="card"><div class="card-top"><div class="section-label">${instrumentIcon(instrumentName(ctx,item.instrument_id))} ${title(ctx,item)}</div>${badge(item.status)}</div><p>${time(item.start_time)} · ${staff(ctx,item)}</p>${link(sessionLink(item),'Abrir encontro')}</article>`).join('')}</div></section>`).join('')
      : empty('Sem encontros neste mês',ctx.admin ? 'Gere as datas previstas ou crie um encontro manualmente.' : 'A escala aparecerá aqui assim que os encontros forem cadastrados.')}`
}

export async function meetingPage(ctx: Context,id: string) {
  const {meeting,record} = await details(id)
  const previous = await latest(meeting.instrument_id,meeting.date)
  const canEdit = record && (ctx.admin || record.teacher_id===ctx.teacherId)
  return link('escalas/'+meeting.date.slice(0,7),'Voltar à escala')+
    heading(instrumentName(ctx,meeting.instrument_id),shortDate(meeting.date)+' · '+time(meeting.start_time),
    ctx.admin ? link('editar-encontro/'+id,'Editar encontro') : '')+
    `<div class="card meeting-meta"><strong>${staff(ctx,meeting)}</strong>${badge(meeting.status)}</div>
    <section class="card section continuation"><div class="section-label">${icon('book')} Continuidade da aula</div>
    ${previous ? `<h2>Registro anterior</h2><p class="meta">${shortDate(previous.session.date)} · ${esc(teacherName(ctx,previous.teacher_id))}</p>${recordText(previous)}`
      : '<p>Ainda não há registro anterior para esta modalidade.</p>'}</section>
    <section class="card section"><h2>${record ? 'Registro desta aula' : 'Registrar aula'}</h2>
    ${record && !canEdit ? recordText(record) : canEdit || (!record && mayRecord(meeting,ctx.admin,ctx.teacherId)) ?
    `<form class="fields" data-op="record">
      <input type="hidden" name="id" value="${id}">
      ${field('Conteúdo ensinado',textarea('content',record?.content,'required maxlength="5000" rows="3"'))}
      ${field('Observações sobre os alunos',textarea('observations',record?.observations,'maxlength="3000" rows="2"'))}
      ${field('Recomendações para a próxima aula',textarea('suggestions',record?.next_lesson_suggestions,'maxlength="3000" rows="2"'))}
      <div>${action('Salvar registro')}</div></form>` : '<p>O professor escalado pode registrar a aula após o início do encontro.</p>'}
    ${record ? `<p class="meta">Atualizado em ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(record.updated_at))}</p>` : ''}</section>`
}

export async function historyPage(ctx: Context,filter: string,page: number) {
  const records = await history(filter,page)
  return heading('Registros','Histórico das aulas e recomendações para os próximos encontros.')+
    `<form class="toolbar" data-filter="registros">${field('Modalidade',select('filter','<option value="">Todas as modalidades</option>'+options(ctx.instruments,filter)))}${action('Filtrar','secondary')}</form>
    ${records.length ? `<div class="cards">${records.slice(0,20).map(record=>`<article class="card"><div class="section-label">${instrumentIcon(instrumentName(ctx,record.session.instrument_id))} ${title(ctx,record.session)}</div><p class="meta">${shortDate(record.session.date)} · ${esc(teacherName(ctx,record.teacher_id))}</p><p class="snippet">${esc(record.content)}</p>${link(sessionLink(record.session),'Consultar registro')}</article>`).join('')}</div>`
      : empty('Nenhum registro encontrado','Os conteúdos registrados pelos professores aparecerão aqui.')}${pager('registros/'+(filter||'todos')+'/',page,records.length>20)}`
}

export async function meetingForm(ctx: Context,id: string, month: string) {
  const item = id==='novo' ? null : (await details(id)).meeting
  const instruments = ctx.instruments.filter(i=>i.active || i.id===item?.instrument_id)
  const instrument = item?.instrument_id ?? instruments[0]?.id
  const teachers = ctx.teachers.filter(t=>t.id===item?.teacher_id || t.active)
  return link('escalas/'+(item?.date.slice(0,7) ?? month),'Voltar à escala')+
    heading(item ? 'Editar encontro' : 'Novo encontro','Defina data, horário, modalidade e professor responsável.')+
    `<form class="card fields" id="meeting-form" data-op="meeting">
    <input type="hidden" name="id" value="${id}">
    <div class="form-grid">
      ${field('Data',input('date',item?.date ?? month+'-01','required type="date"'))}
      ${field('Horário',input('start_time',time(item?.start_time ?? ctx.settings.start_time),'required type="time"'))}
      ${field('Modalidade',select('instrument_id',options(instruments,instrument),'required'))}
      ${field('Professor',select('teacher_id','<option value="">A definir</option>'+teachers.map(t=>
        `<option value="${t.id}" data-instruments="${t.teacher_instruments.map(i=>i.instrument_id).concat(t.id===item?.teacher_id?[item.instrument_id]:[]).join(' ')}" ${t.id===item?.teacher_id?'selected':''}>${esc(t.name)}</option>`).join('')))}
      ${field('Situação',select('status',options(['planned','completed','canceled'].map(key=>({id:key,name:statuses[key as Meeting['status']]})),item?.status),'required'))}
    </div><div>${action('Salvar encontro')}</div></form>`
}

export function filterTeachers(form: HTMLFormElement) {
  const instrument = form.elements.namedItem('instrument_id') as HTMLSelectElement
  const teacher = form.elements.namedItem('teacher_id') as HTMLSelectElement
  for (const option of teacher.options) {
    option.hidden = option.disabled = Boolean(option.value && !option.dataset.instruments?.split(' ').includes(instrument.value))
  }
  if (teacher.selectedOptions[0]?.disabled) teacher.value=''
}

export async function saveMeeting(data: FormData) {
  const id = val(data,'id')
  const values = { date:val(data,'date'), start_time:val(data,'start_time'),
    instrument_id:val(data,'instrument_id'), teacher_id:val(data,'teacher_id') || null,status:val(data,'status') }
  const query = id==='novo' ? db!.from('class_sessions').insert(values) : db!.from('class_sessions').update(values).eq('id',id)
  return read<{id:string}>(await query.select('id').single()).id
}

export async function saveRecord(data: FormData) {
  const id = val(data,'id')
  const {meeting,record} = await details(id)
  const values = { content:val(data,'content'),observations:val(data,'observations'),next_lesson_suggestions:val(data,'suggestions') }
  if (!values.content) throw {code:'23514'}
  const query = record ? db!.from('lesson_records').update(values).eq('id',record.id)
    : db!.from('lesson_records').insert({...values,session_id:id,teacher_id:meeting.teacher_id})
  read(await query.select('id').single())
}
