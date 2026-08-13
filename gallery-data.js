// 포토갤러리(자체 저장) CRUD — gallery_albums / gallery_photos
// 읽기는 로그인 회원만, 업로드는 로그인 회원 누구나, 수정/삭제는 본인 또는 관리자만 가능하도록
// RLS로 DB에서 강제되어 있다(supabase/access_gating_schema.sql, 2026-08-13 회원개방).

const GALLERY_BUCKET = "gallery-images";

// ★reviewer-codex 2차 검토 REVISE 반영(2026-08-13): gallery-images 버킷을 비공개로 전환
// (bucket.public=false + storage.objects SELECT를 authenticated 전용으로)하면서, DB에
// 저장해온 cover_image_url/image_url(getPublicUrl 결과인 공개 URL 문자열)은 로그인 여부와
// 무관하게 더 이상 그대로 못 쓴다 — 렌더 시점마다 로그인 세션으로 서명URL을 새로 발급해야
// 한다(서명URL은 토큰이 쿼리스트링에 실려있어 <img src>가 별도 Authorization 헤더 없이도
// 그대로 동작한다 — 브라우저가 img 요청에 인증헤더를 자동으로 안 붙이는 문제를 우회).
// 1시간이면 한 페이지 세션 동안 충분하고, 새로고침하면 다시 새로 발급되니 만료돼도 문제없다.
const GALLERY_SIGNED_URL_TTL_SECONDS = 3600;

// gallery_photos는 image_path 컬럼이 따로 있지만, gallery_albums.cover_image_url은 경로가
// 아니라 예전에 getPublicUrl로 만든 완성 URL 문자열만 저장돼 있다 — 알려진 공개 URL
// 접두어를 잘라내 경로를 복원한다(NAV_HERO_IMAGE_URL_PREFIX와 동일한 원리, common.js 참고).
const GALLERY_PUBLIC_URL_PREFIX =
  "https://vogslryxeicemtotleph.supabase.co/storage/v1/object/public/gallery-images/";
function galleryPathFromUrl(url) {
  return typeof url === "string" && url.startsWith(GALLERY_PUBLIC_URL_PREFIX)
    ? url.slice(GALLERY_PUBLIC_URL_PREFIX.length)
    : null;
}

// path 배열을 한 번에 서명URL로 바꿔 {path: signedUrl} 맵으로 반환한다(createSignedUrls
// 배치 API — 앨범/사진이 여러 장이어도 요청 1번). 로그인 안 됐거나 RLS로 거부되면(anon이
// 호출한 경우 등) error가 나거나 개별 항목의 signedUrl이 비므로, 그 경우 해당 path는 맵에서
// 빠진다 — 호출부는 "사진 없음" 플레이스홀더로 안전하게 폴백한다.
async function resolveGallerySignedUrls(paths) {
  const sb = getSupabaseClient();
  const validPaths = [...new Set(paths.filter(Boolean))];
  if (!sb || validPaths.length === 0) return {};
  const { data, error } = await sb.storage.from(GALLERY_BUCKET).createSignedUrls(validPaths, GALLERY_SIGNED_URL_TTL_SECONDS);
  if (error || !data) return {};
  const map = {};
  data.forEach(d => { if (d.signedUrl && !d.error) map[d.path] = d.signedUrl; });
  return map;
}

// 앨범 목록에 서명된 대표사진 URL(cover_signed_url)을 붙여서 반환한다.
async function attachGallerySignedCovers(albums) {
  const paths = albums.map(a => galleryPathFromUrl(a.cover_image_url));
  const map = await resolveGallerySignedUrls(paths);
  return albums.map(a => ({ ...a, cover_signed_url: map[galleryPathFromUrl(a.cover_image_url)] || null }));
}

// 사진 목록에 서명된 URL(signed_url)을 붙여서 반환한다.
async function attachGallerySignedPhotoUrls(photos) {
  const map = await resolveGallerySignedUrls(photos.map(p => p.image_path));
  return photos.map(p => ({ ...p, signed_url: map[p.image_path] || null }));
}

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
