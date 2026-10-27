create schema if not exists meday_private;
revoke all on schema meday_private from public, anon;
grant usage on schema meday_private to authenticated;
create table meday_private.ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null,
  calls integer not null check(calls between 1 and 20),
  primary key(user_id,usage_day)
);
alter table meday_private.ai_usage enable row level security;
revoke all on meday_private.ai_usage from public, anon, authenticated;
create function meday_private.reserve_ai() returns integer
language plpgsql security definer set search_path = '' as $$
declare current_user_id uuid := auth.uid(); today date := (now() at time zone 'Asia/Seoul')::date; used integer;
begin
  if current_user_id is null then raise exception 'authentication_required'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('meday-ai:'||current_user_id::text,0));
  select calls into used from meday_private.ai_usage where user_id=current_user_id and usage_day=today;
  if coalesce(used,0)>=20 then raise exception 'analysis_daily_limit'; end if;
  insert into meday_private.ai_usage(user_id,usage_day,calls) values(current_user_id,today,1)
  on conflict(user_id,usage_day) do update set calls=meday_private.ai_usage.calls+1
  returning calls into used;
  return 20-used;
end;
$$;
revoke all on function meday_private.reserve_ai() from public, anon;
grant execute on function meday_private.reserve_ai() to authenticated;
create function public.reserve_meday_ai() returns integer language sql security invoker set search_path = '' as $$ select meday_private.reserve_ai(); $$;
revoke all on function public.reserve_meday_ai() from public, anon;
grant execute on function public.reserve_meday_ai() to authenticated;
