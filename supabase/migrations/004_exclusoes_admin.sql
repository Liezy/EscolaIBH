begin;

grant delete on public.class_sessions, public.lesson_records, public.students to authenticated;
create policy admin_delete on public.class_sessions for delete to authenticated
  using ((select ibh_private.member_role())='admin');
create policy admin_delete on public.lesson_records for delete to authenticated
  using ((select ibh_private.member_role())='admin');
create policy admin_delete on public.students for delete to authenticated
  using ((select ibh_private.member_role())='admin');

create function public.remove_student(p_id uuid) returns uuid
language plpgsql security invoker set search_path='' as $$
declare removed uuid;
begin
  if (select ibh_private.member_role()) is distinct from 'admin' then raise insufficient_privilege; end if;
  perform 1 from public.students where id=p_id for update;
  if not found then raise no_data_found; end if;
  delete from public.enrollments where student_id=p_id;
  delete from public.students where id=p_id returning id into strict removed;
  return removed;
end $$;

revoke all on function public.remove_student(uuid) from public,anon,authenticated;
grant execute on function public.remove_student(uuid) to authenticated;

commit;
