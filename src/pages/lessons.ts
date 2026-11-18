import { action,badge,deleteForm,empty,esc,field,formatDate,heading,icon,input,instrumentFilter,instrumentIcon,link,options,pager,select,shortDate,statuses,textarea,time,val } from '../components/ui'
import { instrumentName,teacherName,type Context } from '../lib/context'
import { calendarDays,mayRecord,schoolNow,shiftMonth,started } from '../lib/domain'
import { db,details,history,latest,monthMeetings,nextMeetings,read,sessionsToRecord } from '../services/db'
import type { Meeting,RecordEntry } from '../types'

export const validId = (value: string) => /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value)
export const validMonth = (value: string) => /^20\d\d-(0[1-9]|1[0-2])$/.test(value)
const sessionLink = (item: Meeting) => 'encontro/'+item.id
const title = (ctx: Context,item: Meeting) => esc(instrumentName(ctx,item.instrument_id))
const staff = (ctx: Context,item: Meeting) => esc(teacherName(ctx,item.teacher_id))
const newMeeting = (month: string) => 'editar-encontro/novo/'+month
const meetingRow = (ctx: Context,item: Meeting) => `<a class="list-row" href="#${sessionLink(item)}">
  ${instrumentIcon(instrumentName(ctx,item.instrument_id))}
  <span class="row-copy"><strong>${title(ctx,item)}</strong><small>${time(item.start_time)} · ${staff(ctx,item)}</small></span>
  ${badge(item.status)}
</a>`
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
  return heading('Início')+`
    <div class="dashboard-grid">
      ${ctx.teacherId || !ctx.admin ? `<section class="card"><h2>Minha próxima aula</h2>
      ${upcoming.mine ? `<p><strong>${title(ctx,upcoming.mine)}</strong> · ${shortDate(upcoming.mine.date)} às ${time(upcoming.mine.start_time)}</p>${link(sessionLink(upcoming.mine),'Preparar aula','primary')}`
        : '<p class="muted">Você ainda não tem aulas na escala.</p>'}</section>` : ''}
      <section class="card"><h2>Próximo encontro</h2>
      ${next ? `<p><strong>${formatDate(next.date,{weekday:'long',day:'numeric',month:'long'})}</strong></p>
        <p class="meta">${esc(ctx.settings.location)}</p><div class="list">${upcoming.day.map(item=>meetingRow(ctx,item)).join('')}</div>`
        : `<p class="muted">Nenhum encontro agendado.</p>${link('escalas','Ver escala','quiet')}`}</section>
    </div>
    <section class="section"><h2>Últimos registros</h2><div class="list">${records.map(({instrument,record})=>record ?
      `<a class="list-row" href="#${sessionLink(record.session)}">${instrumentIcon(instrument.name)}<span class="row-copy"><strong>${esc(instrument.name)}</strong><small>${shortDate(record.session.date)} · ${esc(teacherName(ctx,record.teacher_id))}</small><span class="snippet">${esc(record.content)}</span></span></a>`
      : `<div class="list-row">${instrumentIcon(instrument.name)}<span class="row-copy"><strong>${esc(instrument.name)}</strong><small>Sem registros</small></span></div>`).join('') || empty('Sem modalidades ativas','')}</div></section>`
}

