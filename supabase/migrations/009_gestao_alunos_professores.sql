begin;

alter policy admin_insert on public.students
  with check ((select ibh_private.member_role()) is not null);
alter policy admin_update on public.students
  using ((select ibh_private.member_role()) is not null)
  with check ((select ibh_private.member_role()) is not null);
alter policy admin_delete on public.students
  using ((select ibh_private.member_role()) is not null);
alter policy admin_insert on public.students rename to staff_insert;
alter policy admin_update on public.students rename to staff_update;
alter policy admin_delete on public.students rename to staff_delete;

alter policy admin_insert on public.enrollments
  with check ((select ibh_private.member_role()) is not null);
alter policy admin_update on public.enrollments
  using ((select ibh_private.member_role()) is not null)
  with check ((select ibh_private.member_role()) is not null);
alter policy admin_remove on public.enrollments
  using ((select ibh_private.member_role()) is not null);
alter policy admin_insert on public.enrollments rename to staff_insert;
alter policy admin_update on public.enrollments rename to staff_update;
alter policy admin_remove on public.enrollments rename to staff_delete;

create or replace function public.save_student(p_id uuid,p_name text,p_phone text,p_notes text,p_enrollments jsonb)
returns uuid language plpgsql security invoker set search_path='' as $$
declare sid uuid;
begin
  if (select ibh_private.member_role()) is null then raise insufficient_privilege; end if;
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

create or replace function public.remove_student(p_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare removed uuid;
begin
  if (select ibh_private.member_role()) is null then raise insufficient_privilege; end if;
  perform 1 from public.students where id=p_id for update;
  if not found then raise no_data_found; end if;
  delete from public.enrollments where student_id=p_id;
  delete from public.students where id=p_id returning id into strict removed;
  return removed;
end $$;

commit;
