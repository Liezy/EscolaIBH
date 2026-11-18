begin;

create or replace function ibh_private.check_session() returns trigger
language plpgsql set search_path='' as $$
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
    select 1 from public.teachers where id=new.teacher_id and active
  ) then
    raise exception 'Professor inativo.' using errcode='23514';
  end if;
  return new;
end $$;

commit;
