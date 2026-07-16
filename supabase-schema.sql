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

-- ============================================================
-- 말씀과 찬양(설교/찬양 목록) — 누구나 읽기 가능, 관리자만 쓰기/수정/삭제 가능
-- ============================================================
create table if not exists sermons (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  date date not null,
  title text not null,
  scripture text,
  speaker text,
  video_url text,
  body text,
  created_at timestamptz default now()
);

alter table sermons enable row level security;

create policy "anyone can read sermons" on sermons
  for select using (true);

create policy "admins can insert sermons" on sermons
  for insert with check (is_admin());

create policy "admins can update sermons" on sermons
  for update using (is_admin());

create policy "admins can delete sermons" on sermons
  for delete using (is_admin());

-- ============================================================
-- 커뮤니티 게시판(가정 및 구역 예배 등) — 누구나 읽기, 로그인한 회원 누구나 글쓰기,
-- 삭제는 글쓴이 본인 또는 관리자만 가능
-- ============================================================
create table if not exists community_posts (
  id uuid primary key default gen_random_uuid(),
  board text not null default 'community-home',
  author_id uuid references auth.users on delete set null,
  author_name text not null,
  title text not null,
  body text not null,
  created_at timestamptz default now()
);

alter table community_posts enable row level security;

create policy "anyone can read community posts" on community_posts
  for select using (true);

create policy "members can insert own posts" on community_posts
  for insert with check (auth.uid() = author_id);

create policy "author or admin can delete posts" on community_posts
  for delete using (auth.uid() = author_id or is_admin());
