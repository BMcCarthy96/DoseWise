-- report_cache: shared, service-role-only cache of generated TrustReports so
-- scanning the same product twice doesn't re-run the pipeline. Never exposed
-- to clients directly — only api/_lib/cache.ts (using the service role key)
-- reads/writes this table.
create table if not exists report_cache (
  id uuid primary key default gen_random_uuid(),
  product_key text unique not null,
  upc text,
  dsld_id int,
  brand text,
  product_name text,
  report jsonb not null,
  report_version int not null default 1,
  model text not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

create index if not exists report_cache_product_key_idx on report_cache (product_key);

alter table report_cache enable row level security;
-- No policies defined on purpose: with RLS enabled and zero policies, only
-- the service role (which bypasses RLS entirely) can access this table.
-- The anon/authenticated keys used by the app can never read or write it.

-- scan_history: a signed-in user's personal scan history, synced up from
-- local AsyncStorage on sign-in. Anonymous scans never touch this table.
create table if not exists scan_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scanned_at timestamptz not null default now(),
  product_key text not null,
  brand text,
  product_name text,
  verdict text,
  score int,
  report_cache_id uuid references report_cache(id) on delete set null
);

create index if not exists scan_history_user_id_idx on scan_history (user_id);

alter table scan_history enable row level security;

create policy "select own history" on scan_history
  for select using (auth.uid() = user_id);

create policy "insert own history" on scan_history
  for insert with check (auth.uid() = user_id);

create policy "update own history" on scan_history
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "delete own history" on scan_history
  for delete using (auth.uid() = user_id);
