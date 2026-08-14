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

-- ★2026-08-14 직접 발견·수정: 이 SELECT 정책은 원래 "읽기는 누구나"였으나, 같은 날 밤
-- access_gating_schema.sql이 매거진 게시판을 로그인 전용 읽기로 전환하면서 이 정책을
-- drop하고 "magazine_posts authenticated read"(roles=authenticated)로 교체했다. 그런데
-- 이 파일 자체는 그 사실을 반영하지 않은 채로 남아있었고, 이 파일 상단 안내대로 "파일
-- 전체를 그대로 실행"하면(교회학교/청청 개방 작업 중 실제로 재실행됨) 아래 두 줄이 다시
-- 실행되어 로그인 게이팅을 무력화하는 낡은 공개읽기 정책을 되살려버렸다(실측: anon 키로
-- REST 직접 조회 성공 확인 후 즉시 차단·재확인 완료). PostgreSQL의 permissive 정책은
-- OR로 합쳐지므로 이 정책 하나만 살아있어도 다른 로그인전용 정책과 무관하게 뚫린다.
-- 재발 방지를 위해 이 파일 자체를 최신 정책(authenticated read)으로 맞춘다 — 이제 이
-- 파일을 몇 번을 재실행해도 access_gating_schema.sql이 만든 최신 상태와 항상 일치한다.
drop policy if exists "magazine_posts read all" on magazine_posts;
drop policy if exists "magazine_posts authenticated read" on magazine_posts;
create policy "magazine_posts authenticated read" on magazine_posts
  for select to authenticated using (true);
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
-- ★보안 경계(reviewer-codex 검토 지적, 2026-08-12): select는 비로그인 방문자에게도
-- 공개된 테이블이다(홈페이지가 로그인 없이 featured 간격값을 읽어야 하므로). API 키,
-- 서비스 시크릿, 그 외 비공개로 유지해야 하는 값은 이 테이블에 절대 넣지 말 것.
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

-- ★2026-08-13: 오너 요청 — 교회학교(어린이)/청청(청소년&청년) 페이지에도 '빛나는 매거진'과
-- 같은 방식(관리자 전용 글쓰기, 카테고리 섹션+라이트박스)의 게시판을 추가한다. 새 테이블을
-- 만드는 대신 magazine_posts를 board 컬럼으로 나눠 재사용한다 — community_posts가 이미
-- 검증한 것과 같은 패턴(supabase-schema.sql의 `board text not null default 'community-home'`)
-- 이다. 기본값 'magazine'이라 기존 행 전부 자동 소급되어 '빛나는 매거진' 기존 동작에는
-- 영향이 없다. board는 카테고리와 마찬가지로 자유 텍스트(enum 제약 없음) — 새 게시판이
-- 더 늘어나도 스키마 변경 없이 board 값만 늘리면 된다. RLS는 이미 board와 무관하게
-- 전체공개읽기/admin전용쓰기라 신규 정책이 필요 없다(community_posts와 달리 board별
-- read 예외가 아예 없는 더 단순한 케이스).
alter table magazine_posts add column if not exists board text not null default 'magazine';

