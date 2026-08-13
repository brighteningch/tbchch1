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
