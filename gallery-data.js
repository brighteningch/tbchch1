// 포토갤러리(자체 저장) CRUD — gallery_albums / gallery_photos
// 읽기는 누구나, 쓰기는 RLS로 is_admin()만 가능하도록 DB에서 강제되어 있다(supabase/gallery_schema.sql).

async function fetchGalleryAlbums(category) {
  const sb = getSupabaseClient();
  if (!sb) return [];
  let q = sb.from("gallery_albums").select("*")
    .order("album_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (category && category !== "전체") q = q.eq("category", category);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

async function fetchGalleryAlbumById(id) {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data, error } = await sb.from("gallery_albums").select("*").eq("id", id).single();
  if (error) throw error;
  return data;
}

async function fetchGalleryPhotos(albumId) {
  const sb = getSupabaseClient();
  if (!sb) return [];
  const { data, error } = await sb.from("gallery_photos").select("*").eq("album_id", albumId).order("sort_order", { ascending: true });
  if (error) throw error;
  return data || [];
}

async function createGalleryAlbum(payload) {
  const sb = requireSupabaseClient();
  const { data, error } = await sb.from("gallery_albums").insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function updateGalleryAlbum(id, payload) {
  const sb = requireSupabaseClient();
  const { error } = await sb.from("gallery_albums").update(payload).eq("id", id);
  if (error) throw error;
}

async function addGalleryPhoto(payload) {
  const sb = requireSupabaseClient();
  const { data, error } = await sb.from("gallery_photos").insert(payload).select().single();
  if (error) throw error;
  return data;
}

async function deleteGalleryAlbum(id) {
  const sb = requireSupabaseClient();
  const photos = await fetchGalleryPhotos(id);
  if (photos.length > 0) {
    await sb.storage.from("gallery-images").remove(photos.map(p => p.image_path));
  }
  const { error } = await sb.from("gallery_albums").delete().eq("id", id);
  if (error) throw error;
}

async function deleteGalleryPhoto(id, imagePath) {
  const sb = requireSupabaseClient();
  if (imagePath) await sb.storage.from("gallery-images").remove([imagePath]);
  const { error } = await sb.from("gallery_photos").delete().eq("id", id);
  if (error) throw error;
}
