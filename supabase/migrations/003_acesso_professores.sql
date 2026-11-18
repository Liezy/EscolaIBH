begin;

create function public.save_teacher_access(
  p_id uuid, p_email text, p_name text, p_active boolean,
  p_instruments uuid[], p_role text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  account_id uuid;
  account_count integer;
begin
  if (select ibh_private.member_role()) is distinct from 'admin' then raise insufficient_privilege; end if;
  perform pg_advisory_xact_lock(842310, 1);
  if (select ibh_private.member_role()) is distinct from 'admin' then raise insufficient_privilege; end if;
  if p_role is null or p_role not in ('admin','teacher') or p_active is null
     or p_name is null or length(trim(p_name)) not between 1 and 120 then
    raise check_violation;
  end if;
  if p_id is not null then
    select profile_id into strict account_id from public.teachers where id=p_id for update;
  end if;
  if account_id is null then
    if nullif(trim(p_email),'') is null then
      raise exception 'Informe o e-mail da conta.' using errcode='P1002';
    end if;
    select count(*), (array_agg(id))[1] into account_count,account_id
    from auth.users where lower(email)=lower(trim(p_email)) and not is_sso_user and not is_anonymous;
    if account_count=0 then raise exception 'Conta ainda não cadastrada.' using errcode='P1001'; end if;
    if account_count<>1 then raise exception 'E-mail não identifica uma conta única.' using errcode='P1002'; end if;
  end if;
  if account_id=(select auth.uid()) and (p_role<>'admin' or not p_active) then
    raise exception 'Um administrador não pode retirar o próprio acesso.' using errcode='P1003';
  end if;
  insert into public.profiles(id,name,role,active)
  values(account_id,trim(p_name),p_role,p_active)
  on conflict (id) do update set role=excluded.role,active=excluded.active;
  return public.save_teacher(p_id,account_id,p_name,p_active,p_instruments);
end $$;

revoke all on function public.save_teacher_access(uuid,text,text,boolean,uuid[],text) from public,anon,authenticated;
grant execute on function public.save_teacher_access(uuid,text,text,boolean,uuid[],text) to authenticated;

create function ibh_private.check_teacher_account() returns trigger
language plpgsql set search_path='' as $$
begin
  if tg_op='UPDATE' then
    if new.teacher_id is not distinct from old.teacher_id then return new; end if;
  end if;
  if new.teacher_id is not null and not exists (
    select 1 from public.teachers t join public.profiles p on p.id=t.profile_id
    where t.id=new.teacher_id and t.active and p.active
  ) then
    raise exception 'Professor sem conta ativa vinculada.' using errcode='P1004';
  end if;
  return new;
end $$;
revoke all on function ibh_private.check_teacher_account() from public,anon,authenticated;
create trigger validate_teacher_account before insert or update of teacher_id on public.class_sessions
for each row execute function ibh_private.check_teacher_account();

commit;
