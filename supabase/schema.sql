create extension if not exists pgcrypto with schema extensions;

-- ============ USERS + AUTH ============

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  balance integer not null default 0,
  last_free_spin_at timestamptz,
  created_at timestamptz not null default now()
);
alter table users add column if not exists last_free_spin_at timestamptz;
-- users.candidate_id is added further below, after the candidates table exists
-- (see "one account per whitelisted person" in the CANDIDATES section).

alter table users enable row level security;
-- no policies: table only reachable through the security definer functions below

drop function if exists register_user(text, text);
drop function if exists register_user(text, text, text);
drop function if exists login_user(text, text);

-- p_full_name is checked against the candidates whitelist (case-insensitive,
-- trimmed) purely to confirm the registrant is a known internal person — it is
-- never stored as or used as the login username.
create or replace function register_user(p_full_name text, p_username text, p_password text)
returns table(id uuid, username text, balance integer, last_free_spin_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_candidate_id uuid;
begin
  if length(p_username) < 3 or length(p_password) < 6 then
    raise exception 'invalid_input';
  end if;
  if length(trim(p_full_name)) < 3 then
    raise exception 'invalid_name';
  end if;
  if exists (select 1 from users u where u.username = p_username) then
    raise exception 'username_taken';
  end if;

  select c.id into v_candidate_id
  from candidates c
  where lower(trim(c.name)) = lower(trim(p_full_name))
  limit 1;

  if v_candidate_id is null then
    raise exception 'name_not_found';
  end if;

  if exists (select 1 from users u where u.candidate_id = v_candidate_id) then
    raise exception 'name_already_registered';
  end if;

  return query
  insert into users (username, password_hash, balance, candidate_id)
  values (p_username, crypt(p_password, gen_salt('bf')), 1000, v_candidate_id)
  returning users.id, users.username, users.balance, users.last_free_spin_at;
end;
$$;

create or replace function login_user(p_username text, p_password text)
returns table(id uuid, username text, balance integer, last_free_spin_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  select u.id, u.username, u.balance, u.last_free_spin_at
  from users u
  where u.username = p_username
    and u.password_hash = crypt(p_password, u.password_hash);
end;
$$;

revoke all on function register_user(text, text, text) from public;
revoke all on function login_user(text, text) from public;
grant execute on function register_user(text, text, text) to anon, authenticated;
grant execute on function login_user(text, text) to anon, authenticated;

-- ============ OFFICES (kantor OJK) ============
-- Insert rows yourself via Supabase Studio Table Editor / SQL Editor.
-- e.g. insert into offices (name, abbr) values ('Kantor OJK Jakarta Pusat', 'KOJK-JKP');

create table if not exists offices (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  abbr text,
  created_at timestamptz not null default now()
);
alter table offices add column if not exists abbr text;

alter table offices enable row level security;

drop policy if exists "offices are publicly readable" on offices;
create policy "offices are publicly readable"
  on offices for select
  using (true);
-- no insert/update/delete policy for anon/authenticated — add rows from the
-- Supabase dashboard (table editor / SQL editor), which runs as an admin and
-- bypasses RLS.

-- ============ CANDIDATES ============
-- Insert rows yourself via Supabase Studio Table Editor / SQL Editor.
-- e.g. insert into candidates (name, kelas) values ('Ahmad Saputra', 'A');

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  kelas text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table candidates add column if not exists kelas text;
alter table candidates add column if not exists is_active boolean not null default true;

alter table candidates enable row level security;

drop policy if exists "candidates are publicly readable" on candidates;
create policy "candidates are publicly readable"
  on candidates for select
  using (true);
-- no insert/update/delete policy for anon/authenticated — add rows from the
-- Supabase dashboard, which bypasses RLS.

-- one account per whitelisted person: a candidate_id can back at most one user
alter table users add column if not exists candidate_id uuid references candidates(id);
drop index if exists users_candidate_id_unique;
create unique index users_candidate_id_unique on users(candidate_id) where candidate_id is not null;

-- ============ BIDS (taruhan) ============

create table if not exists bids (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  username text not null,
  candidate_id uuid not null references candidates(id),
  candidate_name text not null,
  office_id uuid not null references offices(id),
  office_name text not null,
  coins integer not null check (coins > 0),
  created_at timestamptz not null default now()
);
-- if bids already existed from a previous schema run (pre-candidates table):
alter table bids add column if not exists candidate_id uuid references candidates(id);
alter table bids alter column candidate_id set not null;

alter table bids enable row level security;

drop policy if exists "bids are publicly readable" on bids;
create policy "bids are publicly readable"
  on bids for select
  using (true);
-- no direct insert policy — writes only go through place_bid() below, which
-- also atomically deducts the user's balance server-side.

drop function if exists place_bid(uuid, uuid, text, integer);

create or replace function place_bid(p_user_id uuid, p_office_id uuid, p_candidate_id uuid, p_coins integer)
returns table(new_balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_office_name text;
  v_candidate_name text;
  v_new_balance integer;
begin
  if p_coins <= 0 then
    raise exception 'invalid_coins';
  end if;

  select o.name into v_office_name from offices o where o.id = p_office_id;
  if v_office_name is null then
    raise exception 'office_not_found';
  end if;

  select c.name into v_candidate_name from candidates c where c.id = p_candidate_id;
  if v_candidate_name is null then
    raise exception 'candidate_not_found';
  end if;

  update users
  set balance = balance - p_coins
  where id = p_user_id and balance >= p_coins
  returning users.username, users.balance into v_username, v_new_balance;

  if v_username is null then
    raise exception 'insufficient_balance';
  end if;

  insert into bids (user_id, username, candidate_id, candidate_name, office_id, office_name, coins)
  values (p_user_id, v_username, p_candidate_id, v_candidate_name, p_office_id, v_office_name, p_coins);

  return query select v_new_balance;
end;
$$;

revoke all on function place_bid(uuid, uuid, uuid, integer) from public;
grant execute on function place_bid(uuid, uuid, uuid, integer) to anon, authenticated;

-- ============ GACHA SLOT ============
-- symbols: cherry, lemon, bell, star, grape (regular) + seven (jackpot, rare)
-- payout: 3 different = 0, any 2 same = 20, 3 same regular = 100, 3x seven = 1000
-- 1 free spin per user per UTC day, otherwise costs 10 coin per spin.

create table if not exists spins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id),
  username text not null,
  symbols text[] not null,
  reward integer not null,
  was_free boolean not null,
  created_at timestamptz not null default now()
);

alter table spins enable row level security;

drop policy if exists "spins are publicly readable" on spins;
create policy "spins are publicly readable"
  on spins for select
  using (true);
-- no direct insert policy — writes only go through spin_slot() below.

create or replace function pick_slot_symbol()
returns text
language sql
as $$
  select case
    when r < 0.30 then 'cherry'
    when r < 0.55 then 'lemon'
    when r < 0.75 then 'bell'
    when r < 0.90 then 'star'
    when r < 0.98 then 'grape'
    else 'seven'
  end
  from (select random() as r) s;
$$;

drop function if exists spin_slot(uuid);

create or replace function spin_slot(p_user_id uuid)
returns table(symbols text[], reward integer, was_free boolean, new_balance integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
  v_balance integer;
  v_last_free timestamptz;
  v_is_free boolean;
  v_symbols text[];
  v_reward integer;
  v_new_balance integer;
  r1 text;
  r2 text;
  r3 text;
begin
  select username, balance, last_free_spin_at into v_username, v_balance, v_last_free
  from users where id = p_user_id
  for update;

  if v_username is null then
    raise exception 'user_not_found';
  end if;

  v_is_free := v_last_free is null or v_last_free < date_trunc('day', now() at time zone 'utc');

  if not v_is_free and v_balance < 10 then
    raise exception 'insufficient_balance';
  end if;

  r1 := pick_slot_symbol();
  r2 := pick_slot_symbol();
  r3 := pick_slot_symbol();
  v_symbols := array[r1, r2, r3];

  if r1 = r2 and r2 = r3 then
    v_reward := case when r1 = 'seven' then 1000 else 100 end;
  elsif r1 = r2 or r2 = r3 or r1 = r3 then
    v_reward := 20;
  else
    v_reward := 0;
  end if;

  v_new_balance := v_balance + v_reward - (case when v_is_free then 0 else 10 end);

  update users
  set balance = v_new_balance,
      last_free_spin_at = case when v_is_free then now() else last_free_spin_at end
  where id = p_user_id;

  insert into spins (user_id, username, symbols, reward, was_free)
  values (p_user_id, v_username, v_symbols, v_reward, v_is_free);

  return query select v_symbols, v_reward, v_is_free, v_new_balance;
end;
$$;

revoke all on function spin_slot(uuid) from public;
grant execute on function spin_slot(uuid) to anon, authenticated;
