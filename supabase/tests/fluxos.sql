-- Execute após a migração, em desenvolvimento. Os dados de teste são revertidos.
begin;
insert into auth.users(id,email) values
('fc000000-0000-4000-8000-000000000001','admin-teste@example.invalid'),
('fc000000-0000-4000-8000-000000000002','professor-teste@example.invalid'),
('fc000000-0000-4000-8000-000000000003','outro-teste@example.invalid'),
('fc000000-0000-4000-8000-000000000004','inativo-teste@example.invalid');
insert into public.profiles(id,name,role,active) values
('fc000000-0000-4000-8000-000000000001','Admin teste','admin',true),
('fc000000-0000-4000-8000-000000000002','Professor teste','teacher',true),
('fc000000-0000-4000-8000-000000000003','Outro teste','teacher',true),
('fc000000-0000-4000-8000-000000000004','Inativo teste','teacher',false);

set local role authenticated;
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
do $$
declare
  violao uuid := (select id from public.instruments where name='Violão');
  bateria uuid := (select id from public.instruments where name='Bateria');
  tid uuid;
  sid uuid;
  added integer;
begin
  update public.settings set starts_on='2026-11-22',start_time='09:00',sunday_weeks=array[2,4] where id;
  update public.instruments set active=(id in (violao,bateria));
  added := public.generate_month('2096-11-01');
  if added <> 4 or
     (select array_agg(distinct date order by date) from public.class_sessions where date between '2096-11-01' and '2096-11-30')
       is distinct from array['2096-11-11','2096-11-25']::date[] then
    raise exception 'Datas ou quantidade da geração mensal incorretas (% encontros)', added;
  end if;
  if public.generate_month('2096-11-22') <> 0 then raise exception 'Geração duplicou encontros'; end if;
  if public.generate_month('2026-10-01') <> 0 then raise exception 'Geração ignorou início da escola'; end if;

  tid := public.save_teacher(null,'fc000000-0000-4000-8000-000000000002','Docente fixture',true,array[violao,bateria]);
  begin
    insert into public.class_sessions(instrument_id,teacher_id,date,start_time) values
      (violao,tid,'2001-02-10','09:00'),(bateria,tid,'2001-02-10','09:00');
    raise exception 'Conflito de professor não bloqueado';
  exception when unique_violation then null; end;
  insert into public.class_sessions(id,instrument_id,teacher_id,date,start_time) values
    ('fc000000-0000-4000-8000-000000000010',violao,tid,'2001-02-10','09:00'),
    ('fc000000-0000-4000-8000-000000000011',violao,tid,'2001-02-24','09:00'),
    ('fc000000-0000-4000-8000-000000000012',bateria,tid,'2001-02-17','09:00');

  sid := public.save_student(null,'Aluno fixture','','',jsonb_build_array(
    jsonb_build_object('instrument_id',violao,'enrollment_date','2026-11-22','status','active'),
    jsonb_build_object('instrument_id',bateria,'enrollment_date','2026-12-13','status','confirmed')
  ));
  if (select count(*) from public.enrollments where student_id=sid) <> 2 then
    raise exception 'As modalidades do aluno não foram persistidas';
  end if;
end $$;

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000003',true);
do $$
begin
  if not exists (select 1 from public.students where name='Aluno fixture') then
    raise exception 'Professor precisa consultar alunos';
  end if;
  begin
    update public.profiles set role='admin' where id=auth.uid();
    raise exception 'Professor conseguiu promover a própria conta';
  exception when insufficient_privilege then null; end;
  begin
    perform public.generate_month('2096-12-01');
    raise exception 'Professor conseguiu gerar escala';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.lesson_records(session_id,teacher_id,content)
    select id,teacher_id,'Registro indevido' from public.class_sessions where id='fc000000-0000-4000-8000-000000000010';
    raise exception 'Professor registrou encontro de terceiro';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000002',true);
insert into public.lesson_records(session_id,teacher_id,content,next_lesson_suggestions)
select id,teacher_id,'Acordes Em e Am','Revisar troca de acordes' from public.class_sessions
where id='fc000000-0000-4000-8000-000000000010';
insert into public.lesson_records(session_id,teacher_id,content)
select id,teacher_id,'Ritmo' from public.class_sessions where id='fc000000-0000-4000-8000-000000000012';
update public.lesson_records set observations='Boa participação'
where session_id='fc000000-0000-4000-8000-000000000010';
do $$
begin
  if not exists (
    select 1 from public.lesson_records r join public.class_sessions s on s.id=r.session_id
    where s.id='fc000000-0000-4000-8000-000000000010' and s.status='completed' and r.observations='Boa participação'
  ) then raise exception 'Professor não registrou/editou sua aula ou não concluiu o encontro'; end if;
end $$;

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000003',true);
do $$
declare recommendation text;
begin
  update public.lesson_records set content='Alteração indevida' where session_id='fc000000-0000-4000-8000-000000000010';
  if found then raise exception 'Professor editou registro de terceiro'; end if;
  select r.next_lesson_suggestions into recommendation from public.lesson_records r
  join public.class_sessions s on s.id=r.session_id
  join public.class_sessions target on target.id='fc000000-0000-4000-8000-000000000011'
  where s.instrument_id=target.instrument_id and s.date<target.date order by s.date desc limit 1;
  if recommendation is distinct from 'Revisar troca de acordes' then
    raise exception 'Histórico não retornou o registro anterior da modalidade';
  end if;
end $$;

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000004',true);
do $$
begin
  if exists(select 1 from public.students) then raise exception 'Perfil inativo leu alunos'; end if;
end $$;
reset role;
set local role anon;
do $$
begin
  begin
    perform 1 from public.students;
    raise exception 'Visitante leu alunos';
  exception when insufficient_privilege then null; end;
end $$;
rollback;
