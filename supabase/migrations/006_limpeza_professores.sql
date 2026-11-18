begin;

grant delete on public.teachers to authenticated;
create policy admin_delete_unlinked on public.teachers for delete to authenticated
  using (profile_id is null and (select ibh_private.member_role())='admin');

create function public.remove_unlinked_teachers() returns integer
language plpgsql security invoker set search_path='' as $$
declare
  teacher uuid;
  removed integer := 0;
begin
  if (select ibh_private.member_role()) is distinct from 'admin' then raise insufficient_privilege; end if;
  for teacher in
    select id from public.teachers where profile_id is null order by id for update
  loop
    if not exists (select 1 from public.class_sessions where teacher_id=teacher)
       and not exists (select 1 from public.lesson_records where teacher_id=teacher) then
      delete from public.teacher_instruments where teacher_id=teacher;
      delete from public.teachers where id=teacher and profile_id is null;
      if found then removed := removed+1; end if;
    end if;
  end loop;
  return removed;
end $$;

revoke all on function public.remove_unlinked_teachers() from public,anon,authenticated;
grant execute on function public.remove_unlinked_teachers() to authenticated;

commit;
