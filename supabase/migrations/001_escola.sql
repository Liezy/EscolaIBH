begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 120),
  role text not null default 'teacher' check (role in ('admin','teacher')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.settings (
  id boolean primary key default true check (id),
  location text not null check (length(trim(location)) between 1 and 160),
  starts_on date not null,
  start_time time not null,
  sunday_weeks smallint[] not null check (
    cardinality(sunday_weeks) between 1 and 5 and
    array_position(sunday_weeks, null) is null and
    sunday_weeks <@ array[1,2,3,4,5]::smallint[]
  )
);
create table public.instruments (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  active boolean not null default true
);
create unique index instruments_name on public.instruments(lower(trim(name)));
create table public.teachers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  name text not null check (length(trim(name)) between 1 and 120),
  active boolean not null default true
);
create table public.teacher_instruments (
  teacher_id uuid references public.teachers(id),
  instrument_id uuid references public.instruments(id),
  primary key (teacher_id, instrument_id)
);
create table public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  phone text check (length(phone) <= 40),
  notes text check (length(notes) <= 3000),
  created_at timestamptz not null default now()
);
create table public.enrollments (
  student_id uuid references public.students(id),
  instrument_id uuid references public.instruments(id),
  enrollment_date date not null,
  status text not null check (status in ('invited','confirmed','active','inactive')),
  primary key (student_id, instrument_id)
);
create table public.class_sessions (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.instruments(id),
  teacher_id uuid references public.teachers(id),
  date date not null,
  start_time time not null,
  status text not null default 'planned' check (status in ('planned','completed','canceled')),
  check (status <> 'completed' or teacher_id is not null),
  created_at timestamptz not null default now(),
  unique (instrument_id, date)
);
create unique index teacher_slot on public.class_sessions(teacher_id,date,start_time)
  where teacher_id is not null and status <> 'canceled';
