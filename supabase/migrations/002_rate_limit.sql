-- api_rate_limit: cross-instance request accounting for the public API routes.
--
-- The original limiter lived in a module-level Map in api/_lib/ratelimit.ts, so
-- it only ever bounded a single warm Vercel instance. Its advertised "300
-- requests/day" spend ceiling was therefore 300 *per instance*: under any real
-- burst Vercel runs several concurrently, and every cold start reset the counter
-- to zero. Since each request can drive a Claude call, that made the cap on
-- Anthropic spend effectively unbounded. This table moves the counters somewhere
-- all instances share.
--
-- Same access model as report_cache: RLS on, zero policies, so only the service
-- role (which bypasses RLS) can touch it. The anon key shipped in the app bundle
-- can neither read the counters nor reset them.
create table if not exists api_rate_limit (
  bucket text primary key,
  count int not null default 0,
  expires_at timestamptz not null
);

create index if not exists api_rate_limit_expires_at_idx on api_rate_limit (expires_at);

alter table api_rate_limit enable row level security;

-- Consumes one unit against every bucket in p_buckets and reports whether the
-- caller is within budget for all of them. Taking the whole rule set in one call
-- keeps it to a single round trip on the hot path, and makes the increment
-- atomic per bucket: the INSERT ... ON CONFLICT DO UPDATE is a single statement,
-- so two instances racing the same bucket cannot both read a stale count.
--
-- A bucket whose window has elapsed is reset in place rather than deleted, so
-- the table's row count tracks distinct clients rather than total requests.
create or replace function consume_rate_limits(
  p_buckets text[],
  p_limits int[],
  p_windows int[]
) returns table (allowed boolean, retry_after int)
language plpgsql
security definer
set search_path = public
as $$
declare
  i int;
  v_count int;
  v_expires timestamptz;
  v_allowed boolean := true;
  v_retry int := 0;
begin
  for i in 1 .. coalesce(array_length(p_buckets, 1), 0) loop
    insert into api_rate_limit as t (bucket, count, expires_at)
    values (p_buckets[i], 1, now() + make_interval(secs => p_windows[i]))
    on conflict (bucket) do update
      set count = case when t.expires_at <= now() then 1 else t.count + 1 end,
          expires_at = case
            when t.expires_at <= now() then now() + make_interval(secs => p_windows[i])
            else t.expires_at
          end
    returning t.count, t.expires_at into v_count, v_expires;

    if v_count > p_limits[i] then
      v_allowed := false;
      v_retry := greatest(v_retry, ceil(extract(epoch from (v_expires - now())))::int);
    end if;
  end loop;

  -- Opportunistic GC. Buckets are reused in place, so growth is bounded by
  -- distinct clients rather than traffic; sweeping on roughly 1 call in 1000 is
  -- enough to reclaim one-off IPs without needing a scheduled job.
  if random() < 0.001 then
    delete from api_rate_limit where expires_at < now() - interval '1 hour';
  end if;

  return query select v_allowed, greatest(v_retry, 1);
end;
$$;

-- The function is SECURITY DEFINER, so make sure the keys that ship in the app
-- bundle cannot invoke it directly.
revoke all on function consume_rate_limits(text[], int[], int[]) from public;
revoke all on function consume_rate_limits(text[], int[], int[]) from anon;
revoke all on function consume_rate_limits(text[], int[], int[]) from authenticated;