export async function schedule(ctx: Context, month: string, day: string) {
  const meetings = await monthMeetings(month)
  const hasActiveInstrument = ctx.instruments.some(instrument=>instrument.active)
  const groups = new Map<string,Meeting[]>()
  for (const item of meetings) {
    const group = groups.get(item.date)
    if (group) group.push(item)
    else groups.set(item.date,[item])
  }
  const {leading,dates} = calendarDays(month)
  const selected = dates.includes(day) ? day : ''
  const today = schoolNow().date
  const monthLabel = formatDate(month+'-01',{month:'long',year:'numeric'})
  const visible = selected ? [[selected,groups.get(selected) ?? []] as const] : [...groups]
  return heading('Escalas')+`
    <div class="schedule-layout">
      <section class="card calendar-card" aria-label="Calendário da escala">
        <div class="month-control">
          ${link('escalas/'+shiftMonth(month,-1),icon('left'),'square','Mês anterior')}
          <h2>${monthLabel}</h2>
          ${link('escalas/'+shiftMonth(month,1),icon('right'),'square','Próximo mês')}
        </div>
        <div class="calendar-grid">
          ${['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map(label=>`<span class="calendar-weekday" aria-hidden="true">${label}</span>`).join('')}
          ${'<span aria-hidden="true"></span>'.repeat(leading)}
          ${dates.map(date=>{
            const count = groups.get(date)?.length ?? 0
            const label = formatDate(date,{weekday:'long',day:'numeric',month:'long'})+(count ? `, ${count} ${count===1?'encontro':'encontros'}` : '')
            return `<a class="btn calendar-day min-w-0 px-0 whitespace-nowrap ${date===selected?'btn-primary':'btn-ghost'} ${date===today?'calendar-today':''}"
              href="#escalas/${month}/${date}" ${date===selected?'aria-current="true"':''} aria-label="${esc(label)}">
              <span>${Number(date.slice(-2))}</span>${count ? '<span class="calendar-dot" aria-hidden="true"></span>' : ''}</a>`
          }).join('')}
        </div>
        <div class="schedule-actions">
          ${link(newMeeting(selected || month),icon('plus')+' Novo encontro','primary')}
          ${hasActiveInstrument ? `<form data-op="generate"><input type="hidden" name="month" value="${month}">${action('Gerar datas','secondary')}</form>` : ''}
        </div>
      </section>
      <section class="agenda">
        <div class="card-top"><h2>${selected ? formatDate(selected,{day:'numeric',month:'long'}) : 'Agenda do mês'}</h2>
          ${selected ? link('escalas/'+month,'Ver mês','quiet') : ''}</div>
        ${visible.length ? visible.map(([date,items])=>`<div class="agenda-group">${selected ? '' : `<h3>${formatDate(date,{weekday:'long',day:'numeric',month:'long'})}</h3>`}
          ${items.length ? `<div class="list">${items.map(item=>meetingRow(ctx,item)).join('')}</div>` : empty('Sem encontros neste dia','')}</div>`).join('')
          : empty('Sem encontros neste mês',!hasActiveInstrument ? 'É necessário ter uma modalidade ativa para gerar encontros.' : '')}
      </section>
    </div>`
}