-- 교회학교/청청 게시판은 파일 첨부가 선택사항이어야 한다(오너 확정 — 제목+본문만으로도
-- 글쓰기 가능). 반면 '빛나는 매거진'은 계속 파일이 필수여야 한다(기존 동작 유지). 클라이언트
-- 폼 검증만으로는 우회 가능한 UX 힌트일 뿐이므로(이 프로젝트의 기존 원칙 — 위
-- allowed_mime_types 주석 참고), DB 체크 제약으로 진짜 방어선을 만든다: board가
-- 'magazine'이면 반드시 file_url이 있어야 한다.
-- ★2026-08-13 reviewer(codex) 1차 지적으로 발견: 최초 버전은 `file_url is not null`만
-- 검사해서, file_url이 빈 문자열('')이거나 file_type이 NULL이어도 통과하는 구멍이
-- 있었다(SQL CHECK는 NULL 비교가 섞여 UNKNOWN이 되면 실패로 안 치고 통과시켜버리는
-- 함정). ★2026-08-13 reviewer(codex) 2차 지적: 1차 수정 후에도 board가 magazine이
-- 아닌 글(교회학교/청청)은 이 제약을 아예 안 타서, file_url은 있는데 file_type은
-- NULL인 앞뒤가 안 맞는 행이 여전히 통과할 수 있었다. board와 무관하게 항상 성립해야
-- 하는 "file_url·file_type은 항상 같이 있거나 같이 없어야 한다"는 제약을 별도로 분리해
-- 전체 행에 적용하고, "magazine이면 파일이 아예 없으면 안 된다"는 board 전용 제약은
-- 따로 둔다 — 두 제약을 합치면 magazine 글은 파일 필수+file_url/file_type 정합성이
-- 둘 다 보장되고, 다른 게시판 글은 파일이 아예 없거나(둘 다 NULL) 완전히 정상인
-- 파일(둘 다 채워짐)만 허용되어 어중간한 상태가 나올 수 없다.
alter table magazine_posts alter column file_url drop not null;
alter table magazine_posts alter column file_type drop not null;

alter table magazine_posts drop constraint if exists magazine_posts_file_url_type_consistency;
alter table magazine_posts add constraint magazine_posts_file_url_type_consistency
  check (
    (file_url is null and file_type is null)
    or (
      file_url is not null and length(trim(file_url)) > 0
      and file_type is not null and file_type in ('pdf', 'image', 'epub')
    )
  );

alter table magazine_posts drop constraint if exists magazine_posts_magazine_requires_file;
alter table magazine_posts add constraint magazine_posts_magazine_requires_file
  check (board <> 'magazine' or file_url is not null);

-- ★2026-08-13: 오너 요청 — PDF/JPG만 되던 업로드에 EPUB도 추가한다(브라우저 안에서 실제
-- 책장 넘기듯 읽는 인앱 리더 제공, admin-magazine.html+news-magazine.html 참고). EPUB의
-- 공식 mime type은 application/epub+zip이다(IANA 공식 등록 확인:
-- https://www.iana.org/assignments/media-types/application/epub+zip, W3C EPUB 3
-- 스펙 참조 — 추측 아닌 실측 확인).
--
-- file_type check 제약은 원래 create table 안에 이름 없이 선언돼 있어서(PostgreSQL이
-- <테이블>_<컬럼>_check로 자동 명명, 이미 배포된 테이블이라 실제 이름을 직접 조회할
-- 수단이 없다), 이름을 추측해서 drop하는 대신 DO 블록으로 file_type 관련 check 제약을
-- 전부 찾아 실제로 지운다 — 이름 추측이 틀리면 옛 제약이 조용히 안 지워진 채 남아서
-- epub 업로드가 계속 막히는데 원인을 찾기 어려워지는 실패 모드를 원천 차단한다.
-- ★주의(직접 발견·수정, 위 magazine_posts_file_url_type_consistency 분리 후 재확인):
-- 이 패턴이 'file_type'을 포함하는 제약을 전부 잡다 보니, 위에서 만든
-- magazine_posts_file_url_type_consistency(file_type+file_url 둘 다 언급, board는
-- 언급 안 함)와 magazine_posts_magazine_requires_file(board만 언급, file_type은
-- 이제 언급 안 함)이 잘못 걸릴 위험이 있다 — 'board' 또는 'file_url'을 언급하는
-- 제약은 전부 제외해서, 순수 file_type 단독 체크(원래 이름없는 제약과
-- magazine_posts_file_type_check)만 지우도록 좁힌다.
do $$
declare
  con record;
begin
  for con in
    select conname from pg_constraint
    where conrelid = 'magazine_posts'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%file_type%'
      and pg_get_constraintdef(oid) not ilike '%board%'
      and pg_get_constraintdef(oid) not ilike '%file_url%'
  loop
    execute format('alter table magazine_posts drop constraint %I', con.conname);
  end loop;
end $$;
alter table magazine_posts add constraint magazine_posts_file_type_check
  check (file_type in ('pdf', 'image', 'epub'));

