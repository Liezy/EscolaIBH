import { action,badge,deleteForm,empty,esc,field,heading,icon,input,instrumentFilter,link,options,pager,select,shortDate,statuses,textarea,val } from '../components/ui'
import { instrumentName,type Context } from '../lib/context'
import { schoolNow } from '../lib/domain'
import { db,profiles,read,students } from '../services/db'
import type { Enrollment,Student } from '../types'

export async function studentsPage(ctx: Context,filter: string,page: number) {
  const items = await students(filter,page)
  return heading('Alunos','',link('editar-aluno/novo',icon('plus')+' Novo aluno','primary'))+
    instrumentFilter('alunos',ctx.instruments,filter)+`
    ${items.length ? `<div class="cards">${items.slice(0,20).map(item=>`<article class="card"><h2>${esc(item.name)}</h2>
      ${item.phone ? `<p class="meta">${esc(item.phone)}</p>` : ''}
      <ul class="enrollment-list">${item.enrollments.map(e=>`<li><div><strong>${esc(instrumentName(ctx,e.instrument_id))}</strong><small>Ingresso em ${shortDate(e.enrollment_date)}</small></div>${badge(e.status)}</li>`).join('')}</ul>
      ${item.notes ? `<p class="notes">${esc(item.notes)}</p>` : ''}
      ${link('editar-aluno/'+item.id,'Editar aluno')}</article>`).join('')}</div>`
      : empty('Nenhum aluno encontrado',filter ? 'Selecione outra modalidade para ver mais alunos.' : '')}${pager('alunos/'+(filter||'todos')+'/',page,items.length>20)}`
}

