// 주간말씀(설교인포그래픽/매일성경묵상/가정예배 순서지/빛나는교회 편집부) CRUD.
// 전부 관리자(is_admin)가 날짜(+이미지 또는 파일)로 업로드하는 동일한 패턴이며,
// 읽기는 누구나·쓰기는 관리자만 가능하도록 RLS가 서버에서 강제한다.
async function fetchWeeklyContent(category) {
  const sb = getSupabaseClient();
  if (!sb) return [];
  let query = sb.from("weekly_content").select("*").order("period", { ascending: false }).order("created_at", { ascending: false });
  if (category) query = query.eq("category", category);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function fetchWeeklyContentById(id) {
  const sb = requireSupabaseClient();
  const { data, error } = await sb.from("weekly_content").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
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

// 알림 및 공지사항: 기존 정적 notices.json(초기 안내글 1건)과 관리자가 새로 등록하는
// weekly_content(category='notice')를 합쳐서 하나의 목록으로 돌려준다.
async function fetchMergedNotices() {
  const [staticRes, dbItems] = await Promise.all([
    fetch('/content/notices.json').then(r => r.json()).catch(() => ({ notices: [] })),
    fetchWeeklyContent('notice').catch(() => []),
  ]);
  const staticItems = (staticRes.notices || []).map(n => ({
    id: null, date: n.date, title: n.title, body: n.body || '', fileUrl: null, fileType: null,
  }));
  const dbNormalized = dbItems.map(item => {
    const d = item.data || {};
    return { id: item.id, date: item.period, title: item.title, body: d.body || '', fileUrl: d.fileUrl || null, fileType: d.fileType || null };
  });
  return [...staticItems, ...dbNormalized].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
