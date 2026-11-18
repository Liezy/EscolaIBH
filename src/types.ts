export interface Profile { id: string; name: string; role: 'admin' | 'teacher'; active: boolean }
export interface Settings { location: string; starts_on: string; start_time: string; sunday_weeks: number[] }
export interface Instrument { id: string; name: string; active: boolean }
export interface Teacher extends Instrument { profile_id: string | null; teacher_instruments: { instrument_id: string }[] }
export interface Meeting { id: string; instrument_id: string; teacher_id: string | null; date: string; start_time: string; status: 'planned' | 'completed' | 'canceled' }
export interface RecordEntry { id: string; session_id: string; teacher_id: string; content: string; observations: string; next_lesson_suggestions: string; created_at: string; updated_at: string; session: Meeting }
export interface Enrollment { instrument_id: string; enrollment_date: string; status: 'invited' | 'confirmed' | 'active' | 'inactive' }
export interface Student { id: string; name: string; phone: string | null; notes: string | null; enrollments: Enrollment[] }
