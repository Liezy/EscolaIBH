import { createClient } from '@supabase/supabase-js'
import type { Instrument, Meeting, Profile, RecordEntry, Settings, Student, Teacher } from '../types'
import { shiftMonth } from '../lib/domain'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
const callback = new URLSearchParams(location.hash.slice(1))
function passwordCallbackUser() {
  if (!['invite','recovery'].includes(callback.get('type') ?? '')) return null
  const payload = callback.get('access_token')?.split('.')[1]
  if (!payload) return null
  try {
    const {sub} = JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')))
    return typeof sub==='string' ? sub : null
  } catch { return null }
}
export const passwordCallback = passwordCallbackUser()
export const db = url && key ? createClient(url, key) : null

type Result = { data: unknown; error: { code?: string } | null }
export function read<T>(result: Result): T {
  if (result.error) throw result.error
  return result.data as T
}
export function message(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  if (code === 'schedule_schema_missing') return 'A lista de professores da escala ainda não está disponível no Supabase. Confira a migração 008 e recarregue a página.'
  if (code === '23505') return 'Já existe um encontro nessa data, um vínculo ou um horário reservado para esse professor.'
  if (code === '23514' || code === '23502' || code === '22P02') return 'Confira os campos, a disponibilidade do professor e a situação do encontro.'
  if (code === '42501' || code === 'PGRST116') return 'A operação não está disponível para seu perfil ou o item mudou.'
  if (code === 'invalid_credentials') return 'E-mail ou senha incorretos.'
  if (code === 'weak_password') return 'A senha não atende aos requisitos de segurança do projeto.'
  if (code === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar.'
  if (code === 'P1002') return 'Confira o e-mail da conta que deseja vincular.'
  if (code === 'P1003') return 'Você precisa manter o próprio acesso de administrador ativo.'
  if (code === 'P1004') return 'Vincule uma conta ativa ao professor antes de escalá-lo.'
  if (code === 'P1008') return 'Peça à pessoa para confirmar o e-mail antes de ativar o acesso de equipe.'
  if (code === '23503') return 'Este item ainda está vinculado a outro cadastro ou registro.'
  if (code === 'P0002') return 'O item já foi removido ou mudou.'
  return 'Não foi possível concluir a operação. Tente novamente.'
}
export async function availableTeacherIds() {
  const result = await db!.rpc('available_teacher_ids')
  if (result.status === 404 && result.error) throw {code:'schedule_schema_missing'}
  return read<string[]>(result)
}
export const profile = async (id: string) => read<Profile | null>(await db!.from('profiles').select('*').eq('id',id).maybeSingle())
export const profiles = async () => read<Profile[]>(await db!.from('profiles').select('*'))
export async function reference() {
  const [settings,instruments,teachers] = await Promise.all([
    db!.from('settings').select('*').single(),
    db!.from('instruments').select('*').order('name'),
    db!.from('teachers').select('*,teacher_instruments(instrument_id)').order('name'),
  ])
  return {
    settings: read<Settings>(settings), instruments: read<Instrument[]>(instruments), teachers: read<Teacher[]>(teachers),
  }
}
export async function monthMeetings(month: string) {
  return read<Meeting[]>(await db!.from('class_sessions').select('*')
    .gte('date',month+'-01').lt('date',shiftMonth(month,1)+'-01').order('date').order('start_time'))
}
export async function nextMeetings(date: string, time: string, teacher?: string) {
  const upcoming = () => db!.from('class_sessions').select('*').eq('status','planned')
    .or('date.gt.'+date+',and(date.eq.'+date+',start_time.gte.'+time+')').order('date').order('start_time')
  const [first,mine] = await Promise.all([
    upcoming().limit(1), teacher ? upcoming().eq('teacher_id',teacher).limit(1) : null,
  ])
  const next = read<Meeting[]>(first)[0]
  return {
    day: next ? read<Meeting[]>(await upcoming().eq('date',next.date)) : [],
    mine: mine ? read<Meeting[]>(mine)[0] : undefined,
  }
}
const recordsQuery = () => db!.from('lesson_records').select('*,session:class_sessions!inner(*)')
  .order('session(date)',{ascending:false})
  .order('id')
export async function history(instrument: string, page: number) {
  let query = recordsQuery()
  if (instrument) query = query.eq('session.instrument_id',instrument)
  return read<RecordEntry[]>(await query.range(page*20,page*20+20))
}
export async function sessionsToRecord(date: string, time: string, teacher: string | undefined, page: number) {
  let query = db!.from('class_sessions').select('*,record:lesson_records(id)')
    .is('record',null).not('teacher_id','is',null).neq('status','canceled')
    .or('date.lt.'+date+',and(date.eq.'+date+',start_time.lte.'+time+')')
  if (teacher) query = query.eq('teacher_id',teacher)
  return read<Meeting[]>(await query.order('date',{ascending:false}).order('start_time',{ascending:false}).order('id').range(page*20,page*20+20))
}
export async function latest(instrument: string, before?: string) {
  let query = recordsQuery().eq('session.instrument_id',instrument)
  if (before) query = query.lt('session.date',before)
  return read<RecordEntry[]>(await query.limit(1))[0]
}
export async function details(id: string) {
  const [session,record] = await Promise.all([
    db!.from('class_sessions').select('*').eq('id',id).single(),
    recordsQuery().eq('session_id',id).maybeSingle(),
  ])
  return { meeting:read<Meeting>(session), record:read<RecordEntry | null>(record) }
}
export async function students(filter: string, page: number) {
  let query = db!.from('students').select(filter
    ? '*,enrollments(*),matching:enrollments!inner(instrument_id)' : '*,enrollments(*)')
  if (filter) query = query.eq('matching.instrument_id',filter)
  return read<Student[]>(await query.order('name').order('id').range(page*20,page*20+20))
}
