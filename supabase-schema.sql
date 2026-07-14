-- 빛나는교회 회원가입/로그인 시스템 — Supabase SQL Editor에 붙여넣고 실행하세요.

create table if not exists profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique not null,
  name text not null,
  phone text,
  position text,
  is_admin boolean default false,
  created_at timestamptz default now()
);

alter table profiles enable row level security;

-- 관리자 여부를 안전하게 확인하는 함수 (RLS 재귀 방지용)
create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false);
$$;

-- 회원가입 직후 본인 프로필 생성 허용
create policy "insert own profile" on profiles
  for insert with check (auth.uid() = id);

-- 본인 프로필 조회 허용
create policy "select own profile" on profiles
  for select using (auth.uid() = id);

-- 관리자는 전체 회원 조회 가능
create policy "admins select all" on profiles
  for select using (is_admin());

-- 관리자는 전체 회원 수정 가능 (직분 수정 등)
create policy "admins update all" on profiles
  for update using (is_admin());

-- 관리자는 회원 삭제 가능
create policy "admins delete all" on profiles
  for delete using (is_admin());

-- 아이디 중복 확인용 (로그인 전 익명 사용자도 호출 가능, 존재 여부만 반환)
create or replace function username_available(check_username text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select not exists(select 1 from profiles where username = check_username);
$$;
grant execute on function username_available to anon;

-- ⚠ 담임목사(김제희)·부목사(박지환) 두 분이 회원가입을 마친 뒤,
-- 아래처럼 두 분의 username을 넣어 관리자 권한을 직접 부여해주세요.
-- update profiles set is_admin = true where username = '여기에_실제_가입한_아이디';
