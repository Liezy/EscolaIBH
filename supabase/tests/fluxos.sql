-- Execute após as migrações, em desenvolvimento. Os dados de teste são revertidos.
begin;
do $$
begin
  if to_regprocedure('public.student_portal()') is not null or
     to_regprocedure('public.register_student(text,text,uuid[])') is not null then
    raise exception 'O cadastro público de alunos ainda está disponível';
  end if;
end $$;
insert into auth.users(id,email) values
('fc000000-0000-4000-8000-000000000001','admin-teste@example.invalid'),
('fc000000-0000-4000-8000-000000000002','professor-teste@example.invalid'),
('fc000000-0000-4000-8000-000000000003','outro-teste@example.invalid'),
('fc000000-0000-4000-8000-000000000004','inativo-teste@example.invalid'),
('fc000000-0000-4000-8000-000000000005','gestor-teste@example.invalid');
update auth.users set email_confirmed_at=now()
where id in ('fc000000-0000-4000-8000-000000000001','fc000000-0000-4000-8000-000000000002',
  'fc000000-0000-4000-8000-000000000003','fc000000-0000-4000-8000-000000000004','fc000000-0000-4000-8000-000000000005');
insert into public.profiles(id,name,role,active) values
('fc000000-0000-4000-8000-000000000001','Admin teste','admin',true),
('fc000000-0000-4000-8000-000000000002','Professor teste','teacher',true),
('fc000000-0000-4000-8000-000000000003','Outro teste','teacher',true),
('fc000000-0000-4000-8000-000000000004','Inativo teste','teacher',false);

set local role authenticated;
select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
do $$
declare
  violao uuid;
  bateria uuid;
  tid uuid;
  sid uuid;
  added integer;
  pending uuid;
  manager uuid;
begin
  insert into public.instruments(name) values ('Violão fixture') returning id into violao;
  insert into public.instruments(name) values ('Bateria fixture') returning id into bateria;
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

  -- O cadastro tem vínculo apenas com Violão e pode receber encontros nas duas modalidades.
  tid := public.save_teacher(null,'fc000000-0000-4000-8000-000000000002','Docente fixture',true,array[violao]);
  pending := public.save_teacher(null,null,'Cadastro sem conta',true,array[violao]);
  begin
    insert into public.class_sessions(instrument_id,teacher_id,date,start_time) values (violao,pending,'2001-02-09','09:00');
    raise exception 'Cadastro sem conta apareceu como opção válida';
  exception when sqlstate 'P1004' then null; end;
  manager := public.save_teacher_access(pending,'GESTOR-TESTE@example.invalid','Gestor fixture',true,array[violao],'admin');
  if manager<>pending or not exists(select 1 from public.profiles where id='fc000000-0000-4000-8000-000000000005' and role='admin' and active) then
    raise exception 'Vínculo e permissão de gestão não foram persistidos';
  end if;
  perform set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000005',true);
  update public.teachers set name='Docente atualizado' where id=tid;
  if not found then raise exception 'Administrador delegado não conseguiu gerenciar docente'; end if;
  perform set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
  perform public.save_teacher_access(manager,null,'Gestor fixture',false,array[violao],'teacher');
  if exists(select 1 from public.profiles where id='fc000000-0000-4000-8000-000000000005' and active) then
    raise exception 'Desativação não bloqueou o perfil';
  end if;
  begin
    perform public.save_teacher_access(null,'admin-teste@example.invalid','Admin teste',false,array[violao],'teacher');
    raise exception 'Administrador perdeu o próprio acesso';
  exception when sqlstate 'P1003' then null; end;
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
declare
  another_teacher uuid := (select id from public.teachers where profile_id='fc000000-0000-4000-8000-000000000002');
  instrument uuid := (select id from public.instruments where name='Violão fixture');
  meeting uuid;
  pupil uuid;
  enrollment jsonb := jsonb_build_array(jsonb_build_object('instrument_id',instrument,'enrollment_date','2026-11-22','status','active'));
