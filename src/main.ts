import type { Session } from '@supabase/supabase-js'
import '@fontsource-variable/manrope'
import schoolLogo from './assets/escola-alianca.jpg'
import { confirmAction,dismissConfirmation } from './components/confirmation'
import { action,esc,field,icon,input,link,val } from './components/ui'
import type { Context } from './lib/context'
import { schoolNow } from './lib/domain'
import { dashboard,historyPage,meetingForm,meetingPage,recordPicker,saveMeeting,saveRecord,schedule,validId,validMonth } from './pages/lessons'
import { adminPage,instrumentForm,saveInstrument,saveSettings,saveStudent,saveTeacher,studentForm,studentsPage,teacherForm } from './pages/people'
import { db,message,passwordCallback,profile,read,reference } from './services/db'
import './styles/app.css'

const app = document.querySelector<HTMLDivElement>('#app')!
const navigation = [
  ['inicio','Início','house'],['escalas','Escalas','calendar'],['registros','Registros','book'],['alunos','Alunos','users'],
] as const
let session: Session | null = null
let renderId = 0
let success = ''
const passwordKey = 'alianca:password-setup'
const currentMonth = () => schoolNow().date.slice(0,7)
const route = () => location.hash.slice(1).split('/')
const notify = (text: string, failure = false) => {
  const element = app.querySelector<HTMLElement>(failure ? '#error' : '#notice')
  if (element) element.textContent = text
}
const feedback = '<div class="alert alert-success alert-soft" id="notice" role="status"></div><div class="alert alert-error alert-soft" id="error" role="alert"></div>'
const mark = `<img class="school-logo" src="${schoolLogo}" width="640" height="640" alt="Escola Aliança">`
const brand = `<span class="school-symbol" aria-hidden="true"><img src="${schoolLogo}" alt=""></span><strong>Escola Aliança</strong>`

function welcome(body: string) {
  app.innerHTML = `<main class="login"><section class="card login-card"><div class="brand-banner">${mark}</div><div class="card-body">${body}${feedback}</div></section></main>`
}
function login() {
  welcome(`<h1>Entre na sua conta</h1>
  <form class="fields" data-op="login">${field('E-mail',input('email','','required type="email" autocomplete="username"'))}
  ${field('Senha',input('password','','required type="password" autocomplete="current-password"'))}${action('Entrar')}</form>
  ${link('recuperar-senha','Esqueci a senha','quiet')}`)
}
function recoverPassword() {
  welcome(`<h1>Recuperar senha</h1><form class="fields" data-op="recover">
  ${field('E-mail',input('email','','required type="email" autocomplete="email"'))}${action('Enviar link')}</form>
  ${link('inicio','Voltar ao login','quiet')}`)
}
function setupPassword() {
  const attrs = 'required type="password" minlength="8" autocomplete="new-password"'
  welcome(`<h1>Definir senha</h1><p>Use pelo menos 8 caracteres.</p><form class="fields" data-op="password">
  ${field('Nova senha',input('password','',attrs))}${field('Confirmar senha',input('confirmation','',attrs))}
  ${action('Salvar senha')}</form><form data-op="logout">${action('Sair','quiet')}</form>`)
}
function shell(ctx: Context) {
  const [page='inicio',,extra] = route()
  const active = page==='novo-registro' || extra==='editar-registro' ? 'registros' : page.includes('encontro') ? 'escalas' : page==='editar-aluno' ? 'alunos'
    : ['editar-professor','editar-modalidade'].includes(page) ? 'administracao' : page
  const tabs = ctx.admin ? [...navigation,['administracao','Administração','settings'] as const] : navigation
  const key = JSON.stringify([ctx.profile.id,ctx.profile.name,ctx.admin])
  if (!app.querySelector('.layout') || app.dataset.shellKey!==key) {
    const initials = ctx.profile.name.trim().split(/\s+/).slice(0,2).map(word=>word[0]).join('').toUpperCase()
    app.innerHTML = `<div class="layout"><header class="topbar"><div class="topbar-inner">
      <a class="app-brand" href="#inicio">${brand}</a>
      <nav class="desktop-nav" aria-label="Navegação principal">${tabs.map(([href,label,symbol])=>`<a data-nav="${href}" href="#${href}">${icon(symbol)}<span>${label}</span></a>`).join('')}</nav>
      <div class="topbar-actions">
        ${ctx.admin ? `<a class="btn btn-square btn-ghost mobile-admin" href="#administracao" data-nav="administracao" aria-label="Administração">${icon('settings')}</a>` : ''}
        <span class="account" title="${esc(ctx.profile.name)}">${esc(initials)}</span>
        <form data-op="logout"><button class="btn btn-ghost btn-square" aria-label="Sair" title="Sair" type="submit">${icon('logout')}</button></form>
      </div></div></header>
      <main id="content" tabindex="-1">${feedback}<div id="view"></div></main>
      <nav class="mobile-dock" aria-label="Navegação principal">${navigation.map(([href,label,symbol])=>`<a data-nav="${href}" href="#${href}">${icon(symbol)}<span>${label}</span></a>`).join('')}</nav>
    </div>`
    app.dataset.shellKey=key
  }
  app.querySelectorAll<HTMLElement>('[data-nav]').forEach(item=>{
    if (item.dataset.nav===(active || 'inicio')) item.setAttribute('aria-current','page')
    else item.removeAttribute('aria-current')
  })
}

