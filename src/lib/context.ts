import type { Profile } from '../types'
import type { reference } from '../services/db'
export type Context = Awaited<ReturnType<typeof reference>> & { profile: Profile; admin: boolean; teacherId?: string }
export const instrumentName = (context: Context, id: string) => context.instruments.find(item=>item.id===id)?.name ?? 'Modalidade'
export const teacherName = (context: Context, id: string | null) => context.teachers.find(item=>item.id===id)?.name ?? 'A definir'
