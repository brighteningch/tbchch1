-- 지역자료실(성도 사업처 · 계룡시 지역 사업처) — 기존 community_posts 게시판 인프라를
-- 그대로 재사용하고 이미지 첨부 기능만 추가한다. board 컬럼에 새 값
-- 'community-member-business' / 'community-gyeryong-business'를 쓸 뿐 테이블
-- 구조·RLS는 기존 그대로(로그인 회원 누구나 글쓰기, 작성자 본인 또는 관리자만 삭제,
-- supabase-schema.sql 93~112번줄 참고 — 여기서 다시 만들지 않음).
-- Supabase 대시보드 SQL Editor에서 이 파일 전체를 그대로 실행하세요.

alter table community_posts add column if not exists image_url text;
alter table community_posts add column if not exists image_path text;

-- ★2026-08-12 실측 중 발견한 스키마 드리프트 대응: supabase-schema.sql 파일에는
-- community_posts의 select 정책이 `for select using (true)`(anon 포함 전체공개)로
-- 적혀 있지만, 실제 라이브 DB를 REST API로 직접 실측한 결과 지금은 `to authenticated`로
-- 제한돼 있고(비로그인은 원본 테이블을 못 읽음), 대신 body 없는 community_posts_list
-- 뷰만 anon에게 공개돼 있었다(파일에 없는, 대시보드에서 나중에 추가된 정책으로 추정).
-- 이 티켓의 새 게시판 2개는 "비로그인도 목록(이미지·본문 포함) 조회 가능"이 성공기준이라
-- community_posts_list(본문·이미지 없음)로는 부족하다. 기존 board(가정교회 "이야기
-- 나누기" 등)의 비로그인 body 비공개 설계는 건드리지 않고, 이 두 board 값에 한해서만
-- anon 조회를 허용하는 정책을 별도로 추가한다(기존 정책과 OR로 합쳐지므로 다른
-- board에는 영향 없음).
drop policy if exists "community_posts anon read local business boards" on community_posts;
create policy "community_posts anon read local business boards" on community_posts
  for select to anon
  using (board in ('community-member-business', 'community-gyeryong-business'));

-- Storage 버킷: 공개읽기, 로그인 회원 누구나 업로드, 삭제는 본인 파일 또는 관리자만.
--
-- ★소유권 판정 방식(2026-08-12 설계 변경, 근거 있음): storage.foldername(name)로
-- 경로 문자열을 파싱하는 대신 storage.objects의 owner_id 컬럼을 쓴다. owner_id는
-- 업로드 시점에 Supabase가 실제 인증된 사용자의 JWT sub 클레임으로 서버측에서 자동
-- 기록하는 값이라(공식문서: supabase.com/docs/guides/storage/security/ownership),
-- 클라이언트가 만드는 파일 경로 문자열에 소유권 판정을 의존하지 않아 더 견고하다
-- (경로 네이밍 실수로 방어선이 무력화될 여지가 없음 — magazine_posts의 file_path
-- 누락 버그와 같은 종류의 실수를 구조적으로 차단). owner_id는 text 타입이라
-- auth.uid()를 ::text로 캐스팅해야 비교된다(GitHub supabase/supabase#29836에
-- 명시된 알려진 타입 특성, 공식문서 예시에도 이 캐스팅이 그대로 쓰임).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('community-post-images', 'community-post-images', true, 10485760,
    array['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
  on conflict (id) do update set
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "community-post-images public read" on storage.objects;
create policy "community-post-images public read" on storage.objects
  for select using (bucket_id = 'community-post-images');

drop policy if exists "community-post-images authenticated insert" on storage.objects;
create policy "community-post-images authenticated insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'community-post-images');

drop policy if exists "community-post-images owner or admin delete" on storage.objects;
create policy "community-post-images owner or admin delete" on storage.objects
  for delete using (
    bucket_id = 'community-post-images'
    and (owner_id = (select auth.uid()::text) or is_admin())
  );
