import { action,badge,empty,esc,field,heading,icon,input,link,options,pager,select,shortDate,statuses,textarea,time,val } from '../components/ui'
import { instrumentName,type Context } from '../lib/context'
import { schoolNow } from '../lib/domain'
import { db,read,students } from '../services/db'
import type { Enrollment,Profile,Student } from '../types'

export async function studentsPage(ctx: Context,filter: string,page: number) {
  const items = await students(filter,page)
  return heading('Alunos','Acompanhe as modalidades e a situação de cada aluno.',
    ctx.admin ? link('editar-aluno/novo',icon('plus')+' Novo aluno','primary') : '')+
    `<form class="toolbar" data-filter="alunos">${field('Modalidade',select('filter','<option value="">Todas as modalidades</option>'+options(ctx.instruments,filter)))}${action('Filtrar','secondary')}</form>
    ${items.length ? `<div class="cards">${items.slice(0,20).map(item=>`<article class="card"><h2>${esc(item.name)}</h2>
      ${item.phone ? `<p class="meta">${esc(item.phone)}</p>` : ''}
      <ul class="enrollment-list">${item.enrollments.map(e=>`<li><div><strong>${esc(instrumentName(ctx,e.instrument_id))}</strong><small>Ingresso em ${shortDate(e.enrollment_date)}</small></div>${badge(e.status)}</li>`).join('')}</ul>
      ${item.notes ? `<p class="notes">${esc(item.notes)}</p>` : ''}
      ${ctx.admin ? link('editar-aluno/'+item.id,'Editar aluno') : ''}</article>`).join('')}</div>`
      : empty('Nenhum aluno encontrado','Os alunos cadastrados para esta seleção aparecerão aqui.')}${pager('alunos/'+(filter||'todos')+'/',page,items.length>20)}`
}

export async function studentForm(ctx: Context,id: string) {
  const student = id==='novo' ? null : read<Student>(await db!.from('students').select('*,enrollments(*)').eq('id',id).single())
  const today = schoolNow().date
  const enrollmentStatuses = ['invited','confirmed','active','inactive'] as const
  return link('alunos','Voltar aos alunos')+heading(student?'Editar aluno':'Novo aluno','Cadastre os dados e selecione as modalidades do aluno.')+
    `<form class="card fields" data-op="student">
      <input type="hidden" name="id" value="${id}">
      <div class="form-grid">${field('Nome',input('name',student?.name,'required maxlength="120" autocomplete="off"'))}
      ${field('Telefone (opcional)',input('phone',student?.phone ?? '','type="tel" maxlength="40"'))}</div>
      ${field('Observações (opcional)',textarea('notes',student?.notes ?? '','maxlength="3000" rows="2"'))}
      <fieldset><legend>Modalidades</legend><div class="fields">${ctx.instruments.filter(i=>i.active || student?.enrollments.some(e=>e.instrument_id===i.id)).map(i=>{
        const enrollment = student?.enrollments.find(e=>e.instrument_id===i.id)
        return `<div class="enrollment-editor"><label class="check"><input type="checkbox" name="instrument" value="${i.id}" ${enrollment?'checked data-existing':''}>${esc(i.name)}</label>
          <div class="form-grid" data-enrollment ${enrollment?'':'hidden'}>
          ${field('Data de ingresso',input('date_'+i.id,enrollment?.enrollment_date ?? today,'required type="date" '+(enrollment?'':'disabled')))}
          ${field('Situação',select('status_'+i.id,options(enrollmentStatuses.map(key=>({id:key,name:statuses[key]})),enrollment?.status),enrollment?'':'disabled'))}</div></div>`
      }).join('') || '<p>Cadastre uma modalidade ativa em Administração.</p>'}</div></fieldset>
      <div>${action('Salvar aluno')}</div>
    </form>`
}
export async function saveStudent(data: FormData) {
  const id = val(data,'id')
  const enrollments: Enrollment[] = data.getAll('instrument').map(String).map(instrument_id=>({
    instrument_id,enrollment_date:val(data,'date_'+instrument_id),status:val(data,'status_'+instrument_id) as Enrollment['status'],
  }))
  if (!enrollments.length) throw new Error('Selecione pelo menos uma modalidade.')
  read(await db!.rpc('save_student',{p_id:id==='novo'?null:id,p_name:val(data,'name'),p_phone:val(data,'phone'),
    p_notes:val(data,'notes'),p_enrollments:enrollments}))
}

