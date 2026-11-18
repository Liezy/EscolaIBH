import test from 'node:test'
import assert from 'node:assert/strict'
import { mayRecord,schoolNow,shiftMonth,started } from '../src/lib/domain.ts'
import type { Meeting } from '../src/types.ts'

test('a agenda usa o horário da escola quando UTC já mudou de dia', () => {
  assert.deepEqual(schoolNow(new Date('2026-11-23T01:35:00Z')), { date:'2026-11-22',time:'22:35:00' })
})
test('navegação mensal cruza o limite do ano', () => {
  assert.equal(shiftMonth('2026-12',1),'2027-01')
  assert.equal(shiftMonth('2027-01',-1),'2026-12')
})
const meeting: Meeting={id:'fixture',instrument_id:'violão',teacher_id:'samuel',date:'2026-11-22',start_time:'09:00:00',status:'planned'}
test('o registro abre quando a aula começa', () => {
  assert.equal(started(meeting,{date:'2026-11-22',time:'08:59:59'}),false)
  assert.equal(started(meeting,{date:'2026-11-22',time:'09:00:00'}),true)
})
test('encontros cancelados, sem professor ou de terceiro não habilitam registro', () => {
  const past={...meeting,date:'2000-11-22'}
  assert.equal(mayRecord(past,false,'samuel'),true)
  assert.equal(mayRecord(past,true,undefined),true)
  assert.equal(mayRecord(past,false,'ivan'),false)
  assert.equal(mayRecord({...past,status:'canceled'},true,'samuel'),false)
  assert.equal(mayRecord({...past,teacher_id:null},true,undefined),false)
})
