-- Run against the linked existing project. Always rolls back all QA users/data.
begin;
create temp table meday_points_qa_ids (a uuid, b uuid);
insert into meday_points_qa_ids values(gen_random_uuid(),gen_random_uuid());
insert into auth.users(id,aud,role,email,created_at,updated_at)
select id,'authenticated','authenticated','points-sql-'||id::text||'@example.invalid',now(),now()
from (select a as id from meday_points_qa_ids union all select b from meday_points_qa_ids) q;

do $$
#variable_conflict use_variable
declare a uuid; b uuid; today date := (now() at time zone 'Asia/Seoul')::date;
  payload jsonb := '{"records":[],"exercises":[],"goals":{},"evaluations":{},"dayEvaluations":{}}';
  first_row jsonb; extra jsonb; total integer; blocked boolean; touched integer;
begin
  select q.a,q.b into a,b from meday_points_qa_ids q;
  first_row := jsonb_build_object('id','first-record','date',today,'time','','meal','breakfast','name','직접 기록');
  payload := jsonb_set(payload,'{records}',jsonb_build_array(first_row));
  perform set_config('request.jwt.claims',jsonb_build_object('sub',a,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  insert into public.meday_journals(user_id,payload) values(a,payload);
  if (public.meday_points_summary()->>'balance')::int <> 200 then raise exception 'first save must award 200'; end if;
  -- Editing the slot/date/optional inputs still refers to the same record ID.
  payload := jsonb_set(payload,'{records,0,meal}','"lunch"');
  payload := jsonb_set(payload,'{records,0,date}',to_jsonb((today-1)::text));
  update public.meday_journals set payload=payload || '{"points":999999}'::jsonb where user_id=a;
  if (public.meday_points_summary()->>'balance')::int <> 200 then raise exception 'edit/tampered payload minted points'; end if;
  delete from public.meday_journals where user_id=a;
  payload := jsonb_set(payload,'{records}',jsonb_build_array(first_row || '{"id":"replacement-record"}'::jsonb));
  insert into public.meday_journals(user_id,payload) values(a,payload);
  if (public.meday_points_summary()->>'balance')::int <> 200 then raise exception 'journal delete/recreate minted points'; end if;
  blocked := false;
  begin insert into public.meday_points_ledger(user_id,record_id,record_date,slot) values(a,'forged',today,'lunch');
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'ledger insert allowed'; end if;
  blocked := false;
  begin update public.meday_points_ledger set amount=200 where user_id=a;
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'ledger update allowed'; end if;
  blocked := false;
  begin delete from public.meday_points_ledger where user_id=a;
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'ledger delete allowed'; end if;
  blocked := false;
  begin perform count(*) from meday_private.reward_record_ids;
  exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'private dedup table accessible'; end if;

  execute 'reset role';
  -- Simulate the original reward being on a prior day: date-slot uniqueness
  -- and permanent IDs must still block re-registration on a later reward day.
  update public.meday_points_ledger set earned_on=today-1 where user_id=a;
  execute 'set local role authenticated';
  delete from public.meday_journals where user_id=a;
  payload := jsonb_set(payload,'{records}',jsonb_build_array(first_row || '{"id":"another-replacement"}'::jsonb));
  insert into public.meday_journals(user_id,payload) values(a,payload);
  if (public.meday_points_summary()->>'todayEarned')::int <> 0 then raise exception 'cross-day re-register minted points'; end if;
  extra := first_row || jsonb_build_object('id','first-record','date',today-2,'meal','dinner');
  payload := jsonb_set(payload,'{records}',payload->'records'||jsonb_build_array(extra));
  update public.meday_journals set payload=payload where user_id=a;
  if (public.meday_points_summary()->>'balance')::int <> 200 then raise exception 'old ID with a changed slot/date minted points'; end if;
  payload := jsonb_set(payload,'{records}',jsonb_build_array(
    first_row || jsonb_build_object('id','new-breakfast','date',today-1),
    first_row || '{"id":"new-lunch","meal":"lunch"}'::jsonb,
    first_row || '{"id":"new-dinner","meal":"dinner"}'::jsonb));
  payload := jsonb_set(payload,'{exercises}',jsonb_build_array(jsonb_build_object('id','new-exercise','date',today,'time','','minutes',0)));
  execute 'reset role';
  insert into storage.objects(bucket_id,name) values('meday-photos',a::text||'/weight-proof.jpg');
  execute 'set local role authenticated';
  payload := jsonb_set(payload,'{weights}',jsonb_build_array(jsonb_build_object('id','new-weight','date',today,'time','','kg',null,'photoPath',a::text||'/weight-proof.jpg')));
  update public.meday_journals set payload=payload where user_id=a;
  if (public.meday_points_summary()->>'todayEarned')::int <> 1000 then raise exception 'five categories must award 1000'; end if;
  extra := jsonb_build_array(
    first_row || jsonb_build_object('id','extra-breakfast','date',today-3),
    first_row || jsonb_build_object('id','extra-lunch','date',today-3,'meal','lunch'),
    first_row || jsonb_build_object('id','future-dinner','date',today+1,'meal','dinner'),
    first_row || '{"id":"invalid-date","date":"2026-99-99"}'::jsonb);
  payload := jsonb_set(payload,'{records}',payload->'records'||extra);
  update public.meday_journals set payload=payload where user_id=a;
  if (public.meday_points_summary()->>'todayEarned')::int <> 1000 then raise exception 'daily cap bypassed'; end if;
  if (public.meday_points_summary()->>'balance')::int <> 1200 then raise exception 'unexpected total balance'; end if;

  perform set_config('request.jwt.claims',jsonb_build_object('sub',b,'role','authenticated')::text,true);
  if (public.meday_points_summary()->>'balance')::int <> 0 then raise exception 'another account sees a balance'; end if;
  select count(*) into total from public.meday_points_ledger where user_id=a;
  if total<>0 then raise exception 'cross-user ledger leak'; end if;
  update public.meday_journals set payload=payload where user_id=a;
  get diagnostics touched=row_count;
  if touched<>0 then raise exception 'cross-user journal write'; end if;
  -- Pre-existing IDs are not retroactively awarded when updated.
  execute 'reset role';
  insert into meday_private.reward_record_ids values(b,'baseline-record');
  execute 'set local role authenticated';
  insert into public.meday_journals(user_id,payload) values(b,jsonb_set(payload,'{records}',jsonb_build_array(first_row||'{"id":"baseline-record"}'::jsonb))||'{"exercises":[],"weights":[]}'::jsonb);
  if (public.meday_points_summary()->>'balance')::int <> 0 then raise exception 'baseline record retroactively awarded'; end if;
  -- A failed transaction must not leave a reward/seen ID behind.
  blocked:=false;
  begin
    update public.meday_journals set payload=jsonb_set(payload,'{records}',jsonb_build_array(first_row||'{"id":"rolled-back"}'::jsonb)) where user_id=b;
    raise exception using errcode='P0002',message='simulate save failure';
  exception when no_data_found then blocked:=true; end;
  if not blocked or (public.meday_points_summary()->>'balance')::int<>0 then raise exception 'failed save awarded points'; end if;
  execute 'set local role anon';
  blocked:=false;
  begin perform public.meday_points_summary(); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'anonymous wallet access'; end if;
  execute 'reset role';
  raise notice 'PASS: first save, edits, whole-journal deletion, new IDs, cross-day replay, 1000P cap with photo-only weight, future/malformed dates, baseline, rollback, ledger write protection, cross-user RLS, anonymous denial';
end $$;
rollback;
