begin;

alter table public.students add column account_id uuid unique references auth.users(id) on delete set null;

create function ibh_private.check_staff_account() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  if not new.active then return new; end if;
  if tg_op='UPDATE' then
    if new.id=old.id and old.active and old.role=new.role then return new; end if;
  end if;
  if not exists (
    select 1 from auth.users u where u.id=new.id and not u.is_anonymous
      and (u.email_confirmed_at is not null or u.invited_at is not null)
  ) then
    raise exception 'A conta precisa confirmar o e-mail antes de receber acesso de equipe.' using errcode='P1008';
  end if;
  return new;
end $$;
revoke all on function ibh_private.check_staff_account() from public,anon,authenticated;
create trigger validate_staff_account before insert or update of id,role,active on public.profiles
for each row execute function ibh_private.check_staff_account();

create function ibh_private.student_account() returns uuid
language sql stable set search_path='' as $$
  select u.id from auth.users u
  where u.id=(select auth.uid()) and u.email_confirmed_at is not null
    and not u.is_anonymous and u.raw_user_meta_data->>'registration'='student'
    and not exists (select 1 from public.profiles p where p.id=u.id)
$$;
revoke all on function ibh_private.student_account() from public,anon,authenticated;

create function public.student_portal() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
  account uuid := ibh_private.student_account();
  student uuid;
begin
  if account is null then raise insufficient_privilege; end if;
  select id into student from public.students where account_id=account;
  if student is null then
    return jsonb_build_object('student',null,'instruments',coalesce((
      select jsonb_agg(jsonb_build_object('id',i.id,'name',i.name) order by i.name,i.id)
      from public.instruments i where i.active
    ),'[]'::jsonb));
  end if;
  return jsonb_build_object('student',(
    select jsonb_build_object('name',s.name,'enrollments',coalesce((
      select jsonb_agg(jsonb_build_object('name',i.name,'status',e.status) order by i.name,i.id)
      from public.enrollments e join public.instruments i on i.id=e.instrument_id where e.student_id=s.id
    ),'[]'::jsonb)) from public.students s where s.id=student
  ),'instruments','[]'::jsonb);
end $$;

create function public.register_student(p_name text,p_phone text,p_instruments uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare
  account uuid := ibh_private.student_account();
  student uuid;
  expected integer;
  added integer;
begin
  if account is null then raise insufficient_privilege; end if;
  if exists (select 1 from public.students where account_id=account) then return; end if;
  select count(distinct item) into expected from unnest(p_instruments) as item;
  if expected=0 or array_position(p_instruments,null) is not null then
    raise exception 'Selecione ao menos uma modalidade.' using errcode='P1006';
  end if;
  insert into public.students(account_id,name,phone)
  values(account,trim(p_name),nullif(trim(p_phone),''))
  on conflict (account_id) do nothing returning id into student;
  if student is null then return; end if;
  insert into public.enrollments(student_id,instrument_id,enrollment_date,status)
  select student,i.id,timezone('America/Sao_Paulo',now())::date,'confirmed'
  from public.instruments i where i.active and i.id=any(p_instruments);
  get diagnostics added=row_count;
  if added<>expected then
    raise exception 'Uma modalidade selecionada ficou indisponível.' using errcode='P1007';
  end if;
end $$;

revoke all on function public.student_portal(),public.register_student(text,text,uuid[]) from public,anon,authenticated;
grant execute on function public.student_portal(),public.register_student(text,text,uuid[]) to authenticated;

commit;
