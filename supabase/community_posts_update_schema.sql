-- community_posts 4개 게시판(성도 사업처·계룡시 사업처·이야기 나누기·중보기도요청)에
-- "본인 글 또는 관리자" 수정 기능을 추가한다. 처음부터 이 테이블엔 UPDATE용 RLS 정책
-- 자체가 없었다(INSERT/SELECT/DELETE만 존재 — db query --linked 실측 확인). Supabase
-- 대시보드 SQL Editor에서 이 파일 전체를 그대로 실행하세요.

-- ★WITH CHECK에도 author_id 조건을 넣는 이유(오너 명시 권고): USING만 있으면 "이 행을
-- 건드릴 수 있는가"만 검사하고, 건드린 뒤의 새 값이 유효한지는 안 본다 — 본인 글의
-- author_id를 다른 사람 id로 바꿔치기하는 시도까지 막으려면 WITH CHECK에도 같은 조건을
-- 걸어야 한다(수정 후 결과 행도 "auth.uid()=author_id or is_admin()"을 만족해야 통과).
-- 클라이언트(community-write.html 등)도 author_id 필드 자체를 폼에 노출하지 않아 이중
-- 방어이지만, DB 레벨 방어선이 진짜 방어선이다.
drop policy if exists "author or admin can update posts" on community_posts;
create policy "author or admin can update posts" on community_posts
  for update using (auth.uid() = author_id or is_admin())
  with check (auth.uid() = author_id or is_admin());

-- ★community_posts_images INSERT 정책 확장(오늘 밤 다중이미지 티켓에서 만든 정책 —
-- 그때는 작성 시점(글쓴이 본인)만 고려해 is_admin()이 빠져있었다). 관리자가 남의 글을
-- 수정하면서 새 사진을 추가하는 경로를 이번 티켓에서 지원해야 하는데, 기존 정책대로면
-- author_id=auth.uid()만 통과해 관리자가 막힌다. DELETE 정책은 이미 is_admin()이 있으니
-- (지우기는 되는데 넣기는 안 되는 비일관성을 없애기 위해서도) 동일하게 넓힌다.
drop policy if exists "community_posts_images author insert" on community_posts_images;
drop policy if exists "community_posts_images author or admin insert" on community_posts_images;
create policy "community_posts_images author or admin insert" on community_posts_images
  for insert with check (
    exists (
      select 1 from community_posts p
      where p.id = post_id and (p.author_id = auth.uid() or is_admin())
    )
  );