export async function meetingPage(ctx: Context,id: string, editRecord = false) {
  const {meeting,record} = await details(id)
  const previous = await latest(meeting.instrument_id,meeting.date)
  const canEdit = record && (ctx.admin || record.teacher_id===ctx.teacherId)
  const canCreate = !record && mayRecord(meeting,ctx.admin,ctx.teacherId)
  const editing = Boolean(editRecord && canEdit)
  const editor = `<form class="fields" data-op="record">
      <input type="hidden" name="id" value="${id}">
      ${record ? `<input type="hidden" name="record_id" value="${esc(record.id)}">` : ''}
      ${field('Conteúdo ensinado',textarea('content',record?.content,'required maxlength="5000" rows="3"'))}
      ${field('Observações',textarea('observations',record?.observations,'maxlength="3000" rows="2"'))}
      ${field('Para a próxima aula',textarea('suggestions',record?.next_lesson_suggestions,'maxlength="3000" rows="2"'))}
      <div class="flex flex-wrap gap-2">${action('Salvar registro')}${editing ? link(sessionLink(meeting),'Voltar ao registro','quiet') : ''}</div></form>`
  const earlier = previous ? `<p class="meta">${shortDate(previous.session.date)} · ${esc(teacherName(ctx,previous.teacher_id))}</p>${recordText(previous)}` : ''
  const unavailable = meeting.status==='canceled' ? 'Encontros cancelados não podem receber registros.'
    : !meeting.teacher_id ? 'Atribua um professor ao encontro para liberar o registro.'
    : !started(meeting) ? 'O registro fica disponível a partir do horário do encontro.'
    : 'O professor escalado ou um administrador pode registrar esta aula.'
  return link('escalas/'+meeting.date.slice(0,7),'Voltar à escala','quiet')+
    heading(instrumentName(ctx,meeting.instrument_id),shortDate(meeting.date)+' · '+time(meeting.start_time),
    link('editar-encontro/'+id,'Editar encontro'))+
    `<div class="card meeting-meta"><strong>${staff(ctx,meeting)}</strong>${badge(meeting.status)}</div>
    ${record || canCreate ? `<section class="card section"><h2>${editing ? 'Editar registro' : record ? 'Registro desta aula' : 'Registrar aula'}</h2>
      ${!record || editing ? editor : recordText(record)}
      ${record && !editing ? `<div class="record-actions">
        ${canEdit ? link(sessionLink(meeting)+'/editar-registro','Editar registro') : ''}
        ${ctx.admin ? deleteForm('delete-record',record.id,'Excluir registro','Excluir o conteúdo, as observações e as recomendações desta aula?') : ''}
      </div><p class="meta">Atualizado em ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(record.updated_at))}</p>` : ''}</section>` : `<p class="section muted">${unavailable}</p>`}
    ${previous ? (record || canCreate ? `<details class="card section"><summary>Registro anterior</summary>${earlier}</details>`
      : `<section class="card section continuation"><h2>Registro anterior</h2>${earlier}</section>`)
      : (!record && !canCreate ? '<p class="section muted">Nenhum registro anterior para esta modalidade.</p>' : '')}`
}

export async function historyPage(ctx: Context,filter: string,page: number) {
  const records = await history(filter,page)
  return heading('Registros','',ctx.admin || ctx.teacherId ? link('novo-registro',icon('plus')+' Novo registro','primary') : '')+instrumentFilter('registros',ctx.instruments,filter)+
    `${records.length ? `<div class="list">${records.slice(0,20).map(record=>`<a class="list-row" href="#${sessionLink(record.session)}">${instrumentIcon(instrumentName(ctx,record.session.instrument_id))}<span class="row-copy"><strong>${title(ctx,record.session)}</strong><small>${shortDate(record.session.date)} · ${esc(teacherName(ctx,record.teacher_id))}</small><span class="snippet">${esc(record.content)}</span></span></a>`).join('')}</div>`
      : empty('Nenhum registro encontrado','')}${pager('registros/'+(filter||'todos')+'/',page,records.length>20)}`
}

export async function recordPicker(ctx: Context,page: number) {
  const now = schoolNow()
  const sessions = ctx.admin || ctx.teacherId ? await sessionsToRecord(now.date,now.time,ctx.admin ? undefined : ctx.teacherId,page) : []
  return link('registros','Voltar aos registros','quiet')+heading('Novo registro','Escolha o encontro que deseja registrar.')+
    (sessions.length ? `<div class="list">${sessions.slice(0,20).map(item=>
      `<a class="list-row" href="#${sessionLink(item)}">${instrumentIcon(instrumentName(ctx,item.instrument_id))}
      <span class="row-copy"><strong>${title(ctx,item)}</strong><small>${shortDate(item.date)} · ${time(item.start_time)} · ${staff(ctx,item)}</small></span></a>`).join('')}</div>`
      : empty('Nenhuma aula disponível para registro',ctx.admin ? 'Confira se o encontro já começou e tem um professor atribuído.' : 'Os encontros disponíveis aparecem aqui após o horário de início.'))+
    pager('novo-registro/',page,sessions.length>20)
}

