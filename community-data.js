// 가정 및 구역 예배·중보기도요청 등 커뮤니티 게시판 CRUD (Supabase).
// 목록(제목/작성자/날짜)은 누구나 볼 수 있고, 본문(body) 상세는 로그인한 회원만 볼 수 있다.
// 쓰기는 로그인한 회원 누구나, 삭제는 글쓴이 본인 또는 관리자만 가능(RLS로 서버에서 강제).

// 목록 화면 전용: 본문(body)이 없는 안전한 뷰(community_posts_list)를 조회한다 — 비로그인도 목록은 보이되
// 클릭해서 들어가는 상세(fetchCommunityPostById, community_posts 원본 테이블)는 RLS가 로그인 회원만 허용한다.
async function fetchCommunityPostsList(board) {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb.from("community_posts_list")
    .select("*")
    .eq("board", board)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

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
