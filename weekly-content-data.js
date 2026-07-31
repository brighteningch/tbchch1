// 주간말씀(설교인포그래픽/주간묵상집/매일성경묵상/소그룹자료) CRUD.
// 전부 관리자(is_admin)가 날짜+이미지로 업로드하는 동일한 패턴이며,
// 읽기는 누구나·쓰기는 관리자만 가능하도록 RLS가 서버에서 강제한다.
// (2026-07-31: share 카테고리가 "성도 자유게시판"에서 "소그룹자료"로 바뀌면서
//  관리자 전용 쓰기로 전환됨 — DB RLS도 함께 갱신 필요)
async function fetchWeeklyContent(category) {
  const sb = getSupabaseClient();
  if (!sb) return [];
  let query = sb.from("weekly_content").select("*").order("period", { ascending: false }).order("created_at", { ascending: false });
  if (category) query = query.eq("category", category);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function createWeeklyContent(payload) {
  const sb = requireSupabaseClient();
  const { data, error } = await sb.from("weekly_content").insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function updateWeeklyContent(id, payload) {
  const sb = requireSupabaseClient();
  const { error } = await sb.from("weekly_content").update(payload).eq("id", id);
  if (error) throw error;
}

async function deleteWeeklyContent(id) {
  const sb = requireSupabaseClient();
  const { error } = await sb.from("weekly_content").delete().eq("id", id);
  if (error) throw error;
}