async function pageContent(ctx: Context) {
  const [page='', arg='', extra=''] = route()
  const filter = validId(arg) ? arg : ''
  const offset = /^\d{1,5}$/.test(extra) ? Number(extra) : 0
  const item = arg==='novo' || validId(arg)
  if (!page || page==='inicio') return dashboard(ctx)
  if (page==='escalas') return schedule(ctx,validMonth(arg)?arg:currentMonth(),extra)
  if (page==='registros') return historyPage(ctx,filter,offset)
  if (page==='novo-registro') return recordPicker(ctx,/^\d{1,5}$/.test(arg)?Number(arg):0)
  if (page==='alunos') return studentsPage(ctx,filter,offset)
  if (page==='editar-aluno' && item) return studentForm(ctx,arg)
  if (page==='encontro' && validId(arg)) return meetingPage(ctx,arg,extra==='editar-registro')
  if (page==='editar-encontro' && item) {
    const month = extra.slice(0,7)
    return meetingForm(ctx,arg,validMonth(month)?month:currentMonth(),extra)
  }
  if (ctx.admin) {
    if (page==='administracao') return adminPage(ctx)
    if (page==='editar-professor' && item) return teacherForm(ctx,arg)
    if (page==='editar-modalidade' && item) return instrumentForm(ctx,arg)
  }
  return '<h1>Página indisponível</h1>'+link('inicio','Voltar ao início')
}
async function render() {
  dismissConfirmation()
  const id = ++renderId
  const lastView = app.querySelector<HTMLElement>('#view')
  if (lastView) lastView.inert=true
  if (!db) {
    welcome('<h1>Configuração necessária</h1><p>Configure o endereço e a chave publicável do Supabase para acessar a escola.</p>')
    return
  }
  if (!session) {
    if (route()[0]==='recuperar-senha') recoverPassword()
    else login()
    return
  }
  if (sessionStorage.getItem(passwordKey)===session.user.id) { setupPassword(); return }
  try {
    const member = await profile(session.user.id)
    if (id!==renderId) return
    if (!member?.active) {
      welcome('<h1>Acesso pendente</h1><p>Solicite a autorização da coordenação para acessar a escola.</p><form data-op="logout">'+action('Sair','secondary')+'</form>')
      return
    }
    const refs = await reference()
    if (id!==renderId) return
    const ctx = {...refs,profile:member,admin:member.role==='admin',teacherId:refs.teachers.find(t=>t.profile_id===member.id && t.active)?.id}
    shell(ctx)
    const view = app.querySelector<HTMLElement>('#view')!
    notify('')
    notify('',true)
    view.setAttribute('aria-busy','true')
    view.innerHTML = '<div class="loading-state" role="status"><span class="loading loading-spinner loading-sm" aria-hidden="true"></span>Carregando…</div>'
    view.inert=false
    const content = await pageContent(ctx)
    if (id!==renderId) return
    view.innerHTML = '<div class="screen-enter">'+content+'</div>'
    view.removeAttribute('aria-busy')
    view.inert=false
    if (success) { notify(success); success='' }
  } catch (error) {
    if (id!==renderId) return
    const view = app.querySelector<HTMLElement>('#view')
    const retry = '<h1>Não foi possível carregar</h1><p>'+message(error)+'</p><button class="btn btn-outline" type="button" data-retry>Tentar novamente</button>'
    if (view) {
      view.innerHTML = retry
      view.inert=false
      view.removeAttribute('aria-busy')
    }
    else welcome(retry+'<form data-op="logout">'+action('Sair','secondary')+'</form>')
  }
}
function navigate(target: string) {
  if (location.hash==='#'+target) void render()
  else location.hash=target
}
app.addEventListener('click', event => {
  if ((event.target as HTMLElement).closest('[data-retry]')) void render()
})
app.addEventListener('change', event => {
  const control = event.target as HTMLInputElement
  if (control.dataset.filter) navigate(control.dataset.filter+'/'+(control.value||'todos')+'/0')
  if (control.type==='checkbox' && control.name==='instrument' && control.form?.dataset.op==='student') {
    const section = control.closest('.enrollment-editor')!.querySelector<HTMLElement>('[data-enrollment]')!
    section.hidden = !control.checked
    section.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select').forEach(field=>field.disabled=!control.checked)
  }
})
app.addEventListener('submit', async event => {
  event.preventDefault()
  const form = event.target as HTMLFormElement
  if (!db || form.dataset.busy) return
  const data = new FormData(form)
  const op = form.dataset.op
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  const requestId = renderId
  if (form.dataset.confirm) {
    const label = button?.textContent?.trim() || 'Confirmar'
    if (!await confirmAction({title:label,description:form.dataset.confirm,label})) return
  } else if (op==='meeting' && val(data,'status')==='canceled' && form.dataset.originalStatus!=='canceled') {
    if (!await confirmAction({title:'Cancelar encontro',description:'O encontro ficará marcado como cancelado na escala.',label:'Cancelar encontro'})) return
  } else if (op==='student' && form.querySelector('[data-existing]:not(:checked)')) {
    if (!await confirmAction({title:'Remover vínculos',description:'As modalidades desmarcadas serão removidas do cadastro do aluno.',label:'Remover vínculos'})) return
  }
  if (!form.isConnected || requestId!==renderId || form.dataset.busy) return
  form.dataset.busy='true'
  if (button) {
    button.disabled=true
    button.insertAdjacentHTML('afterbegin','<span class="loading loading-spinner loading-sm submit-spinner" aria-hidden="true"></span>')
  }
  form.setAttribute('aria-busy','true')
  notify('',true)
  notify('')
  try {
    let target = route().join('/')
    let feedbackText = 'Alterações salvas.'
    switch (op) {
      case 'login': {
        const {error} = await db.auth.signInWithPassword({email:val(data,'email'),password:String(data.get('password') ?? '')})
        if (error) throw error
        return
      }
      case 'logout': {
        const {error} = await db.auth.signOut({scope:'local'})
        if (error) throw error
        return
      }
      case 'recover': {
        const {error} = await db.auth.resetPasswordForEmail(val(data,'email'),{redirectTo:location.origin+location.pathname})
        if (error) throw error
        notify('Se houver uma conta com esse e-mail, você receberá um link para criar uma nova senha.')
        return
      }
      case 'password': {
        const password = String(data.get('password') ?? '')
        if (password!==data.get('confirmation')) throw new Error('As senhas precisam ser iguais.')
        const {error} = await db.auth.updateUser({password})
        if (error) throw error
        sessionStorage.removeItem(passwordKey)
        target='inicio'
        feedbackText='Senha salva.'
        break
      }
      case 'generate': {
        const added = read<number>(await db.rpc('generate_month',{p_month:val(data,'month')+'-01'}))
        feedbackText = added===0 ? 'Nenhum encontro novo para gerar.' : added===1 ? '1 encontro gerado.' : added+' encontros gerados.'
        break
      }
      case 'meeting': target='encontro/'+await saveMeeting(data); break
      case 'record': await saveRecord(data); target='encontro/'+val(data,'id'); feedbackText='Registro salvo.'; break
      case 'delete-record': {
        const removed = read<{session_id:string}>(await db.from('lesson_records').delete().eq('id',val(data,'id')).select('session_id').single())
        target='encontro/'+removed.session_id
        feedbackText='Registro excluído.'
        break
      }
      case 'delete-meeting': {
        const removed = read<{date:string}>(await db.from('class_sessions').delete().eq('id',val(data,'id')).select('date').single())
        target='escalas/'+removed.date.slice(0,7)
        feedbackText='Encontro excluído.'
        break
      }
      case 'delete-student':
        read(await db.rpc('remove_student',{p_id:val(data,'id')}))
        target='alunos'
        feedbackText='Aluno removido.'
        break
      case 'student': await saveStudent(data); target='alunos'; break
      case 'remove-unlinked-teachers': {
        const removed = read<number>(await db.rpc('remove_unlinked_teachers'))
        target='administracao'
        feedbackText=removed===0 ? 'Nenhum cadastro sem conta está livre de encontros ou registros.' :
          removed===1 ? '1 cadastro antigo excluído.' : removed+' cadastros antigos excluídos.'
        break
      }
      case 'teacher': {
        const outcome = await saveTeacher(data)
        if (outcome==='created') feedbackText='Professor cadastrado. A conta já pode entrar com o e-mail e a senha inicial se o acesso estiver ativo.'
        if (outcome==='linked_with_existing_password') feedbackText='Professor vinculado à conta existente. A senha anterior continua válida.'
        target='administracao'
        break
      }
      case 'instrument': await saveInstrument(data); target='administracao'; break
      case 'settings': await saveSettings(data); break
      default: return
    }
    if (requestId===renderId) {
      success=feedbackText
      navigate(target || 'inicio')
    }
  } catch (error) {
    if (requestId===renderId) notify(error instanceof Error ? error.message : message(error),true)
  } finally {
    delete form.dataset.busy
    form.removeAttribute('aria-busy')
    if (button) {
      button.disabled=false
      button.querySelector('.submit-spinner')?.remove()
    }
  }
})
window.addEventListener('hashchange',()=>{ void render(); window.scrollTo(0,0) })
if (db) {
  welcome('<p role="status">Verificando sessão…</p>')
  let pendingCallback = passwordCallback
  db.auth.onAuthStateChange((event,next) => {
    const changedUser = session?.user.id !== next?.user.id
    const shouldSetPassword = Boolean(next && (pendingCallback===next.user.id || event==='PASSWORD_RECOVERY'))
    if (shouldSetPassword && next) sessionStorage.setItem(passwordKey,next.user.id)
    if (event==='INITIAL_SESSION' || shouldSetPassword) pendingCallback=null
    session=next
    if (event==='INITIAL_SESSION' || changedUser || shouldSetPassword) {
      if (!next) {
        success=''
        sessionStorage.removeItem(passwordKey)
      }
      setTimeout(()=>void render(),0)
    }
  })
} else void render()
