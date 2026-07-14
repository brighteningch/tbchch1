// 홈페이지 갤러리: 최신 대표 사진 1장 + 카테고리별(교회학교/예배사진/청소년&청년/행사사진) 최근 사진 1장씩을 가져온다.
// 실제 폴더 구조: 최상위 폴더 → 카테고리 폴더 → 날짜별 행사 폴더 → 사진 파일
// API 키는 절대 코드에 넣지 않고 Netlify 환경변수(GOOGLE_DRIVE_API_KEY)로만 읽는다.
const PARENT_FOLDER_ID = "1tbcejmqyzPM94zowqFwv12ZYml3LMRkU";
const MAX_RECENT_EVENT_FOLDERS_PER_CATEGORY = 4;

async function driveList(query, apiKey, fields) {
  const url = `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({
    q: query,
    fields,
    pageSize: "200",
    key: apiKey,
  })}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || "Drive API error");
  return data.files || [];
}

function isFolder(f) {
  return f.mimeType === "application/vnd.google-apps.folder";
}
function isImage(f) {
  return f.mimeType && f.mimeType.startsWith("image/");
}
function toPhoto(p, category, eventName) {
  return {
    id: p.id,
    name: p.name,
    thumb: p.thumbnailLink ? p.thumbnailLink.replace(/=s\d+$/, "=s800") : null,
    link: p.webViewLink,
    createdTime: p.createdTime,
    category,
    event: eventName || category,
  };
}

exports.handler = async function () {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "GOOGLE_DRIVE_API_KEY 환경변수가 설정되지 않았습니다." }) };
  }

  try {
    const fields = "files(id,name,mimeType,thumbnailLink,webViewLink,createdTime)";

    // 1) 카테고리 폴더 목록
    const level1 = await driveList(`'${PARENT_FOLDER_ID}' in parents and trashed = false`, apiKey, fields);
    const categoryFolders = level1.filter(isFolder);

    let allPhotos = [];
    const byCategory = {};

    for (const cat of categoryFolders) {
      const catChildren = await driveList(`'${cat.id}' in parents and trashed = false`, apiKey, fields);
      const directImages = catChildren.filter(isImage).map(p => toPhoto(p, cat.name, cat.name));
      const eventFolders = catChildren.filter(isFolder).sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
      const recentEvents = eventFolders.slice(0, MAX_RECENT_EVENT_FOLDERS_PER_CATEGORY);

      const eventPhotoLists = await Promise.all(
        recentEvents.map(async ev => {
          const files = await driveList(`'${ev.id}' in parents and trashed = false`, apiKey, fields);
          return files.filter(isImage).map(p => toPhoto(p, cat.name, ev.name));
        })
      );

      const catPhotos = directImages.concat(eventPhotoLists.flat());
      catPhotos.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));

      if (catPhotos.length > 0) {
        byCategory[cat.name] = catPhotos[0];
      }
      allPhotos = allPhotos.concat(catPhotos);
    }

    allPhotos.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
    const featured = allPhotos[0] || null;

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=900" },
      body: JSON.stringify({
        featured,
        categories: Object.entries(byCategory).map(([name, photo]) => ({ name, photo })),
        driveFolderUrl: `https://drive.google.com/drive/folders/${PARENT_FOLDER_ID}`,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
