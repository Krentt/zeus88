create extension if not exists pgcrypto with schema extensions;

-- ============ USERS + AUTH ============

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  balance integer not null default 0,
  created_at timestamptz not null default now()
);

alter table users enable row level security;
-- no policies: table only reachable through the security definer functions below

create or replace function register_user(p_username text, p_password text)
returns table(id uuid, username text, balance integer)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if length(p_username) < 3 or length(p_password) < 6 then
    raise exception 'invalid_input';
  end if;
  if exists (select 1 from users u where u.username = p_username) then
    raise exception 'username_taken';
  end if;
  return query
  insert into users (username, password_hash, balance)
  values (p_username, crypt(p_password, gen_salt('bf')), 1000)
  returning users.id, users.username, users.balance;
end;
$$;

create or replace function login_user(p_username text, p_password text)
returns table(id uuid, username text, balance integer)
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  return query
  select u.id, u.username, u.balance
  from users u
  where u.username = p_username
    and u.password_hash = crypt(p_password, u.password_hash);
end;
$$;

revoke all on function register_user(text, text) from public;
revoke all on function login_user(text, text) from public;
grant execute on function register_user(text, text) to anon, authenticated;
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
-- e.g. insert into candidates (name) values ('Ahmad Saputra');

create table if not exists candidates (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

alter table candidates enable row level security;

drop policy if exists "candidates are publicly readable" on candidates;
create policy "candidates are publicly readable"
  on candidates for select
  using (true);
-- no insert/update/delete policy for anon/authenticated — add rows from the
-- Supabase dashboard, which bypasses RLS.

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