export function adminPage(ctx: Context) {
  return heading('Administração','Gerencie a equipe, as modalidades e a frequência dos encontros.')+
    `<section class="section"><div class="card-top"><h2>Professores</h2>${link('editar-professor/novo','Novo professor')}</div>
    <div class="cards">${ctx.teachers.map(t=>`<article class="card"><div class="card-top"><h3>${esc(t.name)}</h3>${badge(t.active?'active':'inactive')}</div>
      <p>${esc(t.teacher_instruments.map(i=>instrumentName(ctx,i.instrument_id)).join(', ') || 'Sem modalidades')}</p>
      <p class="meta">${t.profile_id?'Conta vinculada':'Sem conta vinculada'}</p>${link('editar-professor/'+t.id,'Editar professor')}</article>`).join('')}</div></section>
    <section class="section"><div class="card-top"><h2>Modalidades</h2>${link('editar-modalidade/novo','Nova modalidade')}</div>
    <div class="cards">${ctx.instruments.map(i=>`<article class="card"><div class="card-top"><h3>${esc(i.name)}</h3>${badge(i.active?'active':'inactive')}</div>${link('editar-modalidade/'+i.id,'Editar modalidade')}</article>`).join('')}</div></section>
    <section class="card section"><h2>Configuração da escola</h2><form class="fields" data-op="settings">
    ${field('Local',input('location',ctx.settings.location,'required maxlength="160"'))}
    <div class="form-grid">${field('Data de início',input('starts_on',ctx.settings.starts_on,'required type="date"'))}
    ${field('Horário padrão',input('start_time',time(ctx.settings.start_time),'required type="time"'))}</div>
    <fieldset><legend>Domingos do mês</legend><div class="checks">${[1,2,3,4,5].map(i=>`<label class="check"><input type="checkbox" name="weeks" value="${i}" ${ctx.settings.sunday_weeks.includes(i)?'checked':''}> ${i}º</label>`).join('')}</div></fieldset>
    <div>${action('Salvar configuração')}</div></form></section>`
}

export async function teacherForm(ctx: Context,id: string) {
  const teacher = id==='novo' ? undefined : ctx.teachers.find(t=>t.id===id)
  if (id!=='novo' && !teacher) throw {code:'PGRST116'}
  const profiles = read<Profile[]>(await db!.from('profiles').select('*').order('name'))
  const unused = profiles.filter(p=>!ctx.teachers.some(t=>t.profile_id===p.id && t.id!==id))
  return link('administracao','Voltar à administração')+heading(teacher?'Editar professor':'Novo professor','Configure as modalidades e vincule a conta autorizada no Supabase.')+
    `<form class="card fields" data-op="teacher"><input type="hidden" name="id" value="${id}">
    ${field('Nome',input('name',teacher?.name,'required maxlength="120"'))}
    ${teacher?.profile_id ? `<input type="hidden" name="profile" value="${teacher.profile_id}"><p>Conta vinculada: ${esc(profiles.find(p=>p.id===teacher.profile_id)?.name ?? teacher.name)}</p>`
      : field('Conta autorizada',select('profile','<option value="">Sem conta vinculada</option>'+options(unused)))}
    <fieldset><legend>Modalidades</legend><div class="checks">${ctx.instruments.map(i=>`<label class="check"><input type="checkbox" name="instrument" value="${i.id}" ${teacher?.teacher_instruments.some(ti=>ti.instrument_id===i.id)?'checked':''}> ${esc(i.name)}</label>`).join('')}</div></fieldset>
    <label class="check"><input type="checkbox" name="active" ${teacher?.active!==false?'checked':''}> Professor ativo</label>
    <div>${action('Salvar professor')}</div></form>`
}
export function instrumentForm(ctx: Context,id: string) {
  const instrument = id==='novo' ? undefined : ctx.instruments.find(i=>i.id===id)
  if (id!=='novo' && !instrument) throw {code:'PGRST116'}
  return link('administracao','Voltar à administração')+heading(instrument?'Editar modalidade':'Nova modalidade','Modalidades ativas entram na geração da escala mensal.')+
    `<form class="card fields" data-op="instrument"><input type="hidden" name="id" value="${id}">
    ${field('Nome',input('name',instrument?.name,'required maxlength="80"'))}
    <label class="check"><input type="checkbox" name="active" ${instrument?.active!==false?'checked':''}> Modalidade ativa</label>
    <div>${action('Salvar modalidade')}</div></form>`
}
export async function saveTeacher(data: FormData) {
  const id = val(data,'id')
  read(await db!.rpc('save_teacher',{p_id:id==='novo'?null:id,p_profile:val(data,'profile')||null,p_name:val(data,'name'),
    p_active:data.has('active'),p_instruments:data.getAll('instrument')}))
}
export async function saveInstrument(data: FormData) {
  const id = val(data,'id')
  const values = { name:val(data,'name'),active:data.has('active') }
  const query = id==='novo' ? db!.from('instruments').insert(values) : db!.from('instruments').update(values).eq('id',id)
  read(await query.select('id').single())
}
export async function saveSettings(data: FormData) {
  const sunday_weeks = data.getAll('weeks').map(Number)
  if (!sunday_weeks.length) throw new Error('Selecione pelo menos um domingo do mês.')
  read(await db!.from('settings').update({
    location:val(data,'location'),starts_on:val(data,'starts_on'),start_time:val(data,'start_time'),sunday_weeks,
  }).eq('id',true).select('id').single())
}
