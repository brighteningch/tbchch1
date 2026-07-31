-- 포토갤러리 (자체 저장) — 구글드라이브 연동을 걷어내고 Supabase Storage로 직접 관리한다.
-- Supabase 대시보드 SQL Editor에서 이 파일 전체를 그대로 실행하세요.

-- 1) 앨범(행사 단위) — 카테고리는 전체/예배/다음세대/행사 중 전체는 필터일 뿐 저장하지 않는다
create table if not exists gallery_albums (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('예배', '다음세대', '행사')),
  title text not null,
  album_date date,
  cover_image_url text,
  created_at timestamptz not null default now()
);

-- 2) 앨범 안의 사진들
create table if not exists gallery_photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null references gallery_albums(id) on delete cascade,
  image_url text not null,
  image_path text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table gallery_albums enable row level security;
alter table gallery_photos enable row level security;

-- 읽기는 누구나(홈페이지 방문자), 쓰기는 관리자만 (기존 is_admin() 함수 재사용 — supabase-schema.sql)
drop policy if exists "gallery_albums read all" on gallery_albums;
create policy "gallery_albums read all" on gallery_albums for select using (true);
drop policy if exists "gallery_albums admin insert" on gallery_albums;
create policy "gallery_albums admin insert" on gallery_albums for insert with check (is_admin());
drop policy if exists "gallery_albums admin update" on gallery_albums;
create policy "gallery_albums admin update" on gallery_albums for update using (is_admin());
drop policy if exists "gallery_albums admin delete" on gallery_albums;
create policy "gallery_albums admin delete" on gallery_albums for delete using (is_admin());

drop policy if exists "gallery_photos read all" on gallery_photos;
create policy "gallery_photos read all" on gallery_photos for select using (true);
drop policy if exists "gallery_photos admin insert" on gallery_photos;
create policy "gallery_photos admin insert" on gallery_photos for insert with check (is_admin());
drop policy if exists "gallery_photos admin update" on gallery_photos;
create policy "gallery_photos admin update" on gallery_photos for update using (is_admin());
drop policy if exists "gallery_photos admin delete" on gallery_photos;
create policy "gallery_photos admin delete" on gallery_photos for delete using (is_admin());

-- 3) Storage 버킷 — 읽기 공개, 쓰기는 관리자만 (devotion-images와 동일한 패턴)
insert into storage.buckets (id, name, public)
  values ('gallery-images', 'gallery-images', true)
  on conflict (id) do nothing;

drop policy if exists "gallery-images public read" on storage.objects;
create policy "gallery-images public read" on storage.objects
  for select using (bucket_id = 'gallery-images');
drop policy if exists "gallery-images admin insert" on storage.objects;
create policy "gallery-images admin insert" on storage.objects
  for insert with check (bucket_id = 'gallery-images' and is_admin());
drop policy if exists "gallery-images admin update" on storage.objects;
create policy "gallery-images admin update" on storage.objects
  for update using (bucket_id = 'gallery-images' and is_admin());
drop policy if exists "gallery-images admin delete" on storage.objects;
create policy "gallery-images admin delete" on storage.objects
  for delete using (bucket_id = 'gallery-images' and is_admin());
