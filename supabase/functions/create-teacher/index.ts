import { createClient } from 'npm:@supabase/supabase-js@2'

const url = Deno.env.get('SUPABASE_URL') ?? ''
const publicKey = JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') ?? '{}').default
  ?? Deno.env.get('SUPABASE_ANON_KEY')
const secretKey = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}').default
  ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const headers = {
  'Access-Control-Allow-Origin':'*',
  'Access-Control-Allow-Headers':'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods':'POST, OPTIONS',
  'Cache-Control':'no-store',
}
const reply = (status: number,code: string) => Response.json({code},{status,headers})
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i

Deno.serve(async request => {
  if (request.method==='OPTIONS') return new Response(null,{status:204,headers})
  if (request.method!=='POST') return reply(405,'method_not_allowed')
  const authorization = request.headers.get('Authorization')
  if (!authorization?.startsWith('Bearer ')) return reply(401,'unauthenticated')
  if (!url || !publicKey || !secretKey) return reply(503,'configuration_missing')

  const options = {auth:{persistSession:false,autoRefreshToken:false}}
  const caller = createClient(url,publicKey,{...options,global:{headers:{Authorization:authorization}}})
  const {data:{user},error:authError} = await caller.auth.getUser(authorization.slice(7))
  if (authError || !user) return reply(401,'unauthenticated')
  const {data:profile} = await caller.from('profiles').select('role,active').eq('id',user.id).maybeSingle()
  if (!profile?.active || profile.role!=='admin') return reply(403,'forbidden')

  const body = await request.json().catch(()=>null)
  const id = body?.id
  const email = typeof body?.email==='string' ? body.email.trim().toLowerCase() : ''
  const name = typeof body?.name==='string' ? body.name.trim() : ''
  const password = typeof body?.password==='string' ? body.password : ''
  const role = body?.role
  const instruments = body?.instruments
  const active = body?.active
  if ((id!==null && (typeof id!=='string' || !uuid.test(id))) ||
      !name || name.length>120 || email.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      (role!=='teacher' && role!=='admin') || typeof active!=='boolean' ||
      !Array.isArray(instruments) || instruments.some(item=>typeof item!=='string' || !uuid.test(item))) {
    return reply(400,'invalid_fields')
  }
  if (password.length<8 || new TextEncoder().encode(password).length>72) return reply(400,'invalid_password')

  const params = {p_id:id,p_email:email,p_name:name,p_role:role,p_active:active,p_instruments:instruments}
  const save = () => caller.rpc('save_teacher_access',params)
  const existing = await save()
  if (!existing.error) return reply(200,'linked')
  if (existing.error.code==='23505') return reply(409,'already_linked')
  if (existing.error.code!=='P1001') return reply(400,'link_failed')

  const auth = createClient(url,secretKey,options).auth.admin
  const created = await auth.createUser({email,password,email_confirm:true})
  if (created.error) {
    if (created.error.code==='weak_password') return reply(400,'invalid_password')
    if (created.error.code==='email_exists' || created.error.code==='user_already_exists') return reply(409,'account_exists')
    return reply(502,'account_failed')
  }
  const saved = await save()
  if (saved.error) return reply(409,'account_created_link_failed')
  return reply(201,'created')
})
