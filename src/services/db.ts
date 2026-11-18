import { createClient } from '@supabase/supabase-js'
import type { Instrument, Meeting, Profile, RecordEntry, Settings, Student, Teacher } from '../types'
import { shiftMonth } from '../lib/domain'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
export const db = url && key ? createClient(url, key) : null

type Result = { data: unknown; error: { code?: string } | null }
export function read<T>(result: Result): T {
  if (result.error) throw result.error
  return result.data as T
}
export function message(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  if (code === '23505') return 'Já existe um encontro nessa data, um vínculo ou um horário reservado para esse professor.'
  if (code === '23514' || code === '23502' || code === '22P02') return 'Confira os campos, a disponibilidade do professor e a situação do encontro.'
  if (code === '42501' || code === 'PGRST116') return 'A operação não está disponível para seu perfil ou o item mudou.'
  if (code === 'invalid_credentials') return 'E-mail ou senha incorretos.'
  return 'Não foi possível concluir a operação. Tente novamente.'
}
export const profile = async (id: string) => read<Profile | null>(await db!.from('profiles').select('*').eq('id',id).maybeSingle())
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
    day: next ? read<Meeting[]>(await db!.from('class_sessions').select('*').eq('date',next.date)
      .neq('status','canceled').order('start_time')) : [],
    mine: mine ? read<Meeting[]>(mine)[0] : undefined,
  }
}
const recordsQuery = () => db!.from('lesson_records').select('*,session:class_sessions!inner(*)')
  .order('date',{ referencedTable:'session', ascending:false })
  .order('session(date)',{ascending:false})
export async function history(instrument: string, page: number) {
  let query = recordsQuery()
  if (instrument) query = query.eq('session.instrument_id',instrument)
  return read<RecordEntry[]>(await query.range(page*20,page*20+20))
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
