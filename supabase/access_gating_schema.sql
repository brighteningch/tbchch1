-- 로그인 게이팅(메뉴 4개 그룹: 공동체&양육 일부/다음세대/교회소식/지역자료실) +
-- 갤러리 업로드 권한 회원개방. Supabase 대시보드 SQL Editor에서 이 파일 전체를 그대로
-- 실행하세요(전부 idempotent — drop policy if exists + create policy / add column if not exists).
--
-- 오너 확정 사항(대화로 직접 확인, 2026-08-13):
--   1) 메뉴 6개 그룹 중 '환영합니다'·'설교와 찬양'은 계속 비로그인 전체공개. 나머지 4개
--      그룹(공동체&양육/다음세대/교회소식/지역자료실)은 로그인 성도만 — 단 '공동체&양육' 안의
--      '묵상과 삶'·'성경공부'(외부 티스토리 블로그, Supabase 테이블 자체가 없음)는 예외로 계속 공개.
--   2) 갤러리(news-gallery.html) 업로드를 관리자전용→로그인 회원 누구나로 개방. 가정교회·
--      중보기도요청·지역자료실 게시판은 이미 회원누구나 쓰기 가능(변경 불필요, 아래서 재확인만).
--   3) 지역자료실의 어젯밤 anon 읽기 예외(community_post_images_schema.sql)를 다시 로그인전용으로 되돌림.
--
-- ★weekly_content 테이블은 이 파일 이전에 스키마 파일 자체가 존재하지 않았다(대시보드에서 직접
-- 생성된 드리프트 테이블 — supabase/ 디렉터리 전체를 검색해도 CREATE TABLE 소스가 없음, live
-- RLS를 supabase db query --linked로 직접 조회해 정책명을 확보했다). 이 파일이 그 드리프트를
-- 처음으로 파일화한다(테이블 자체는 이미 있으므로 CREATE TABLE은 하지 않고 정책만 다룬다).

-- ============================================================
-- 1) weekly_content — 카테고리별 분리 게이팅
-- ============================================================
-- ★주의(실측 후 결정, 마스터 티켓 요약과 다름 — 직접 재확인 지시에 따라 정정): 이 테이블은
-- 양육과훈련자료(교재)/공지/주보 외에도 홈페이지 "말씀 팝업"(daily/dawn-prayer/family-worship/
-- infographic, script.js CONTENT_CATEGORY_LABELS)과 홈페이지 팝업(shorts, admin-popups.html)이
-- 공유해서 쓴다. family-worship은 게이팅 대상 community-home.html 페이지에도 쓰이지만 동시에
-- 공개 홈페이지 팝업과 데이터를 공유하므로, 이 카테고리를 잠그면 홈페이지 공개 팝업이 깨진다
-- (회귀). 티켓 성공기준 3)이 "weekly_content(공지/주보/교재 카테고리)"라고 명시한 것과도 일치 —
-- 게이팅 대상은 정확히 notice(공지사항)/bulletin(주보)/editorial(양육과 훈련자료) 3개뿐이다.
drop policy if exists "public read" on weekly_content;

drop policy if exists "weekly_content public read non-gated categories" on weekly_content;
create policy "weekly_content public read non-gated categories" on weekly_content
  for select using (category not in ('editorial', 'notice', 'bulletin'));

drop policy if exists "weekly_content authenticated read gated categories" on weekly_content;
create policy "weekly_content authenticated read gated categories" on weekly_content
  for select to authenticated
  using (category in ('editorial', 'notice', 'bulletin'));

-- ============================================================
-- 2) magazine_posts — board 무관 전체 로그인전용 읽기(교회소식/매거진 + 다음세대/교회학교·청청 포함)
-- ============================================================
drop policy if exists "magazine_posts read all" on magazine_posts;
drop policy if exists "magazine_posts authenticated read" on magazine_posts;
create policy "magazine_posts authenticated read" on magazine_posts
  for select to authenticated using (true);

-- ============================================================
-- 3) gallery_albums / gallery_photos — 읽기 로그인전용, 쓰기 회원개방(본인 소유 기반)
-- ============================================================
-- 지금까지 쓰기가 관리자 전용이라 소유자 컬럼이 필요 없었다. 회원 전체에게 업로드를 열면서
-- "삭제는 본인 글 또는 관리자만"(성공기준5) 요구사항을 지키려면 소유자 추적이 필요하다.
alter table gallery_albums add column if not exists author_id uuid references auth.users on delete set null;

