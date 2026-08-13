// '빛나는 매거진' + 교회학교/청청 게시판 공용 CRUD — magazine_posts
// 읽기는 누구나, 쓰기는 RLS로 is_admin()만 가능하도록 DB에서 강제되어 있다(supabase/magazine_schema.sql).
// 카테고리는 고정 목록이 아니라 자유 텍스트라, 이미 쓰인 카테고리 이름 목록은
// fetchMagazineCategories()로 실제 게시글에서 뽑아낸다(별도 카테고리 테이블 없음).
// ★2026-08-13: board 컬럼으로 같은 테이블을 '빛나는 매거진'(magazine)/교회학교
// (next-children)/청청(next-youth) 3개 게시판이 나눠 쓴다. board 인자 기본값을 기존
// 동작과 동일한 'magazine'으로 둬서, 이 함수를 이미 쓰고 있던 기존 호출부(script.js,
// news-magazine.html, admin-magazine.html의 매거진 기본 화면)는 코드 변경 없이 계속
// 정확히 같은 결과를 받는다 — 새 게시판 페이지만 board 인자를 명시적으로 넘긴다.

async function fetchMagazinePosts(category, board = "magazine") {
  const sb = getSupabaseClient();
  if (!sb) return [];
  let q = sb.from("magazine_posts").select("*").eq("board", board).order("created_at", { ascending: false });
  if (category) q = q.eq("category", category);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
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
