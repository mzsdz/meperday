-- Transactional check of the reversible rewards pause; never retains QA rows.
begin;
do $$
declare u uuid := gen_random_uuid(); d date := (now() at time zone 'Asia/Seoul')::date;
  blocked boolean := false;
begin
  if not exists(select 1 from pg_trigger where tgrelid='public.meday_journals'::regclass and tgname='meday_award_record_points' and tgenabled='D') then
    raise exception 'reward trigger is not paused';
  end if;
  insert into auth.users(id,aud,role,email,created_at,updated_at) values(u,'authenticated','authenticated','paused-'||u||'@example.invalid',now(),now());
  insert into public.meday_points_ledger(user_id,record_id,record_date,slot) values(u,'historical',d-1,'breakfast');
  perform set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  insert into public.meday_journals(user_id,payload) values(u,jsonb_build_object(
    'records',jsonb_build_array(jsonb_build_object('id','new-food','date',d,'meal','breakfast')),
    'exercises',jsonb_build_array(jsonb_build_object('id','new-exercise','date',d)),
    'weights',jsonb_build_array(jsonb_build_object('id','new-weight','date',d))));
  update public.meday_journals set payload=payload||'{"captures":[]}'::jsonb where user_id=u;
  delete from public.meday_journals where user_id=u;
  if (public.meday_points_summary()->>'balance')::int <> 200 then raise exception 'historical balance changed or new points awarded'; end if;
  begin insert into public.meday_points_ledger(user_id,record_id,record_date,slot) values(u,'forged',d,'lunch');
    exception when insufficient_privilege then blocked:=true;
  end;
  if not blocked then raise exception 'ledger is writable by user'; end if;
  execute 'reset role';
end $$;
select 'PASS: reward pause preserves historical balance and rejects client awards' as result;
rollback;