-- Storage 버킷도 epub을 허용 목록에 추가한다. 파일 크기 제한은 PDF 기준 20MB였는데,
-- EPUB은 삽화가 많은 교회학교용 자료의 경우 훨씬 커질 수 있다 — 업계 사례 조사
-- (Amazon KDP 650MB, Apple Books 2GB, IngramSpark 100MB, 삽화 많은 책 전용
-- NetGalley Shelf 250MB)를 근거로 50MB로 상향한다. ★주의: Supabase Storage의
-- file_size_limit은 버킷 전체에 걸리는 단일 값이라(mime 타입별 개별 제한이 아니다)
-- PDF·JPG 업로드에도 동일하게 50MB 한도가 적용된다(부작용이 아니라 의도된 상향 —
-- 스캔된 PDF 매거진도 20MB를 넘길 수 있어 오히려 여유가 생기는 쪽).
-- ★2026-08-13: PNG 추가(오너 요청) — 지금까지 image/jpeg만 허용해 PNG 업로드가
-- Storage 서버 단에서 거부되고 있었다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('magazine-files', 'magazine-files', true, 52428800, array['application/pdf', 'image/jpeg', 'image/png', 'application/epub+zip'])
  on conflict (id) do update set
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ★2026-08-14: 오너 요청 — 교회학교/청청 게시판은 관리자 전용 글쓰기에서 "로그인한 회원
-- 누구나 글쓰기, 수정·삭제는 본인 글이거나 관리자만"으로 개방한다(community_posts와 동일한
-- 권한 모델, 106~125줄 참고). '빛나는 매거진'(board='magazine')은 이번 변경 대상이 아니라
-- 계속 관리자 전용으로 남아야 하므로, 3개 board가 테이블 하나를 공유하는 이 스키마 구조상
-- INSERT/UPDATE/DELETE 정책을 board 값으로 분기해야 한다(작년 밤 "파일 필수 여부"를
-- board별로 나눴던 것과 동일한 패턴 — magazine_posts_magazine_requires_file 제약 참고).
--
-- author_id/author_name은 nullable이다 — 기존에 관리자가 admin-magazine.html로 쓴 글
-- (매거진뿐 아니라 이미 있던 교회학교/청청 글도 포함)은 소급으로 author_id를 채울 수
-- 없어 NULL로 남는다. 아래 UPDATE/DELETE 정책에서 `author_id = auth.uid()`는 NULL과는
-- 항상 비교결과가 UNKNOWN(=false 취급)이 되므로, author_id가 NULL인 글은 자동으로
-- "관리자만 수정 가능"이 된다 — 오너가 이미 확정한 자연스러운 결과이며 별도 처리 불필요.
alter table magazine_posts add column if not exists author_id uuid references auth.users(id) on delete set null;
alter table magazine_posts add column if not exists author_name text;

drop policy if exists "magazine_posts admin insert" on magazine_posts;
drop policy if exists "magazine_posts insert" on magazine_posts;
create policy "magazine_posts insert" on magazine_posts
  for insert with check (
    (board = 'magazine' and is_admin())
    or (board in ('next-children', 'next-youth') and (author_id = auth.uid() or is_admin()))
  );

-- USING과 WITH CHECK을 동일하게 명시한다(PostgreSQL은 WITH CHECK 생략 시 USING을 그대로
-- 재사용하지만, board 분기 로직처럼 리뷰 대상 보안 규칙은 암묵적 기본동작에 기대지 않고
-- 명시적으로 적어 둔다). 이 덕분에 next-children/next-youth의 본인 글을 board='magazine'으로
-- 바꿔치기해 관리자 전용 게시판으로 "세탁"하는 시도가 WITH CHECK에서 그대로 막힌다(새 행의
-- board가 magazine이 되는 순간 첫 번째 분기는 is_admin()을 요구하고, 두 번째 분기는 board가
-- next-children/next-youth가 아니게 되어 더 이상 성립하지 않는다 — 일반회원은 어느 쪽도
-- 통과 못 함).
drop policy if exists "magazine_posts admin update" on magazine_posts;
drop policy if exists "magazine_posts update" on magazine_posts;
create policy "magazine_posts update" on magazine_posts
  for update using (
    (board = 'magazine' and is_admin())
    or (board in ('next-children', 'next-youth') and (author_id = auth.uid() or is_admin()))
  )
  with check (
    (board = 'magazine' and is_admin())
    or (board in ('next-children', 'next-youth') and (author_id = auth.uid() or is_admin()))
  );