export async function meetingForm(ctx: Context,id: string, month: string, day = '') {
  const existing = id==='novo' ? null : await details(id)
  const item = existing?.meeting
  const locked = Boolean(existing?.record)
  const today = schoolNow().date
  const selectedDay = calendarDays(month).dates.includes(day) ? day : ''
  const instruments = ctx.instruments.filter(i=>i.active || i.id===item?.instrument_id)
  const instrument = item?.instrument_id ?? instruments[0]?.id
  if (!instruments.length) return heading('Novo encontro')+
    empty('Nenhuma modalidade ativa','É necessário ter uma modalidade ativa para criar encontros.')+
    (ctx.admin ? link('administracao','Abrir administração','quiet') : link('escalas/'+month,'Voltar à escala','quiet'))
  const eligibleIds = new Set(locked ? [] : read<string[]>(await db!.rpc('available_teacher_ids')))
  const eligible = ctx.teachers.filter(t=>eligibleIds.has(t.id))
  const assigned = ctx.teachers.find(t=>t.id===item?.teacher_id)
  const unavailable = assigned && !eligible.includes(assigned) ? [assigned] : []
  return link(item ? sessionLink(item) : 'escalas/'+month+(selectedDay ? '/'+selectedDay : ''),item ? 'Voltar ao encontro' : 'Voltar à escala','quiet')+
    heading(item ? 'Editar encontro' : 'Novo encontro')+
    `<form class="card fields" data-op="meeting">
    <input type="hidden" name="id" value="${id}">
    <div class="form-grid">
      ${field('Data',input('date',item?.date ?? (selectedDay || (today.startsWith(month+'-') ? today : '')),'required type="date"'))}
      ${field('Horário',input('start_time',item?.start_time ?? ctx.settings.start_time,'required type="time" step="1"'))}
      ${locked && item ? `<p><strong>Modalidade</strong><br>${title(ctx,item)}</p>
        <p><strong>Professor</strong><br>${staff(ctx,item)}</p>
        <p><strong>Situação</strong><br>${badge(item.status)}</p>` : `
      ${field('Modalidade',select('instrument_id',options(instruments,instrument),'required'))}
      ${field('Professor',select('teacher_id','<option value="">A definir</option>'+
        options([...eligible,...unavailable.map(t=>({...t,name:t.name+' (conta indisponível)'}))],item?.teacher_id ?? '')))}
      ${field('Situação',select('status',options(['planned','completed','canceled'].map(key=>({id:key,name:statuses[key as Meeting['status']]})),item?.status),'required'))}`}
    </div>${locked ? '<p class="meta">Com um registro de aula salvo, apenas a data e o horário podem ser alterados.</p>' : ''}<div>${action('Salvar encontro')}</div></form>`+
    (item ? `<div class="section">${locked ? '<p class="meta">Para excluir o encontro, exclua primeiro o registro da aula.</p>' :
      deleteForm('delete-meeting',item.id,'Excluir encontro','Excluir este encontro da escala?')}</div>` : '')
}

export async function saveMeeting(data: FormData) {
  const id = val(data,'id')
  const timing = { date:val(data,'date'),start_time:val(data,'start_time') }
  const status = val(data,'status')
  const teacher = val(data,'teacher_id') || null
  if (status==='completed' && !teacher) throw new Error('Selecione um professor para marcar o encontro como realizado.')
  const values = data.has('status') ? {...timing,instrument_id:val(data,'instrument_id'),teacher_id:teacher,status} : timing
  const query = id==='novo' ? db!.from('class_sessions').insert(values) : db!.from('class_sessions').update(values).eq('id',id)
  return read<{id:string}>(await query.select('id').single()).id
}

export async function saveRecord(data: FormData) {
  const id = val(data,'id')
  const recordId = val(data,'record_id')
  const values = { content:val(data,'content'),observations:val(data,'observations'),next_lesson_suggestions:val(data,'suggestions') }
  if (!values.content) throw {code:'23514'}
  if (recordId) {
    read(await db!.from('lesson_records').update(values).eq('id',recordId).eq('session_id',id).select('id').single())
  } else {
    const {meeting} = await details(id)
    read(await db!.from('lesson_records').insert({...values,session_id:id,teacher_id:meeting.teacher_id}).select('id').single())
  }
}
