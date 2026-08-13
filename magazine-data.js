// '빛나는 매거진' + 교회학교/청청 게시판 공용 CRUD — magazine_posts
// 읽기는 누구나, 쓰기는 RLS로 is_admin()만 가능하도록 DB에서 강제되어 있다(supabase/magazine_schema.sql).
// 카테고리는 고정 목록이 아니라 자유 텍스트라, 이미 쓰인 카테고리 이름 목록은
// fetchMagazineCategories()로 실제 게시글에서 뽑아낸다(별도 카테고리 테이블 없음).
// ★2026-08-13: board 컬럼으로 같은 테이블을 '빛나는 매거진'(magazine)/교회학교
// (next-children)/청청(next-youth) 3개 게시판이 나눠 쓴다. board 인자 기본값을 기존
// 동작과 동일한 'magazine'으로 둬서, 이 함수를 이미 쓰고 있던 기존 호출부(script.js,
// news-magazine.html, admin-magazine.html의 매거진 기본 화면)는 코드 변경 없이 계속
// 정확히 같은 결과를 받는다 — 새 게시판 페이지만 board 인자를 명시적으로 넘긴다.

// ★2026-08-14: 교회학교/청청 회원 글에 이미지 여러 장이 붙을 수 있어(magazine_post_images,
// 1:N) select에 임베드 조인을 추가한다. FK(post_id → magazine_posts.id)가 있어 PostgREST가
// 자동으로 중첩 리소스로 인식한다. 매거진 게시판 글이나 관리자가 admin-magazine.html로 올린
// PDF/EPUB 글은 이미지가 없어 그냥 빈 배열이 붙을 뿐이라 기존 호출부에 영향 없다.
async function fetchMagazinePosts(category, board = "magazine") {
  const sb = getSupabaseClient();
  if (!sb) return [];
  let q = sb.from("magazine_posts")
    .select("*, magazine_post_images(id, image_url, image_path, sort_order)")
    .eq("board", board)
    .order("created_at", { ascending: false })
    .order("sort_order", { foreignTable: "magazine_post_images", ascending: true });
  if (category) q = q.eq("category", category);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// 글 하나에 이미지 여러 장을 한 번에 등록한다(rows: {post_id, image_url, image_path,
// sort_order}[]). 순서는 호출자가 sort_order로 정해 넘긴다.
async function insertMagazinePostImages(rows) {
  if (!rows || rows.length === 0) return;
  const sb = requireSupabaseClient();
  const { error } = await sb.from("magazine_post_images").insert(rows);
  if (error) throw error;
}

// 수정 시 옛 이미지 행만 콕 집어 지우는 용도 — post_id 전체삭제가 아니라 id 목록으로
// 지운다. 새 이미지를 먼저 업로드·등록한 뒤에 옛 이미지를 지우는 순서를 쓰면(호출부
// 참고) 같은 post_id를 공유하는 새 행까지 같이 지워지면 안 되므로 이 정밀함이 필요하다.
// 글 삭제 시에는 FK의 on delete cascade가 DB 행을 알아서 정리하므로 이 함수를 부를
// 필요가 없다(단, Storage의 실제 파일은 cascade로 안 지워지므로 호출자가 image_path로
// 별도 정리해야 한다 — removePost류 패턴과 동일).
async function deleteMagazinePostImagesByIds(ids) {
  if (!ids || ids.length === 0) return;
  const sb = requireSupabaseClient();
  const { error } = await sb.from("magazine_post_images").delete().in("id", ids);
  if (error) throw error;
}

async function fetchMagazineCategories(board = "magazine") {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb.from("magazine_posts").select("category").eq("board", board);
  if (error) throw error;
  const seen = new Set();
  (data || []).forEach(row => seen.add(row.category));
  return Array.from(seen);
}

async function createMagazinePost(payload) {
  const sb = requireSupabaseClient();
  const { data, error } = await sb.from("magazine_posts").insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function updateMagazinePost(id, payload) {
  const sb = requireSupabaseClient();
  const { data, error } = await sb.from("magazine_posts").update(payload).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

async function deleteMagazinePost(id) {
  const sb = requireSupabaseClient();
  const { error } = await sb.from("magazine_posts").delete().eq("id", id);
  if (error) throw error;
}
