// 가정 및 구역 예배 등 커뮤니티 게시판 CRUD (Supabase). 읽기는 누구나, 쓰기는 로그인한 회원 누구나,
// 삭제는 글쓴이 본인 또는 관리자만 가능(RLS로 서버에서 강제).
async function fetchCommunityPosts(board) {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb.from("community_posts")
    .select("*")
    .eq("board", board)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

async function fetchCommunityPostById(id) {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data, error } = await sb.from("community_posts").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

async function createCommunityPost(payload) {
  const sb = requireSupabaseClient();
  const { data, error } = await sb.from("community_posts").insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function deleteCommunityPost(id) {
  const sb = requireSupabaseClient();
  const { error } = await sb.from("community_posts").delete().eq("id", id);
  if (error) throw error;
}
