-- 재적관리(성도 정보) 스키마 — 담임목사·부목사 전용
-- Supabase 대시보드 SQL Editor에서 이 파일 전체를 그대로 실행하세요.
-- (이 프로젝트는 Supabase CLI 마이그레이션을 쓰지 않고 대시보드에서 직접 SQL을 실행하는 구조입니다.)

-- 0) profiles에 재적관리 전용 접근 플래그 추가 (기존 is_admin과 별개 — 목회자 두 분만)
alter table profiles add column if not exists is_pastoral_admin boolean not null default false;

-- 1) 가정교회(소그룹)
create table if not exists cell_groups (
  id uuid primary key default gen_random_uuid(),
  group_no int unique,
  name text not null,
  leader text,
  co_leader text,
  created_at timestamptz not null default now()
);

-- 2) 성도
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  position text,
  gender text check (gender in ('M', 'F') or gender is null),
  birth_year int,
  birth_month int check (birth_month between 1 and 12 or birth_month is null),
  birth_day int check (birth_day between 1 and 31 or birth_day is null),
  is_lunar boolean not null default false,
  phone text,
  address text,
  cell_group_id uuid references cell_groups(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3) 가족관계 (자동 추정하지 않고 목회자가 직접 입력/확인)
create table if not exists family_relations (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  related_member_id uuid not null references members(id) on delete cascade,
  relation_type text not null, -- 배우자/부모/자녀/형제자매/며느리/사위 등 자유 텍스트
  note text,
  created_at timestamptz not null default now(),
  check (member_id <> related_member_id)
);

-- 4) 기도제목 (이력으로 쌓이고 상태를 체크할 수 있게)
create table if not exists prayer_requests (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  content text not null,
  status text not null default 'praying' check (status in ('praying', 'answered')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

-- updated_at 자동 갱신
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_members_updated_at on members;
create trigger trg_members_updated_at
  before update on members
  for each row execute function set_updated_at();

-- ── RLS: 담임목사·부목사 두 분만 접근 (화면단 가드는 보조 수단일 뿐이므로 반드시 DB에서 강제) ──
alter table cell_groups enable row level security;
alter table members enable row level security;
alter table family_relations enable row level security;
alter table prayer_requests enable row level security;

-- security definer로 정의해 profiles RLS와 순환 참조 없이 안전하게 플래그를 읽는다
create or replace function is_pastoral_admin_user()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce((select is_pastoral_admin from profiles where id = auth.uid()), false);
$$;

drop policy if exists "pastoral admin full access" on cell_groups;
create policy "pastoral admin full access" on cell_groups
  for all using (is_pastoral_admin_user()) with check (is_pastoral_admin_user());
drop policy if exists "pastoral admin full access" on members;
create policy "pastoral admin full access" on members
  for all using (is_pastoral_admin_user()) with check (is_pastoral_admin_user());
drop policy if exists "pastoral admin full access" on family_relations;
create policy "pastoral admin full access" on family_relations
  for all using (is_pastoral_admin_user()) with check (is_pastoral_admin_user());
drop policy if exists "pastoral admin full access" on prayer_requests;
create policy "pastoral admin full access" on prayer_requests
  for all using (is_pastoral_admin_user()) with check (is_pastoral_admin_user());

-- 5) 출석 체크 (한 성도·한 날짜에 한 행 — 체크박스 토글은 upsert로 처리)
create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id) on delete cascade,
  service_date date not null,
  present boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  unique (member_id, service_date)
);

alter table attendance enable row level security;
drop policy if exists "pastoral admin full access" on attendance;
create policy "pastoral admin full access" on attendance
  for all using (is_pastoral_admin_user()) with check (is_pastoral_admin_user());

-- ── 권한 부여: 담임목사(김제희)·부목사(박지환) ──
-- 주의: 두 분이 이미 홈페이지에 회원가입(로그인 계정 생성) 되어 있어야 아래 UPDATE가 반영됩니다.
-- 아직 가입 전이면 먼저 /pages/signup.html 로 가입한 뒤 이 UPDATE만 다시 실행하세요.
update profiles set is_pastoral_admin = true where username in ('김제희', '박지환');
