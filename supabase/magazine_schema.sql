-- '빛나는 매거진' 게시판 (활천 매거진 등 언론보도/교회소식/영화이야기/용어이야기 등
-- 관리자가 자유롭게 카테고리를 만들어가며 올리는 게시판). Supabase 대시보드 SQL Editor에서
-- 이 파일 전체를 그대로 실행하세요.
--
-- 카테고리는 고정 목록(enum)이 아니라 자유 텍스트다 — 관리자가 글을 쓸 때 새 카테고리
-- 이름을 그냥 입력하면 그게 새 카테고리가 된다(sermons.category와 동일한 방식, gallery_albums
-- 처럼 check 제약을 걸지 않는다).

create table if not exists magazine_posts (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  body text,
  file_url text not null,
  file_path text,
  file_type text not null check (file_type in ('pdf', 'image')),
  created_at timestamptz not null default now()
);

-- ★2026-08-11 reviewer(gemini) 지적으로 발견: file_path 컬럼이 처음에 빠져있어서
-- 글 삭제 시 Storage의 실제 파일이 절대 안 지워지는(고아 파일) 버그가 있었다.
-- 이미 배포된 테이블(위 create table if not exists는 이미 존재하면 무시됨)에도
-- 이 컬럼이 반영되도록 alter문을 추가한다 — 이 시점에 실업로드 0건이라
-- 데이터 손실 위험 없이 안전하게 실행 가능하다.
alter table magazine_posts add column if not exists file_path text;

alter table magazine_posts enable row level security;

-- 읽기는 누구나(홈페이지 방문자), 쓰기는 관리자만 (기존 is_admin() 함수 재사용 — supabase-schema.sql)
drop policy if exists "magazine_posts read all" on magazine_posts;
create policy "magazine_posts read all" on magazine_posts for select using (true);
drop policy if exists "magazine_posts admin insert" on magazine_posts;
create policy "magazine_posts admin insert" on magazine_posts for insert with check (is_admin());
drop policy if exists "magazine_posts admin update" on magazine_posts;
create policy "magazine_posts admin update" on magazine_posts for update using (is_admin());
drop policy if exists "magazine_posts admin delete" on magazine_posts;
create policy "magazine_posts admin delete" on magazine_posts for delete using (is_admin());

-- Storage 버킷 — 읽기 공개, 쓰기는 관리자만 (gallery-images와 동일한 패턴).
-- allowed_mime_types로 PDF/JPG 외 확장자는 Supabase Storage 서버 자체가 업로드를
-- 거부하게 만든다(클라이언트 accept 속성은 우회 가능한 UX 힌트일 뿐이라 이게 진짜 방어선).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('magazine-files', 'magazine-files', true, 20971520, array['application/pdf', 'image/jpeg'])
  on conflict (id) do update set
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "magazine-files public read" on storage.objects;
create policy "magazine-files public read" on storage.objects
  for select using (bucket_id = 'magazine-files');
drop policy if exists "magazine-files admin insert" on storage.objects;
create policy "magazine-files admin insert" on storage.objects
  for insert with check (bucket_id = 'magazine-files' and is_admin());
drop policy if exists "magazine-files admin update" on storage.objects;
create policy "magazine-files admin update" on storage.objects
  for update using (bucket_id = 'magazine-files' and is_admin());
drop policy if exists "magazine-files admin delete" on storage.objects;
create policy "magazine-files admin delete" on storage.objects
  for delete using (bucket_id = 'magazine-files' and is_admin());

-- ★2026-08-12: PDF 글의 썸네일(첫 페이지 고정 아이콘 대신 지정 페이지를 실제 이미지로).
-- thumb_page는 관리자가 글쓰기/수정 시 지정하는 "몇 페이지를 썸네일로 쓸지"(기본 1페이지).
-- thumbnail_url/thumbnail_path는 관리자 브라우저에서 pdf.js로 렌더링한 결과를 기존
-- magazine-files 버킷에 올린 것 — 신규 버킷·신규 Storage 정책 불필요(기존 admin
-- insert/update 정책이 이미 이 버킷 전체를 커버). 이미지 타입 글은 이 두 컬럼을 쓰지 않는다
-- (file_url을 그대로 썸네일로 사용).
alter table magazine_posts add column if not exists thumb_page integer not null default 1 check (thumb_page >= 1);
alter table magazine_posts add column if not exists thumbnail_url text;
alter table magazine_posts add column if not exists thumbnail_path text;

-- 관리자가 UI에서 직접 값을 바꾸는 전역 설정(예: 홈페이지 교회뉴스 featured 카드 자동전환
-- 간격 초)을 위한 최소 key-value 테이블. content/site.json은 정적 파일이라 비개발자인
-- 오너가 직접 편집하기 어려워 이 용도로는 부적합하다고 판단해 신설한다.
create table if not exists app_settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
drop policy if exists "app_settings read all" on app_settings;
create policy "app_settings read all" on app_settings for select using (true);
drop policy if exists "app_settings admin write" on app_settings;
create policy "app_settings admin write" on app_settings for insert with check (is_admin());
drop policy if exists "app_settings admin update" on app_settings;
create policy "app_settings admin update" on app_settings for update using (is_admin());