begin
  begin
    perform public.save_teacher_access(null,'outro-teste@example.invalid','Outro teste',true,array[]::uuid[],'admin');
    raise exception 'Professor promoveu uma conta pela gestão de acessos';
  exception when insufficient_privilege then null; end;
  if not exists (select 1 from public.students where name='Aluno fixture') then
    raise exception 'Professor precisa consultar alunos';
  end if;
  pupil := public.save_student(null,'Aluno criado por professor','','',enrollment);
  perform public.save_student(pupil,'Aluno editado por professor','1234','',jsonb_set(enrollment,'{0,status}','"inactive"'));
  if not exists(select 1 from public.students where id=pupil and phone='1234')
     or not exists(select 1 from public.enrollments where student_id=pupil and status='inactive') then
    raise exception 'Professor não editou os dados e vínculos do aluno';
  end if;
  if public.remove_student(pupil) is distinct from pupil then raise exception 'Professor não removeu aluno'; end if;
  if exists(select 1 from public.students where id=pupil)
     or exists(select 1 from public.enrollments where student_id=pupil) then
    raise exception 'Remoção pelo professor deixou dados ou vínculos';
  end if;
  begin
    update public.profiles set role='admin' where id=auth.uid();
    raise exception 'Professor conseguiu promover a própria conta';
  exception when insufficient_privilege then null; end;
  if public.generate_month('2096-12-01') <> 4 then raise exception 'Professor não gerou escala'; end if;
  if not (another_teacher=any(public.available_teacher_ids())) or
     exists(select 1 from public.profiles where id='fc000000-0000-4000-8000-000000000002') then
    raise exception 'Professor não consegue consultar a elegibilidade sem ler perfis de terceiros';
  end if;
  insert into public.class_sessions(instrument_id,teacher_id,date,start_time)
  values(instrument,another_teacher,'2096-12-01','09:00') returning id into meeting;
  update public.class_sessions set start_time='10:00' where id=meeting;
  if not found then raise exception 'Professor não editou encontro'; end if;
  delete from public.class_sessions where id=meeting;
  if not found then raise exception 'Professor não excluiu encontro'; end if;
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
  delete from public.lesson_records where session_id='fc000000-0000-4000-8000-000000000010';
  if found then raise exception 'Professor excluiu registro'; end if;
  begin
    delete from public.class_sessions where id='fc000000-0000-4000-8000-000000000010';
    raise exception 'Professor excluiu encontro com registro';
  exception when foreign_key_violation then null; end;
  begin
    perform public.remove_unlinked_teachers();
    raise exception 'Professor limpou cadastros antigos';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000004',true);
do $$
begin
  if exists(select 1 from public.students) then raise exception 'Perfil inativo leu alunos'; end if;
  begin
    perform public.save_student(null,'Cadastro indevido','','','[]');
    raise exception 'Perfil inativo cadastrou aluno';
  exception when insufficient_privilege then null; end;
  begin
    perform public.remove_student('fc000000-0000-4000-8000-000000000099');
    raise exception 'Perfil inativo acessou a remoção de alunos';
  exception when insufficient_privilege then null; end;
  if cardinality(public.available_teacher_ids()) <> 0 then raise exception 'Perfil inativo consultou a escala'; end if;
  begin
    perform public.generate_month('2097-01-01');
    raise exception 'Perfil inativo gerou escala';
  exception when insufficient_privilege then null; end;
end $$;

select set_config('request.jwt.claim.sub','fc000000-0000-4000-8000-000000000001',true);
do $$
declare
  student uuid := (select id from public.students where name='Aluno fixture');
  instrument uuid := (select id from public.instruments where name='Violão fixture');
  orphan uuid;
  legacy uuid;
begin
  orphan := public.save_teacher(null,null,'Professor sem uso',true,array[instrument]);
  legacy := public.save_teacher(null,'fc000000-0000-4000-8000-000000000003','Professor com histórico',true,array[instrument]);
  insert into public.class_sessions(instrument_id,teacher_id,date,start_time) values (instrument,legacy,'2001-01-09','09:00');
  update public.teachers set profile_id=null where id=legacy;
  perform public.remove_unlinked_teachers();
  if exists(select 1 from public.teachers where id=orphan) or
     not exists(select 1 from public.teachers where id=legacy) or
     not exists(select 1 from public.teachers where profile_id='fc000000-0000-4000-8000-000000000002') then
    raise exception 'Limpeza não preservou professores em uso ou vinculados';
  end if;
  insert into public.lesson_records(session_id,teacher_id,content)
  select id,teacher_id,'Registro feito pela coordenação' from public.class_sessions
  where id='fc000000-0000-4000-8000-000000000011';
  update public.lesson_records set content='Registro revisado pela coordenação'
  where session_id='fc000000-0000-4000-8000-000000000010';
  if not found then raise exception 'Administrador não editou registro de professor'; end if;
  begin
    delete from public.class_sessions where id='fc000000-0000-4000-8000-000000000010';
    raise exception 'Encontro com registro deveria ser protegido';
  exception when foreign_key_violation then null; end;
  delete from public.lesson_records where session_id='fc000000-0000-4000-8000-000000000010';
  if not found then raise exception 'Administrador não excluiu registro'; end if;
  delete from public.class_sessions where id='fc000000-0000-4000-8000-000000000010';
  if not found then raise exception 'Administrador não excluiu encontro'; end if;
  if public.remove_student(student) is distinct from student then raise exception 'Administrador não removeu aluno'; end if;
  if exists(select 1 from public.enrollments where student_id=student) or
     exists(select 1 from public.students where id=student) then
    raise exception 'Remoção do aluno não foi concluída';
  end if;
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
