-- community_posts 게시판(지역자료실 2개·가정교회 "이야기 나누기"·중보기도요청) 사진 여러 장
-- 첨부 지원. sermon_images_schema.sql·gallery_schema.sql과 동일한 1:N 패턴(부모 FK cascade
-- delete, sort_order)을 그대로 재사용한다. Supabase 대시보드 SQL Editor에서 이 파일 전체를
-- 그대로 실행하세요.
--
-- 기존 community_posts.image_url/image_path 단일 컬럼은 과거 글(마이그레이션 없이) 계속
-- 그 컬럼으로 표시하고, 신규 글부터는 이 테이블만 사용한다(지역자료실 2개 board도 포함 —
-- 기존에 image_url 직접 insert하던 방식은 폐지, 다중 업로드로 전환).

create table if not exists community_posts_images (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references community_posts(id) on delete cascade,
  image_url text not null,
  image_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table community_posts_images enable row level security;

-- ★SELECT 정책: community_posts 자체의 실제 라이브 정책을 그대로 미러링한다(문서
-- (community_post_images_schema.sql 구버전 주석)가 말하는 "지역자료실 2개 board는
-- 비로그인도 조회 가능" anon 예외는 2026-08-14 현재 라이브 pg_policies 실측 결과
-- 존재하지 않는다 — community_posts의 유일한 SELECT 정책은
-- "logged in members can read community posts" using (auth.uid() is not null)뿐이다.
-- 이 티켓은 community_posts 자체의 정책을 바꾸는 범위가 아니므로(문서-라이브 드리프트는
-- master에 보고만 하고 임의로 고치지 않음), 이미지 테이블도 부모와 동일한 로그인전용
-- 조건으로 맞춘다 — 부모글이 안 보이는 사람에게 이미지만 보이는 불일치를 막기 위함이다.
drop policy if exists "community_posts_images read logged in" on community_posts_images;
create policy "community_posts_images read logged in" on community_posts_images
  for select using (auth.uid() is not null);

-- INSERT: 업로드는 그 글의 작성자 본인만(티켓 명시 "업로드는 로그인 회원 누구나(글쓴이)") —
-- 단순 "로그인만 하면 아무 글에나" 가 아니라 자기 글에만 사진을 붙일 수 있게 좁힌다.
drop policy if exists "community_posts_images author insert" on community_posts_images;
create policy "community_posts_images author insert" on community_posts_images
  for insert with check (
    exists (
      select 1 from community_posts p
      where p.id = post_id and p.author_id = auth.uid()
    )
  );

-- DELETE: 글쓴이 본인 또는 관리자만(community_posts 자체의 삭제 정책과 동일 원칙).
drop policy if exists "community_posts_images author or admin delete" on community_posts_images;
create policy "community_posts_images author or admin delete" on community_posts_images
  for delete using (
    exists (
      select 1 from community_posts p
      where p.id = post_id and (p.author_id = auth.uid() or is_admin())
    )
  );

-- Storage: community-post-images 버킷은 어젯밤(2026-08-12) 지역자료실 단일이미지용으로
-- 이미 만들어져 있다(공개읽기/인증회원 업로드/소유자-또는-관리자 삭제, owner_id 기반 —
-- storage.objects.owner_id는 업로드 시점에 Supabase가 서버측에서 자동 기록하는 JWT sub라
-- 클라이언트가 만드는 경로 문자열에 소유권 판정을 의존하지 않는다). 새 버킷을 만들지 않고
-- 그대로 재사용하되, ★오너 명시 지시(2026-08-14): 다중이미지 업로드는 JPG·PNG만 허용 —
-- 기존에 열려있던 gif/webp를 막는다(신규 업로드부터 적용, 기존 파일은 영향 없음).
update storage.buckets
  set allowed_mime_types = array['image/jpeg', 'image/png']
  where id = 'community-post-images';
