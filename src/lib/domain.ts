import type { Meeting } from '../types.ts'

export const zone = 'America/Sao_Paulo'
export function schoolNow(at = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(at).split(' ')
  return { date: parts[0], time: parts[1] }
}
export function shiftMonth(month: string, offset: number) {
  const [year, index] = month.split('-').map(Number)
  return new Date(Date.UTC(year, index - 1 + offset, 1)).toISOString().slice(0, 7)
}
export function started(meeting: Meeting, now = schoolNow()) {
  return meeting.date < now.date || (meeting.date === now.date && meeting.start_time <= now.time)
}
export function mayRecord(meeting: Meeting, admin: boolean, teacherId: string | undefined) {
  return Boolean(meeting.teacher_id && meeting.status !== 'canceled' &&
    (admin || meeting.teacher_id === teacherId) && started(meeting))
}
