-- 설교(주일/수요/금요 등) 상세내용 사진 첨부 — Supabase 대시보드 SQL Editor에서 이 파일 전체를 그대로 실행하세요.
-- gallery_schema.sql(포토갤러리 앨범/사진)과 동일한 1:N 패턴을 그대로 재사용한다 — 배열 컬럼 대신
-- 별도 테이블을 쓰는 이유: image_path(Storage 경로)를 image_url과 함께 안전하게 추적하고,
-- 이미 검증된 RLS·정렬·cascade delete 패턴을 그대로 재사용하기 위함(신규 버그 표면 최소화).

create table if not exists sermon_images (
  id uuid primary key default gen_random_uuid(),
  sermon_id uuid not null references sermons(id) on delete cascade,
  image_url text not null,
  image_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table sermon_images enable row level security;

-- 읽기는 누구나(공개 설교 상세페이지), 쓰기는 관리자만 (기존 is_admin() 함수 재사용 — supabase-schema.sql)
drop policy if exists "sermon_images read all" on sermon_images;
create policy "sermon_images read all" on sermon_images for select using (true);
drop policy if exists "sermon_images admin insert" on sermon_images;
create policy "sermon_images admin insert" on sermon_images for insert with check (is_admin());
drop policy if exists "sermon_images admin update" on sermon_images;
create policy "sermon_images admin update" on sermon_images for update using (is_admin());
drop policy if exists "sermon_images admin delete" on sermon_images;
create policy "sermon_images admin delete" on sermon_images for delete using (is_admin());

-- Storage 버킷 — 읽기 공개, 쓰기는 관리자만. allowed_mime_types로 이미지 외 파일 업로드를
-- 서버 자체가 거부하게 만든다(클라이언트 accept 속성은 우회 가능한 UX 힌트일 뿐이라 이게 진짜
-- 방어선 — magazine_schema.sql·nav_hero_images_schema.sql과 동일 패턴). 용량 한도(10MB)와
-- 허용 mime 목록은 가장 최근에 추가된 community_post_images_schema.sql과 동일하게 통일한다.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('sermon-images', 'sermon-images', true, 10485760,
    array['image/jpeg', 'image/png', 'image/gif', 'image/webp'])
  on conflict (id) do update set
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "sermon-images public read" on storage.objects;
create policy "sermon-images public read" on storage.objects
  for select using (bucket_id = 'sermon-images');
drop policy if exists "sermon-images admin insert" on storage.objects;
create policy "sermon-images admin insert" on storage.objects
  for insert with check (bucket_id = 'sermon-images' and is_admin());
drop policy if exists "sermon-images admin update" on storage.objects;
create policy "sermon-images admin update" on storage.objects
  for update using (bucket_id = 'sermon-images' and is_admin());
drop policy if exists "sermon-images admin delete" on storage.objects;
create policy "sermon-images admin delete" on storage.objects
  for delete using (bucket_id = 'sermon-images' and is_admin());
