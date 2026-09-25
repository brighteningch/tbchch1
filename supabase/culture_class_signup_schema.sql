-- 문화강좌(부모 초청) 신청 접수 — Supabase 대시보드 SQL Editor에서 이 파일 전체를 그대로 실행하세요.
-- QR코드로 접속하는 비로그인 방문자도 이름만 남기고 신청할 수 있어야 하므로, 기존 게시판들과 달리
-- auth.uid() 없이(anon 역할) insert를 허용한다 — 이 사이트에서 처음 등장하는 "완전 공개 쓰기" 패턴.
-- 대신 조회(select)는 is_admin()만 가능해 신청자 명단이 외부에 노출되지 않는다.

create table if not exists culture_class_signups (
  id uuid primary key default gen_random_uuid(),
  program text not null default '2026년 부모 초청 문화강좌',
  name text not null check (char_length(trim(name)) between 1 and 30),
  created_at timestamptz not null default now()
);

alter table culture_class_signups enable row level security;

-- 쓰기: 누구나(비로그인 포함) 신청 가능
drop policy if exists "culture_class_signups anyone insert" on culture_class_signups;
create policy "culture_class_signups anyone insert" on culture_class_signups
  for insert to anon, authenticated with check (true);

-- 읽기: 관리자만 (신청자 명단은 개인정보이므로 공개 조회 불가)
drop policy if exists "culture_class_signups admin select" on culture_class_signups;
create policy "culture_class_signups admin select" on culture_class_signups
  for select using (is_admin());

-- 삭제: 관리자만 (중복·오입력 정리용)
drop policy if exists "culture_class_signups admin delete" on culture_class_signups;
create policy "culture_class_signups admin delete" on culture_class_signups
  for delete using (is_admin());
