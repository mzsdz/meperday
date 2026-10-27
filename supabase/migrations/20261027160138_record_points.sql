begin;
-- Rewards are an append-only server ledger, independent of deletable journals.
create table public.meday_points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id text not null,
  record_date date not null,
  slot text not null check (slot in ('breakfast','lunch','dinner','exercise','weight')),
  earned_on date not null default (now() at time zone 'Asia/Seoul')::date,
  amount integer not null default 200 check (amount = 200),
  created_at timestamptz not null default now(),
  unique (user_id, record_date, slot),
  unique (user_id, earned_on, slot)
);
alter table public.meday_points_ledger enable row level security;
revoke all on public.meday_points_ledger from public, anon, authenticated;
grant select on public.meday_points_ledger to authenticated;
create policy meday_points_owner_read on public.meday_points_ledger
  for select to authenticated using (user_id = (select auth.uid()));
create index meday_points_history on public.meday_points_ledger(user_id, created_at desc);

-- Keep IDs after journal/record deletion. An edit can never become a first save.
create table meday_private.reward_record_ids (
  user_id uuid not null references auth.users(id) on delete cascade,
  record_id text not null,
  primary key (user_id, record_id)
);
alter table meday_private.reward_record_ids enable row level security;
revoke all on meday_private.reward_record_ids from public, anon, authenticated;

-- Existing records are a baseline, not a retroactive grant on their next edit.
insert into meday_private.reward_record_ids(user_id,record_id)
select j.user_id, r->>'id' from public.meday_journals j
cross join lateral jsonb_array_elements(
  (case when jsonb_typeof(j.payload->'records')='array' then j.payload->'records' else '[]'::jsonb end) ||
  (case when jsonb_typeof(j.payload->'exercises')='array' then j.payload->'exercises' else '[]'::jsonb end) ||
  (case when jsonb_typeof(j.payload->'weights')='array' then j.payload->'weights' else '[]'::jsonb end)
) r
where jsonb_typeof(r->'id')='string' and length(r->>'id') between 1 and 128
on conflict do nothing;

create function meday_private.award_record_points() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  item record; row_data jsonb; row_id text; slot_name text; recorded date;
  today date := (now() at time zone 'Asia/Seoul')::date;
  unseen integer; has_photo boolean;
begin
  if auth.uid() is not null and auth.uid() <> new.user_id then
    raise exception 'record_owner_mismatch';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('meday-points:'||new.user_id::text,0));
  for item in
    select r as value, 'food' as kind from jsonb_array_elements(
      case when jsonb_typeof(new.payload->'records')='array' then new.payload->'records' else '[]'::jsonb end) r
    union all
    select r as value, 'exercise' as kind from jsonb_array_elements(
      case when jsonb_typeof(new.payload->'exercises')='array' then new.payload->'exercises' else '[]'::jsonb end) r
    union all
    select r as value, 'weight' as kind from jsonb_array_elements(
      case when jsonb_typeof(new.payload->'weights')='array' then new.payload->'weights' else '[]'::jsonb end) r
  loop
    row_data := item.value;
    row_id := row_data->>'id';
    if jsonb_typeof(row_data->'id') is distinct from 'string' or length(row_id) not between 1 and 128 then continue; end if;
    insert into meday_private.reward_record_ids(user_id,record_id) values(new.user_id,row_id) on conflict do nothing;
    get diagnostics unseen = row_count;
    if unseen=0 then continue; end if;
    slot_name := case when item.kind='food' then row_data->>'meal' else item.kind end;
    if slot_name is null or slot_name not in ('breakfast','lunch','dinner','exercise','weight') or
       (item.kind='food' and slot_name in ('exercise','weight')) then continue; end if;
    if coalesce(row_data->>'date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then continue; end if;
    begin recorded := (row_data->>'date')::date;
    exception when datetime_field_overflow or invalid_datetime_format then continue;
    end;
    if recorded > today then continue; end if;
    -- A photo-only record is complete. Manual records need no optional fields.
    has_photo := coalesce(row_data->>'photoPath','') like new.user_id::text||'/%' and exists(
      select 1 from storage.objects where bucket_id='meday-photos' and name=row_data->>'photoPath');
    if not has_photo then
      if item.kind='weight' then continue; end if;
      if item.kind='exercise' then
        if nullif(btrim(coalesce(row_data->>'type','')),'') is null and
           jsonb_typeof(row_data->'minutes') is distinct from 'number' and
           jsonb_typeof(row_data->'calories') is distinct from 'number' then continue; end if;
      elsif nullif(btrim(coalesce(row_data->>'name','')),'') is null then continue;
      end if;
    end if;
    insert into public.meday_points_ledger(user_id,record_id,record_date,slot,earned_on,amount)
    values(new.user_id,row_id,recorded,slot_name,today,200) on conflict do nothing;
  end loop;
  return new;
end;
$$;
revoke all on function meday_private.award_record_points() from public, anon, authenticated;
create trigger meday_award_record_points after insert or update of payload on public.meday_journals
  for each row execute function meday_private.award_record_points();

-- Invoker rights preserve the caller's RLS; there is no mint/claim RPC.
create function public.meday_points_summary() returns jsonb
language sql stable security invoker set search_path = '' as $$
select jsonb_build_object(
  'balance',coalesce(sum(amount),0),
  'todayEarned',coalesce(sum(amount) filter(where earned_on=(now() at time zone 'Asia/Seoul')::date),0),
  'day',(now() at time zone 'Asia/Seoul')::date,
  'dailyLimit',1000,'perRecord',200,
  'completedSlots',coalesce(jsonb_agg(slot) filter(where earned_on=(now() at time zone 'Asia/Seoul')::date),'[]'::jsonb),
  'history',(select coalesce(jsonb_agg(to_jsonb(h) order by h.created_at desc,h.id),'[]'::jsonb)
    from (select id,record_date,slot,earned_on,amount,created_at from public.meday_points_ledger
      where user_id=(select auth.uid()) order by created_at desc,id limit 20) h)
) from public.meday_points_ledger where user_id=(select auth.uid());
$$;
revoke all on function public.meday_points_summary() from public, anon;
grant execute on function public.meday_points_summary() to authenticated;
notify pgrst,'reload schema';
commit;
