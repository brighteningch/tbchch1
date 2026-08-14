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

// 게시글 첨부사진(community_posts_images, 1:N) — 읽기는 로그인 회원, 쓰기는 글쓴이 본인만(RLS)
async function fetchCommunityPostImages(postId) {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb.from("community_posts_images")
    .select("*").eq("post_id", postId).order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function addCommunityPostImage(payload) {
  const sb = requireSupabaseClient();
  const { data, error } = await sb.from("community_posts_images").insert(payload).select().single();
  if (error) throw error;
  return data;
}

// 목록 화면(카드 여러 개)에서 글마다 따로 조회하면 N+1이 되므로, 게시글 id 목록을 한 번에
// 넘겨 한 번의 쿼리로 전부 받아온다 — 호출부에서 post_id 기준으로 그룹핑해서 쓴다.
async function fetchCommunityPostImagesByPostIds(postIds) {
  const sb = getSupabaseClient();
  if (!sb || !postIds || postIds.length === 0) return [];
  const { data, error } = await sb.from("community_posts_images")
    .select("*").in("post_id", postIds).order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

// ★reviewer-codex 지적 반영(2026-08-14): 글을 먼저 만들고 사진을 순차 업로드하는 흐름에서
// 일부 파일만 업로드 중 실패하면 이미 만든 글과 이미 올라간 Storage 파일이 반쪽짜리 상태로
// 남는다. 실패 시 지금까지 올라간 파일과 방금 만든 글을 best-effort로 되돌려(글 삭제 시
// 자식 community_posts_images 행은 FK cascade로 함께 사라짐) 부분 성공 상태를 남기지 않는다.
// 4개 글쓰기 페이지(community-write/prayer-request-write/두 지역자료실)가 공유한다.
async function uploadCommunityPostImages(bucket, post, files, onProgress) {
  const sb = requireSupabaseClient();
  const uploadedPaths = [];
  try {
    for (let i = 0; i < files.length; i++) {
      if (onProgress) onProgress(i, files.length);
      const file = files[i];
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${post.id}/${Date.now()}-${i}.${ext}`;
      const { error: uploadError } = await sb.storage.from(bucket).upload(path, file, { upsert: false });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);
      const { data: pub } = sb.storage.from(bucket).getPublicUrl(path);
      await addCommunityPostImage({ post_id: post.id, image_url: pub.publicUrl, image_path: path, sort_order: i });
    }
  } catch (err) {
    let rollbackFailed = false;
    if (uploadedPaths.length > 0) {
      const { error: removeError } = await sb.storage.from(bucket).remove(uploadedPaths);
      if (removeError) {
        rollbackFailed = true;
        console.error('업로드 롤백(storage 정리) 실패:', removeError);
      }
    }
    try {
      await deleteCommunityPost(post.id);
    } catch (deleteErr) {
      rollbackFailed = true;
      console.error('업로드 롤백(글 삭제) 실패:', deleteErr);
    }
    err.rollbackFailed = rollbackFailed;
    throw err;
  }
}