export async function studentForm(ctx: Context,id: string) {
  const student = id==='novo' ? null : read<Student>(await db!.from('students').select('*,enrollments(*)').eq('id',id).single())
  const today = schoolNow().date
  const enrollmentStatuses = ['invited','confirmed','active','inactive'] as const
  const instruments = ctx.instruments.filter(i=>i.active || student?.enrollments.some(e=>e.instrument_id===i.id))
  if (!instruments.length && !student) return link('alunos','Voltar aos alunos','quiet')+heading('Novo aluno')+
    empty('Nenhuma modalidade ativa','É necessário ter uma modalidade ativa para cadastrar um aluno.')+
    (ctx.admin ? link('administracao','Abrir administração','quiet') : '')
  return link('alunos','Voltar aos alunos','quiet')+heading(student?'Editar aluno':'Novo aluno')+
    `<form class="card fields" data-op="student">
      <input type="hidden" name="id" value="${id}">
      <div class="form-grid">${field('Nome',input('name',student?.name,'required maxlength="120" autocomplete="off"'))}
      ${field('Telefone (opcional)',input('phone',student?.phone ?? '','type="tel" maxlength="40"'))}</div>
      ${field('Observações (opcional)',textarea('notes',student?.notes ?? '','maxlength="3000" rows="2"'))}
      <fieldset><legend>Modalidades</legend><div class="fields">${instruments.map(i=>{
        const enrollment = student?.enrollments.find(e=>e.instrument_id===i.id)
        return `<div class="enrollment-editor"><label class="check"><input class="checkbox checkbox-sm" type="checkbox" name="instrument" value="${i.id}" ${enrollment?'checked data-existing':''}>${esc(i.name)}${i.active?'':' (inativa)'}</label>
          <div class="form-grid" data-enrollment ${enrollment?'':'hidden'}>
          ${field('Data de ingresso',input('date_'+i.id,enrollment?.enrollment_date ?? today,'required type="date" '+(enrollment?'':'disabled')))}
          ${field('Situação',select('status_'+i.id,options(enrollmentStatuses.map(key=>({id:key,name:statuses[key]})),enrollment?.status),enrollment?'':'disabled'))}</div></div>`
      }).join('')}</div></fieldset>
      <div>${action('Salvar aluno')}</div>
    </form>`+(student ? `<div class="section">${deleteForm('delete-student',student.id,'Remover aluno','O cadastro do aluno e seus vínculos com modalidades serão apagados.')}</div>` : '')
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

export async function adminPage(ctx: Context) {
  const accounts = await profiles()
  const linkedTeachers = ctx.teachers.filter(t=>t.profile_id)
  const legacyTeachers = ctx.teachers.filter(t=>!t.profile_id)
  return heading('Administração')+
    `<section class="section"><div class="card-top"><h2>Professores</h2>${link('editar-professor/novo','Novo professor')}</div>
    <div class="cards">${linkedTeachers.map(t=>{
      const account = accounts.find(p=>p.id===t.profile_id)
      return `<article class="card"><div class="card-top"><h3>${esc(t.name)}</h3>${badge(t.active && account?.active?'active':'inactive')}</div>
      <p>${esc(t.teacher_instruments.map(i=>instrumentName(ctx,i.instrument_id)).join(', ') || 'Sem modalidades')}</p>
      <p class="meta">${account?.role==='admin'?'Administrador':'Professor'}</p>${link('editar-professor/'+t.id,'Editar professor')}</article>`
    }).join('') || empty('Nenhum professor com conta vinculada','Use Novo professor para cadastrar a equipe.')}</div>
    ${legacyTeachers.length ? `<details class="card section"><summary>Cadastros antigos sem conta (${legacyTeachers.length})</summary>
      <div class="list mt-3">${legacyTeachers.map(t=>`<a class="list-row" href="#editar-professor/${esc(t.id)}"><strong class="row-copy">${esc(t.name)}</strong><span>Vincular conta</span></a>`).join('')}</div>
      <form class="mt-3" data-op="remove-unlinked-teachers" data-confirm="Serão apagados os cadastros de professores sem conta e sem encontros ou registros associados.">
        ${action('Excluir cadastros sem uso','danger')}</form>
      <p class="meta">Cadastros vinculados a encontros ou registros são preservados.</p></details>` : ''}
    </section>
    <section class="section"><div class="card-top"><h2>Modalidades</h2>${link('editar-modalidade/novo','Nova modalidade')}</div>
    <div class="cards">${ctx.instruments.map(i=>`<article class="card"><div class="card-top"><h3>${esc(i.name)}</h3>${badge(i.active?'active':'inactive')}</div>${link('editar-modalidade/'+i.id,'Editar modalidade')}</article>`).join('')}</div></section>
    <section class="card section"><h2>Configuração da escola</h2><form class="fields" data-op="settings">
    ${field('Local',input('location',ctx.settings.location,'required maxlength="160"'))}
    <div class="form-grid">${field('Data de início',input('starts_on',ctx.settings.starts_on,'required type="date"'))}
    ${field('Horário padrão',input('start_time',ctx.settings.start_time,'required type="time" step="1"'))}</div>
    <fieldset class="fieldset"><legend class="fieldset-legend">Domingos do mês</legend><div class="checks">${[1,2,3,4,5].map(i=>`<label class="check"><input class="checkbox checkbox-sm" type="checkbox" name="weeks" value="${i}" ${ctx.settings.sunday_weeks.includes(i)?'checked':''}> ${i}º</label>`).join('')}</div></fieldset>
    <div>${action('Salvar configuração')}</div></form></section>`
}

export async function teacherForm(ctx: Context,id: string) {
  const teacher = id==='novo' ? undefined : ctx.teachers.find(t=>t.id===id)
  if (id!=='novo' && !teacher) throw {code:'PGRST116'}
  const linked = teacher?.profile_id ? (await profiles()).find(p=>p.id===teacher.profile_id) : undefined
  const self = linked?.id===ctx.profile.id
  return link('administracao','Voltar à administração','quiet')+heading(teacher?'Editar professor':'Novo professor')+
    `<form class="card fields" data-op="teacher"><input type="hidden" name="id" value="${id}">
    ${field('Nome',input('name',teacher?.name,'required maxlength="120"'))}
    ${linked ? `<p class="meta">Conta vinculada a ${esc(linked.name)}.</p>` :
      field('E-mail da conta',input('email','','required type="email" maxlength="254" autocomplete="off"'))+
      field('Senha inicial para uma conta nova',input('initial_password','','type="password" minlength="8" maxlength="72" autocomplete="new-password"'))+
      '<p class="meta">Use pelo menos 8 caracteres. Se a pessoa já tiver conta, deixe a senha em branco.</p>'}
    ${self ? '<input type="hidden" name="role" value="admin"><p class="meta">Seu acesso é de administrador.</p>' :
      field('Permissão',select('role',options([{id:'teacher',name:'Professor'},{id:'admin',name:'Administrador'}],linked?.role),'required'))}
    ${self ? '' : '<p class="meta">Administradores podem gerenciar professores, acessos, alunos, escalas e registros.</p>'}
    <fieldset class="fieldset"><legend class="fieldset-legend">Modalidades</legend><div class="checks">${ctx.instruments.map(i=>`<label class="check"><input class="checkbox checkbox-sm" type="checkbox" name="instrument" value="${i.id}" ${teacher?.teacher_instruments.some(ti=>ti.instrument_id===i.id)?'checked':''}> ${esc(i.name)}</label>`).join('')}</div></fieldset>
    ${self ? '<input type="hidden" name="active" value="on">' : `<label class="check"><input class="toggle toggle-sm" type="checkbox" name="active" ${linked?.active??(teacher?.active!==false)?'checked':''}> Acesso ativo</label>`}
    <div>${action(teacher?'Salvar professor':'Cadastrar professor')}</div></form>`
}
export function instrumentForm(ctx: Context,id: string) {
  const instrument = id==='novo' ? undefined : ctx.instruments.find(i=>i.id===id)
  if (id!=='novo' && !instrument) throw {code:'PGRST116'}
  return link('administracao','Voltar à administração','quiet')+heading(instrument?'Editar modalidade':'Nova modalidade')+
    `<form class="card fields" data-op="instrument"><input type="hidden" name="id" value="${id}">
    ${field('Nome',input('name',instrument?.name,'required maxlength="80"'))}
    <label class="check"><input class="toggle toggle-sm" type="checkbox" name="active" ${instrument?.active!==false?'checked':''}> Modalidade ativa</label>
    <div>${action('Salvar modalidade')}</div></form>`
}
export async function saveTeacher(data: FormData) {
  const id = val(data,'id')
  const email = val(data,'email')
  const name = val(data,'name')
  const password = String(data.get('initial_password') ?? '')
  if (!name) throw new Error('Informe o nome do professor.')
  const params = {p_id:id==='novo'?null:id,p_email:email||null,p_name:name,
    p_active:data.has('active'),p_instruments:data.getAll('instrument'),p_role:val(data,'role')}
  const first = await db!.rpc('save_teacher_access',params)
  if (first.error?.code==='23505') throw new Error('Essa conta já está vinculada a outro cadastro de professor. Abra o cadastro existente em Administração.')
  if (first.error?.code!=='P1001') {
    read(first)
    return password ? 'linked_with_existing_password' : 'linked'
  }
  if (password.length<8 || new TextEncoder().encode(password).length>72) {
    throw new Error('Para criar uma conta nova, informe uma senha inicial de pelo menos 8 caracteres e até 72 bytes.')
  }
  const {data:result,error,response} = await db!.functions.invoke<{code:string}>('create-teacher',{body:{
    id:params.p_id,email,name,password,active:params.p_active,instruments:params.p_instruments,role:params.p_role,
  }})
  let status = response?.status
  if (error && !status) {
    const url = new URL('/functions/v1/create-teacher',import.meta.env.VITE_SUPABASE_URL)
    status = (await fetch(url,{signal:AbortSignal.timeout(4000)}).catch(()=>null))?.status
  }
  if (!error && result?.code==='created') return 'created'
  if (!error && result?.code==='linked') return 'linked_with_existing_password'
  if (status===404) throw new Error('Publique a função create-teacher no Supabase para criar contas pelo app.')
  if (status===401) throw new Error('A função recusou a autenticação. Entre novamente e confira a verificação JWT legada se o erro persistir.')
  if (status===403) throw new Error('Somente um administrador ativo pode criar contas.')
  const code = response ? (await response.json().catch(()=>null))?.code : null
  if (code==='invalid_password') throw new Error('A senha inicial não atende aos requisitos do Supabase.')
  if (code==='account_created_link_failed') throw new Error('A conta foi criada, mas falta vinculá-la. Salve novamente com o mesmo e-mail e a senha em branco.')
  if (code==='already_linked') throw new Error('Essa conta já está vinculada a outro cadastro de professor.')
  if (code==='account_exists') throw new Error('Este e-mail já tem conta. Confira o endereço e salve novamente com a senha em branco.')
  throw new Error('Não foi possível concluir o cadastro. Confira a função create-teacher no Supabase e tente novamente.')
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
