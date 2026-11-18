import type { Session } from '@supabase/supabase-js'
import { action,esc,field,icon,input,link,val } from './components/ui'
import type { Context } from './lib/context'
import { schoolNow } from './lib/domain'
import { dashboard,filterTeachers,historyPage,meetingForm,meetingPage,saveMeeting,saveRecord,schedule,validId,validMonth } from './pages/lessons'
import { adminPage,instrumentForm,saveInstrument,saveSettings,saveStudent,saveTeacher,studentForm,studentsPage,teacherForm } from './pages/people'
import { db,message,profile,read,reference } from './services/db'
import './styles/app.css'

const app = document.querySelector<HTMLDivElement>('#app')!
const navigation = [
  ['inicio','Início','house'],['escalas','Escalas','calendar'],['registros','Registros','book'],['alunos','Alunos','users'],
] as const
let session: Session | null = null
let renderId = 0
let success = ''
const currentMonth = () => schoolNow().date.slice(0,7)
const route = () => location.hash.slice(1).split('/')
const notify = (text: string, failure = false) => {
  const element = app.querySelector<HTMLElement>(failure ? '#error' : '#notice')
  if (element) element.textContent = text
}
const feedback = '<div id="notice" role="status"></div><div id="error" role="alert"></div>'
const mark = `<span class="brand-icon">${icon('music')}</span><span><strong>Escola de Música</strong><small>Igreja Batista Horizonte</small></span>`

function welcome(body: string) {
  app.innerHTML = `<main class="login"><section class="card"><div class="brand">${mark}</div>${body}${feedback}</section></main>`
}
function login() {
  welcome(`<h1>Entre na sua conta</h1><p>Acesso para professores e administradores.</p>
  <form class="fields" data-op="login">${field('E-mail',input('email','','required type="email" autocomplete="username"'))}
  ${field('Senha',input('password','','required type="password" autocomplete="current-password"'))}${action('Entrar')}</form>`)
}
function shell(ctx: Context) {
  const page = route()[0] || 'inicio'
  const active = page.includes('encontro') ? 'escalas' : page==='editar-aluno' ? 'alunos'
    : ['editar-professor','editar-modalidade'].includes(page) ? 'administracao' : page
  const tabs = ctx.admin ? [...navigation,['administracao','Administração','settings'] as const] : navigation
  app.innerHTML = `<div class="layout"><aside><a class="brand" href="#inicio">${mark}</a>
    <nav aria-label="Navegação principal">${tabs.map(([href,label,symbol])=>`<a ${href===active?'aria-current="page"':''} href="#${href}">${icon(symbol)}<span>${label}</span></a>`).join('')}</nav>
    </aside><div class="workspace"><header class="topbar"><a class="mobile-brand" href="#inicio">${mark}</a>
    <span class="account">${esc(ctx.profile.name)}</span><form data-op="logout">${action(icon('logout')+' <span>Sair</span>','secondary')}</form></header>
    <main id="content" tabindex="-1">${feedback}<div id="view"></div></main></div></div>`
}

async function pageContent(ctx: Context) {
  const [page='', arg='', extra=''] = route()
  const filter = validId(arg) ? arg : ''
  const offset = /^\d{1,5}$/.test(extra) ? Number(extra) : 0
  const item = arg==='novo' || validId(arg)
  if (!page || page==='inicio') return dashboard(ctx)
  if (page==='escalas') return schedule(ctx,validMonth(arg)?arg:currentMonth())
  if (page==='registros') return historyPage(ctx,filter,offset)
  if (page==='alunos') return studentsPage(ctx,filter,offset)
  if (page==='encontro' && validId(arg)) return meetingPage(ctx,arg)
  if (ctx.admin) {
    if (page==='administracao') return adminPage(ctx)
    if (page==='editar-encontro' && item) return meetingForm(ctx,arg,validMonth(extra)?extra:currentMonth())
    if (page==='editar-aluno' && item) return studentForm(ctx,arg)
    if (page==='editar-professor' && item) return teacherForm(ctx,arg)
    if (page==='editar-modalidade' && item) return instrumentForm(ctx,arg)
  }
  return '<h1>Página indisponível</h1>'+link('inicio','Voltar ao início')
}
async function render() {
  const id = ++renderId
  if (!db) {
    welcome('<h1>Configuração necessária</h1><p>Configure o endereço e a chave publicável do Supabase para acessar a escola.</p>')
    return
  }
  if (!session) { login(); return }
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
    view.innerHTML = '<p role="status">Carregando…</p>'
    const content = await pageContent(ctx)
    if (id!==renderId) return
    view.innerHTML = content
    const meeting = app.querySelector<HTMLFormElement>('#meeting-form')
    if (meeting) filterTeachers(meeting)
    if (success) { notify(success); success='' }
  } catch (error) {
    if (id!==renderId) return
    const view = app.querySelector('#view')
    const retry = '<h1>Não foi possível carregar</h1><p>'+message(error)+'</p><button class="button secondary" type="button" data-retry>Tentar novamente</button>'
    if (view) view.innerHTML = retry
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
  if (control.name==='instrument_id' && control.form?.id==='meeting-form') filterTeachers(control.form)
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
  if (form.dataset.filter) {
    navigate(form.dataset.filter+'/'+(val(data,'filter')||'todos')+'/0')
    return
  }
  if (op==='meeting' && val(data,'status')==='canceled' && !confirm('Cancelar este encontro?')) return
  if (op==='student' && form.querySelector('[data-existing]:not(:checked)') &&
      !confirm('Remover os vínculos com as modalidades desmarcadas?')) return
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')
  form.dataset.busy='true'
  if (button) button.disabled=true
  form.setAttribute('aria-busy','true')
  notify('',true)
  notify('')
  const requestId = renderId
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
      case 'generate': {
        const added = read<number>(await db.rpc('generate_month',{p_month:val(data,'month')+'-01'}))
        feedbackText = added===0 ? 'Nenhum encontro novo para gerar.' : added===1 ? '1 encontro gerado.' : added+' encontros gerados.'
        break
      }
      case 'meeting': target='encontro/'+await saveMeeting(data); break
      case 'record': await saveRecord(data); break
      case 'student': await saveStudent(data); target='alunos'; break
      case 'teacher': await saveTeacher(data); target='administracao'; break
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
    if (button) button.disabled=false
  }
})
window.addEventListener('hashchange',()=>{ if (session) { void render(); window.scrollTo(0,0) } })
if (db) {
  welcome('<p role="status">Verificando sessão…</p>')
  db.auth.onAuthStateChange((event,next) => {
    const changedUser = session?.user.id !== next?.user.id
    session=next
    if (event==='INITIAL_SESSION' || changedUser) {
      if (!next) success=''
      setTimeout(()=>void render(),0)
    }
  })
} else void render()
