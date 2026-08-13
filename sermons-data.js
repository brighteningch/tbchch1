// 말씀과 찬양 데이터 CRUD (Supabase). 읽기는 누구나, 쓰기/수정/삭제는 관리자만 가능(RLS로 서버에서 강제).
async function fetchSermons(category) {
  const sb = getSupabaseClient();
  if (!sb) return [];
  let query = sb.from("sermons")
    .select("*")
    .order("date", { ascending: false, nullsFirst: false })
    .order("sort_order", { ascending: true, nullsFirst: false });
  if (category) query = query.eq("category", category);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function fetchSermonById(id) {
  const sb = requireSupabaseClient();
  const { data, error } = await sb.from("sermons").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

async function createSermon(payload) {
  const sb = requireSupabaseClient();
  const { data, error } = await sb.from("sermons").insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function updateSermon(id, payload) {
  const sb = requireSupabaseClient();
  const { error } = await sb.from("sermons").update(payload).eq("id", id);
  if (error) throw error;
}

async function deleteSermon(id) {
  const sb = requireSupabaseClient();
  // sermon_images 행은 FK(on delete cascade)로 자동 삭제되지만, Storage 파일은 DB cascade
  // 대상이 아니라서 먼저 명시적으로 지워야 고아 파일이 남지 않는다(gallery의 deleteGalleryAlbum과 동일 패턴).
  const images = await fetchSermonImages(id);
  if (images.length > 0) {
    await sb.storage.from("sermon-images").remove(images.map(img => img.image_path));
  }
  const { error } = await sb.from("sermons").delete().eq("id", id);
  if (error) throw error;
}

// 설교 첨부사진 (sermon_images) — 읽기는 누구나, 쓰기는 RLS로 is_admin()만 가능
async function fetchSermonImages(sermonId) {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb.from("sermon_images").select("*").eq("sermon_id", sermonId).order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function addSermonImage(payload) {
  const sb = requireSupabaseClient();
  const { data, error } = await sb.from("sermon_images").insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function deleteSermonImage(id, imagePath) {
  const sb = requireSupabaseClient();
  if (imagePath) await sb.storage.from("sermon-images").remove([imagePath]);
  const { error } = await sb.from("sermon_images").delete().eq("id", id);
  if (error) throw error;
}
