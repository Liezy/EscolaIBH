begin;

alter policy admin_insert on public.class_sessions
  with check ((select ibh_private.member_role()) is not null);
alter policy admin_update on public.class_sessions
  using ((select ibh_private.member_role()) is not null)
  with check ((select ibh_private.member_role()) is not null);
alter policy admin_delete on public.class_sessions
  using ((select ibh_private.member_role()) is not null);
alter policy admin_insert on public.class_sessions rename to staff_insert;
alter policy admin_update on public.class_sessions rename to staff_update;
alter policy admin_delete on public.class_sessions rename to staff_delete;

-- A validação precisa consultar a conta de outro professor sem ampliar o acesso a profiles.
alter function ibh_private.check_teacher_account() security definer;

create function public.available_teacher_ids() returns uuid[]
language sql stable security definer set search_path='' as $$
  select coalesce(array_agg(t.id),'{}'::uuid[])
  from public.teachers t join public.profiles p on p.id=t.profile_id
  where t.active and p.active and (select ibh_private.member_role()) is not null
$$;
revoke all on function public.available_teacher_ids() from public,anon,authenticated;
grant execute on function public.available_teacher_ids() to authenticated;

create or replace function public.generate_month(p_month date) returns integer
language plpgsql security invoker set search_path='' as $$
declare added integer;
begin
  if (select ibh_private.member_role()) is null then raise insufficient_privilege; end if;
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

commit;