-- ★reviewer-codex 검토 REVISE 반영(2026-08-13, 처리필요1): 클라이언트가 insert payload에
-- author_id를 직접 담아 보내는 방식은 RLS(with check auth.uid()=author_id)가 위조는 이미
-- 막고 있어 뚫리지는 않지만, 클라이언트가 굳이 값을 알아서 보낼 필요가 없게 DB default로
-- auth.uid()를 자동 채우는 편이 더 견고하다는 지적 — 컬럼 default를 설정해 클라이언트가
-- author_id를 아예 안 보내도(admin-gallery.html에서 제거) 서버측에서 INSERT 시점에
-- 자동으로 채워지게 한다(default 적용은 RLS 평가보다 먼저 일어나므로 with check도 그대로 통과).
alter table gallery_albums alter column author_id set default auth.uid();

drop policy if exists "gallery_albums read all" on gallery_albums;
drop policy if exists "gallery_albums authenticated read" on gallery_albums;
create policy "gallery_albums authenticated read" on gallery_albums
  for select to authenticated using (true);

-- ★reviewer-codex 검토 REVISE 반영(2026-08-13, 참고사항·optional): storage.objects 삭제
-- 정책이 이미 auth.uid()를 (select auth.uid())로 감싸 PostgREST/Postgres RLS 플래너가
-- 행마다 재평가하지 않고 initPlan으로 한 번만 평가하도록 캐싱하는 Supabase 권장 성능패턴을
-- 쓰고 있었는데 gallery_albums/gallery_photos의 신규 정책들은 그렇게 돼있지 않아 일관성이
-- 없었다는 지적 — 아래 신규 정책 전부 동일 패턴으로 통일한다(기능 변경 없음, 순수 성능/일관성).
drop policy if exists "gallery_albums admin insert" on gallery_albums;
drop policy if exists "gallery_albums member insert" on gallery_albums;
create policy "gallery_albums member insert" on gallery_albums
  for insert to authenticated with check ((select auth.uid()) = author_id);

-- ★admin-gallery.html의 업로드 흐름은 첫 번째 사진을 올린 뒤 그 앨범의 cover_image_url을
-- update로 갱신한다 — UPDATE 정책이 admin전용으로 남아있으면 일반회원의 앨범 등록이 이 단계에서
-- 조용히 실패한다. author-or-admin으로 함께 연다.
drop policy if exists "gallery_albums admin update" on gallery_albums;
drop policy if exists "gallery_albums owner or admin update" on gallery_albums;
create policy "gallery_albums owner or admin update" on gallery_albums
  for update using ((select auth.uid()) = author_id or is_admin());

drop policy if exists "gallery_albums admin delete" on gallery_albums;
drop policy if exists "gallery_albums owner or admin delete" on gallery_albums;
create policy "gallery_albums owner or admin delete" on gallery_albums
  for delete using ((select auth.uid()) = author_id or is_admin());

drop policy if exists "gallery_photos read all" on gallery_photos;
drop policy if exists "gallery_photos authenticated read" on gallery_photos;
create policy "gallery_photos authenticated read" on gallery_photos
  for select to authenticated using (true);

-- gallery_photos 자체에는 소유자 컬럼을 새로 만들지 않고, 부모 앨범(gallery_albums.author_id)의
-- 소유자와 일치하는지 조인으로 확인한다(사진은 항상 특정 앨범에 속해서 생성되므로 앨범 소유자가
-- 곧 사진의 실질적 소유자 — community-post-images처럼 별도 owner 컬럼을 photos에 중복시킬 필요 없음).
drop policy if exists "gallery_photos admin insert" on gallery_photos;
drop policy if exists "gallery_photos album owner insert" on gallery_photos;
create policy "gallery_photos album owner insert" on gallery_photos
  for insert to authenticated with check (
    exists (
      select 1 from gallery_albums a
      where a.id = gallery_photos.album_id and (a.author_id = (select auth.uid()) or is_admin())
    )
  );

-- gallery_albums 삭제 시 ON DELETE CASCADE로 gallery_photos 행도 같이 지워지는데, 이 cascade가
-- RLS를 우회하는지 불확실하다(문서상 회색지대) — 안전하게 명시적 DELETE 정책도 같은 기준으로 열어
-- 둔다(우회하더라도 무해, 우회 안 하면 이 정책이 없으면 일반회원의 앨범삭제가 조용히 실패한다).
drop policy if exists "gallery_photos admin delete" on gallery_photos;
drop policy if exists "gallery_photos album owner delete" on gallery_photos;
create policy "gallery_photos album owner delete" on gallery_photos
  for delete using (
    exists (
      select 1 from gallery_albums a
      where a.id = gallery_photos.album_id and (a.author_id = (select auth.uid()) or is_admin())
    )
  );

