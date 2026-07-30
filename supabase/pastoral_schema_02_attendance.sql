-- 증분 마이그레이션: 출석 체크 테이블 (pastoral_schema.sql을 이미 실행하셨다면 이 파일만 추가로 실행)
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