create index sessions_calendar on public.class_sessions(date,start_time);
create table public.lesson_records (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null unique references public.class_sessions(id),
  teacher_id uuid not null references public.teachers(id),
  content text not null check (length(trim(content)) between 1 and 5000),
  observations text not null default '' check (length(observations) <= 3000),
  next_lesson_suggestions text not null default '' check (length(next_lesson_suggestions) <= 3000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create schema if not exists ibh_private;
grant usage on schema ibh_private to authenticated;
create function ibh_private.member_role() returns text language sql stable security definer
set search_path = '' as $$
  select role from public.profiles where id=(select auth.uid()) and active
$$;
create function ibh_private.current_teacher() returns uuid language sql stable security definer
set search_path = '' as $$
  select id from public.teachers where profile_id=(select auth.uid()) and active
$$;
revoke all on all functions in schema ibh_private from public, anon, authenticated;
grant execute on function ibh_private.member_role(), ibh_private.current_teacher() to authenticated;

do $$
declare tab text;
begin
  foreach tab in array array['profiles','settings','instruments','teachers','teacher_instruments','students','enrollments','class_sessions','lesson_records'] loop
    execute format('alter table public.%I enable row level security', tab);
    execute format('revoke all on public.%I from public, anon, authenticated',tab);
    execute format('grant select on public.%I to authenticated',tab);
    if tab = 'profiles' then
      execute 'create policy read_profiles on public.profiles for select to authenticated using (id=(select auth.uid()) or (select ibh_private.member_role())=''admin'')';
    else
      execute format('create policy read_members on public.%I for select to authenticated using ((select ibh_private.member_role()) is not null)',tab);
    end if;
  end loop;

  foreach tab in array array['settings','instruments','teachers','teacher_instruments','students','enrollments','class_sessions'] loop
    execute format('grant insert, update on public.%I to authenticated',tab);
    execute format('create policy admin_insert on public.%I for insert to authenticated with check ((select ibh_private.member_role())=''admin'')',tab);
    execute format('create policy admin_update on public.%I for update to authenticated using ((select ibh_private.member_role())=''admin'') with check ((select ibh_private.member_role())=''admin'')',tab);
  end loop;
end $$;
grant delete on public.teacher_instruments, public.enrollments to authenticated;
create policy admin_remove on public.teacher_instruments for delete to authenticated using ((select ibh_private.member_role())='admin');
create policy admin_remove on public.enrollments for delete to authenticated using ((select ibh_private.member_role())='admin');

grant insert (session_id,teacher_id,content,observations,next_lesson_suggestions),
  update (content,observations,next_lesson_suggestions) on public.lesson_records to authenticated;
create policy create_record on public.lesson_records for insert to authenticated with check (
  (select ibh_private.member_role()) is not null
  and ((select ibh_private.member_role())='admin' or teacher_id=(select ibh_private.current_teacher()))
);
create policy edit_record on public.lesson_records for update to authenticated using (
  (select ibh_private.member_role())='admin' or
  ((select ibh_private.member_role())='teacher' and teacher_id=(select ibh_private.current_teacher()))
);

create function ibh_private.check_session() returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if (new.teacher_id,new.instrument_id,new.status) is distinct from (old.teacher_id,old.instrument_id,old.status)
       and exists (select 1 from public.lesson_records where session_id=old.id)
       and (new.teacher_id is distinct from old.teacher_id or new.instrument_id<>old.instrument_id or new.status<>'completed') then
      raise exception 'Encontro com registro deve manter professor, modalidade e situação realizada.' using errcode='23514';
    end if;
    if (new.teacher_id,new.instrument_id) is not distinct from (old.teacher_id,old.instrument_id) then
      return new;
    end if;
  end if;
  if not exists (select 1 from public.instruments where id=new.instrument_id and active) then
    raise exception 'Modalidade inativa.' using errcode='23514';
  end if;
  if new.teacher_id is not null and not exists (
    select 1 from public.teacher_instruments ti join public.teachers t on t.id=ti.teacher_id
    where t.active and ti.teacher_id=new.teacher_id and ti.instrument_id=new.instrument_id
  ) then
    raise exception 'Professor indisponível para a modalidade.' using errcode='23514';
  end if;
  return new;
end $$;
create trigger validate_session before insert or update on public.class_sessions
for each row execute function ibh_private.check_session();

create function ibh_private.complete_session() returns trigger language plpgsql security definer set search_path='' as $$
begin
  update public.class_sessions set status='completed'
  where id=new.session_id and teacher_id=new.teacher_id and status<>'canceled'
    and (date,start_time) <= (timezone('America/Sao_Paulo',now())::date,timezone('America/Sao_Paulo',now())::time);
  if not found then
    raise exception 'O encontro precisa ter começado e estar atribuído ao professor do registro.' using errcode='23514';
  end if;
  return new;
end $$;
-- AFTER ensures the INSERT policy runs before any elevated update.
create trigger record_completion after insert on public.lesson_records
for each row execute function ibh_private.complete_session();

create function ibh_private.touch_record() returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at=now();
  return new;
end $$;
create trigger record_updated before update on public.lesson_records
for each row execute function ibh_private.touch_record();

create function public.generate_month(p_month date) returns integer language plpgsql security invoker set search_path='' as $$
declare added integer;
begin
  if (select ibh_private.member_role()) is distinct from 'admin' then
    raise insufficient_privilege;
  end if;
  insert into public.class_sessions(instrument_id,date,start_time)
  select i.id,d::date,s.start_time
  from public.settings s cross join public.instruments i
  cross join generate_series(date_trunc('month',p_month::timestamp),
      date_trunc('month',p_month::timestamp)+interval '1 month - 1 day',interval '1 day') d
  where i.active and d::date >= s.starts_on and extract(dow from d)=0
    and ((extract(day from d)::integer-1)/7+1)=any(s.sunday_weeks)
  on conflict (instrument_id,date) do nothing;
  get diagnostics added=row_count;
  return added;
end $$;

create function public.save_student(p_id uuid,p_name text,p_phone text,p_notes text,p_enrollments jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare sid uuid;
begin
  if (select ibh_private.member_role()) is distinct from 'admin' then raise insufficient_privilege; end if;
  if jsonb_typeof(p_enrollments) is distinct from 'array' or jsonb_array_length(p_enrollments)=0 then
    raise exception 'Selecione pelo menos uma modalidade.' using errcode='23514';
  end if;
  if p_id is null then
    insert into public.students(name,phone,notes) values(trim(p_name),nullif(trim(p_phone),''),nullif(trim(p_notes),''))
    returning id into sid;
  else
    update public.students set name=trim(p_name),phone=nullif(trim(p_phone),''),notes=nullif(trim(p_notes),'')
    where id=p_id returning id into strict sid;
  end if;
  delete from public.enrollments e where e.student_id=sid and not exists (
    select 1 from jsonb_to_recordset(p_enrollments) x(instrument_id uuid) where x.instrument_id=e.instrument_id
  );
  insert into public.enrollments(student_id,instrument_id,enrollment_date,status)
  select sid,x.instrument_id,x.enrollment_date,x.status
  from jsonb_to_recordset(p_enrollments) x(instrument_id uuid,enrollment_date date,status text)
  on conflict (student_id,instrument_id) do update
    set enrollment_date=excluded.enrollment_date,status=excluded.status;
  return sid;
end $$;

create function public.save_teacher(p_id uuid,p_profile uuid,p_name text,p_active boolean,p_instruments uuid[])
returns uuid language plpgsql security invoker set search_path='' as $$
declare tid uuid;
begin
  if (select ibh_private.member_role()) is distinct from 'admin' then raise insufficient_privilege; end if;
  if p_id is null then
    insert into public.teachers(profile_id,name,active) values(p_profile,trim(p_name),p_active) returning id into tid;
  else
    update public.teachers set profile_id=p_profile,name=trim(p_name),active=p_active
    where id=p_id returning id into strict tid;
  end if;
  delete from public.teacher_instruments where teacher_id=tid and not (instrument_id=any(p_instruments));
  insert into public.teacher_instruments(teacher_id,instrument_id)
  select tid,unnest(p_instruments) on conflict do nothing;
  return tid;
end $$;

revoke all on function ibh_private.check_session(),ibh_private.complete_session(),ibh_private.touch_record() from public, anon, authenticated;
revoke all on function public.generate_month(date),public.save_student(uuid,text,text,text,jsonb),public.save_teacher(uuid,uuid,text,boolean,uuid[]) from public, anon, authenticated;
grant execute on function public.generate_month(date),public.save_student(uuid,text,text,text,jsonb),public.save_teacher(uuid,uuid,text,boolean,uuid[]) to authenticated;

insert into public.settings(location,starts_on,start_time,sunday_weeks)
values ('Igreja Batista Horizonte (IBH)','2026-11-22','09:00',array[2,4]);
insert into public.instruments(name) values ('Violão'),('Bateria');
with staff as (
  insert into public.teachers(name) values ('Eliézer'),('Samuel'),('Ivan'),('Héber'),('Lukinhas') returning id,name
)
insert into public.teacher_instruments(teacher_id,instrument_id)
select staff.id,i.id from staff join public.instruments i
on i.name=case when staff.name in ('Eliézer','Samuel','Ivan') then 'Violão' else 'Bateria' end;
commit;
