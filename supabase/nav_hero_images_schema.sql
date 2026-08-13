-- 메뉴그룹별 page-hero 배경이미지 저장소 — Supabase 대시보드 SQL Editor에서 이 파일 전체를 그대로 실행하세요.
-- 이미지 자체는 app_settings의 nav_menu JSON(각 그룹 객체의 heroImage 필드)에 공개 URL로
-- 저장되고, 이 파일은 그 URL이 가리키는 실제 파일을 담는 Storage 버킷과 업로드 권한만 정의한다.
-- allowed_mime_types로 이미지 외 파일 업로드를 서버 자체가 거부하게 만든다(클라이언트 accept
-- 속성은 우회 가능한 UX 힌트일 뿐이라 이게 진짜 방어선 — magazine_schema.sql과 동일 패턴).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('nav-hero-images', 'nav-hero-images', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do update set
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "nav-hero-images public read" on storage.objects;
create policy "nav-hero-images public read" on storage.objects
  for select using (bucket_id = 'nav-hero-images');
drop policy if exists "nav-hero-images admin insert" on storage.objects;
create policy "nav-hero-images admin insert" on storage.objects
  for insert with check (bucket_id = 'nav-hero-images' and is_admin());
drop policy if exists "nav-hero-images admin update" on storage.objects;
create policy "nav-hero-images admin update" on storage.objects
  for update using (bucket_id = 'nav-hero-images' and is_admin());
drop policy if exists "nav-hero-images admin delete" on storage.objects;
create policy "nav-hero-images admin delete" on storage.objects
  for delete using (bucket_id = 'nav-hero-images' and is_admin());
