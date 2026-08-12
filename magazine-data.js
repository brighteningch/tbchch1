// '빛나는 매거진' 게시판 CRUD — magazine_posts
// 읽기는 누구나, 쓰기는 RLS로 is_admin()만 가능하도록 DB에서 강제되어 있다(supabase/magazine_schema.sql).
// 카테고리는 고정 목록이 아니라 자유 텍스트라, 이미 쓰인 카테고리 이름 목록은
// fetchMagazineCategories()로 실제 게시글에서 뽑아낸다(별도 카테고리 테이블 없음).

async function fetchMagazinePosts(category) {
  const sb = getSupabaseClient();
  if (!sb) return [];
  let q = sb.from("magazine_posts").select("*").order("created_at", { ascending: false });
  if (category) q = q.eq("category", category);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function fetchMagazineCategories() {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb.from("magazine_posts").select("category");
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