-- Storage 버킷(gallery-images): 업로드는 로그인 회원 누구나, 삭제는 본인 파일 또는 관리자만
-- (community-post-images 버킷의 owner_id 기반 패턴을 그대로 이식 — owner_id는 업로드 시점에
-- Supabase가 실제 인증된 사용자의 JWT sub로 서버측에서 자동 기록하는 값이라 클라이언트가 만드는
-- 경로 문자열에 소유권 판정을 의존하지 않는다. text 타입이라 auth.uid()를 ::text로 캐스팅).
drop policy if exists "gallery-images admin insert" on storage.objects;
drop policy if exists "gallery-images authenticated insert" on storage.objects;
create policy "gallery-images authenticated insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'gallery-images');

drop policy if exists "gallery-images admin delete" on storage.objects;
drop policy if exists "gallery-images owner or admin delete" on storage.objects;
create policy "gallery-images owner or admin delete" on storage.objects
  for delete using (
    bucket_id = 'gallery-images'
    and (owner_id = (select auth.uid()::text) or is_admin())
  );
-- ★reviewer-codex 2차 검토 REVISE 반영(2026-08-13, 재오픈): 위 "테이블(gallery_albums/
-- gallery_photos) RLS로 이미 실질 게이팅된다"는 판단은 틀렸다 — 테이블 행은 로그인해야
-- 조회되지만, 실제 사진 '파일'을 담은 이 버킷 자체가 public=true라서 anon이 image_url을
-- 직접 알면(캐시된 링크·공유 등으로) 테이블 RLS를 완전히 우회해 로그인 없이도 파일을 그냥
-- 받을 수 있었다. bucket.public을 false로 바꾼다 — RLS 정책만으로는 익명이 쓰는
-- /object/public/ 엔드포인트 자체를 못 막는다(그 엔드포인트는 bucket.public 플래그로만
-- 게이트된다). 버킷이 비공개가 되면 지금까지 DB에 저장해온 공개 URL 문자열(getPublicUrl
-- 결과)은 로그인 여부와 무관하게 전부 못 쓰게 되므로(★<img src>는 인증 헤더를 못 붙인다 —
-- 브라우저가 img 태그 요청에 Authorization을 자동으로 실어주지 않는다), 클라이언트 코드도
-- 렌더 시점마다 로그인 세션으로 createSignedUrl을 새로 발급하는 방식으로 함께 바꿨다
-- (gallery-data.js/script.js/news-gallery.html/admin-gallery.html — 서명URL은 토큰이
-- URL 쿼리에 실려있어 <img src>가 별도 인증 헤더 없이도 그대로 동작한다).
update storage.buckets set public = false where id = 'gallery-images';

drop policy if exists "gallery-images public read" on storage.objects;
drop policy if exists "gallery-images authenticated read" on storage.objects;
create policy "gallery-images authenticated read" on storage.objects
  for select to authenticated using (bucket_id = 'gallery-images');
-- gallery-images의 "admin update" 정책은 여전히 이 티켓 범위 밖(현재 어떤 화면도 쓰지 않는
-- 미사용 기능) — 손대지 않는다.

-- ============================================================
-- 4) community_posts — 지역자료실 anon 읽기 예외 롤백 + community_posts_list 뷰 취약점 수정
-- ============================================================
-- 어젯밤(community_post_images_schema.sql) 지역자료실 2개 board만 anon 읽기를 허용했던 결정을
-- 오너가 오늘 직접 뒤집었다 — 그 예외 정책을 제거해 다시 로그인전용으로 되돌린다.
drop policy if exists "community_posts anon read local business boards" on community_posts;

-- ★이 티켓 조사 중 별도로 발견한 취약점(negative-case 실측으로 확인·즉시 원복 완료 — 상세는
-- WORKER_TODO.md 참고): community_posts_list 뷰가 security_invoker 옵션 없이(PostgreSQL 기본값
-- false) 생성되어 있어서, 뷰가 소유자 권한으로 실행되며 community_posts 테이블의 "로그인한
-- 회원만 조회 가능" RLS를 완전히 우회했다 — anon이 이 뷰를 통해 전체 board의
-- title/author_name/created_at을 읽을 수 있었다(본문 body는 애초에 뷰에 없어 무사했지만, 어떤
-- board가 존재하는지·누가 어떤 제목으로 글을 썼는지가 로그인 없이 노출되는 구조적 결함이었다).
-- security_invoker=true로 바꾸면 뷰가 "쿼리를 실행하는 사용자"의 RLS를 그대로 물려받는다 —
-- 이렇게 하면 이 티켓이 원래 요구한 "목록(community_posts_list)도 로그인전용으로 통일"이 별도
-- 정책 없이 자동으로 달성된다(PostgreSQL 15+ 기능, 이 프로젝트는 PG17.6 확인).
alter view community_posts_list set (security_invoker = true);