drop policy if exists "magazine_posts admin delete" on magazine_posts;
drop policy if exists "magazine_posts delete" on magazine_posts;
create policy "magazine_posts delete" on magazine_posts
  for delete using (
    (board = 'magazine' and is_admin())
    or (board in ('next-children', 'next-youth') and (author_id = auth.uid() or is_admin()))
  );

-- 회원이 직접 쓰는 교회학교/청청 글의 이미지 여러 장 첨부 — gallery_photos/sermon_images와
-- 동일한 부모글 1:N 패턴을 재사용하되(신규 버그 표면 최소화), 그 두 테이블과 달리 쓰기
-- 권한이 admin 전용이 아니라 "그 글의 작성자 본인 또는 관리자"다. 이미지 자체에는
-- author_id가 없으므로, 부모 magazine_posts 행의 author_id를 exists 서브쿼리로 대조해
-- 판정한다(이미지 한 장 한 장에 소유자 컬럼을 중복 저장하지 않고 글 하나의 소유권 판정
-- 로직을 한 곳(magazine_posts.author_id)에만 둔다).
create table if not exists magazine_post_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references magazine_posts(id) on delete cascade,
  image_url text not null,
  image_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table magazine_post_images enable row level security;

drop policy if exists "magazine_post_images read all" on magazine_post_images;
create policy "magazine_post_images read all" on magazine_post_images for select using (true);

drop policy if exists "magazine_post_images owner or admin insert" on magazine_post_images;
create policy "magazine_post_images owner or admin insert" on magazine_post_images
  for insert with check (
    exists (
      select 1 from magazine_posts mp
      where mp.id = post_id and (mp.author_id = auth.uid() or is_admin())
    )
  );

drop policy if exists "magazine_post_images owner or admin delete" on magazine_post_images;
create policy "magazine_post_images owner or admin delete" on magazine_post_images
  for delete using (
    exists (
      select 1 from magazine_posts mp
      where mp.id = post_id and (mp.author_id = auth.uid() or is_admin())
    )
  );

-- Storage 버킷 — 기존 magazine-files(관리자 전용, PDF/EPUB/썸네일)와 완전히 분리한 새
-- 버킷이다. 만약 magazine-files의 Storage 정책을 "회원 전체 업로드 허용"으로 바꿔버리면
-- board='magazine' 전용이어야 할 admin-magazine.html의 PDF/EPUB 업로드까지 회원 전체에게
-- 열리게 된다(Storage 정책에는 board 개념이 없어 이 파일들이 어느 board 글에 쓰였는지
-- 구분할 수 없다) — 그래서 반드시 새 버킷을 쓴다. 허용 형식은 JPG/PNG만(오너 지정 —
-- community-post-images/sermon-images가 허용하는 gif/webp는 포함하지 않는다). 소유권
-- 판정은 storage.objects.owner_id(Supabase가 업로드 시점에 서버측에서 자동 기록하는
-- 인증 사용자 id)를 쓴다 — community_post_images_schema.sql과 동일한 근거·동일한 타입
-- 캐스팅(owner_id는 text라 auth.uid()를 ::text로 캐스팅해야 비교됨, supabase/supabase#29836).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('magazine-post-images', 'magazine-post-images', true, 10485760,
    array['image/jpeg', 'image/png'])
  on conflict (id) do update set
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "magazine-post-images public read" on storage.objects;
create policy "magazine-post-images public read" on storage.objects
  for select using (bucket_id = 'magazine-post-images');

drop policy if exists "magazine-post-images authenticated insert" on storage.objects;
create policy "magazine-post-images authenticated insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'magazine-post-images');

drop policy if exists "magazine-post-images owner or admin delete" on storage.objects;
create policy "magazine-post-images owner or admin delete" on storage.objects
  for delete using (
    bucket_id = 'magazine-post-images'
    and (owner_id = (select auth.uid()::text) or is_admin())
  );
