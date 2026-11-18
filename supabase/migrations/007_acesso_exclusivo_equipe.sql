begin;

drop function if exists public.register_student(text,text,uuid[]);
drop function if exists public.student_portal();
drop function if exists ibh_private.student_account();

commit;
