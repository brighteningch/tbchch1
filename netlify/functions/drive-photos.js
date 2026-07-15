// 홈페이지 갤러리: 행사 폴더 목록(최신순) + 특정 폴더 안의 사진 전체 조회
// 실제 폴더 구조: 최상위 폴더 → 카테고리 폴더(교회학교/예배사진/청소년&청년/행사사진) → 날짜별 행사 폴더 → 사진 파일
// API 키는 절대 코드에 넣지 않고 Netlify 환경변수(GOOGLE_DRIVE_API_KEY)로만 읽는다.
const PARENT_FOLDER_ID = "1tbcejmqyzPM94zowqFwv12ZYml3LMRkU";
const MAX_FOLDERS_PER_CATEGORY = 12;
const MAX_FOLDERS_TOTAL = 30;

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
function toPhoto(p) {
  return {
    id: p.id,
    name: p.name,
    thumb: p.thumbnailLink ? p.thumbnailLink.replace(/=s\d+$/, "=s1200") : null,
    link: p.webViewLink,
    createdTime: p.createdTime,
  };
}

const FIELDS = "files(id,name,mimeType,thumbnailLink,webViewLink,createdTime)";

// 특정 폴더(행사 폴더) 안의 사진 전체를 최신순으로 반환
async function listFolderPhotos(apiKey, folderId) {
  const files = await driveList(`'${folderId}' in parents and trashed = false`, apiKey, FIELDS);
  const photos = files.filter(isImage).map(toPhoto);
  photos.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
  return photos;
}

// 전체 카테고리를 훑어 "행사 폴더" 목록을 최신순으로 만든다 (폴더별 대표 썸네일 포함)
async function listRecentFolders(apiKey) {
  const level1 = await driveList(`'${PARENT_FOLDER_ID}' in parents and trashed = false`, apiKey, FIELDS);
  const categoryFolders = level1.filter(isFolder);

  let allFolders = [];

  for (const cat of categoryFolders) {
    const catChildren = await driveList(`'${cat.id}' in parents and trashed = false`, apiKey, FIELDS);
    const eventFolders = catChildren
      .filter(isFolder)
      .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime))
      .slice(0, MAX_FOLDERS_PER_CATEGORY);

    const folderInfos = await Promise.all(
      eventFolders.map(async (ev) => {
        const files = await driveList(`'${ev.id}' in parents and trashed = false`, apiKey, FIELDS);
        const images = files.filter(isImage).map(toPhoto);
        images.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
        if (images.length === 0) return null;
        return {
          id: ev.id,
          name: ev.name,
          category: cat.name,
          date: images[0].createdTime,
          thumb: images[0].thumb,
          count: images.length,
        };
      })
    );

    allFolders = allFolders.concat(folderInfos.filter(Boolean));

    // 카테고리 폴더에 바로 사진이 있는 경우도(하위폴더 없이) 하나의 "폴더"처럼 취급
    const directImages = catChildren.filter(isImage).map(toPhoto);
    if (directImages.length > 0) {
      directImages.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
      allFolders.push({
        id: cat.id,
        name: cat.name,
        category: cat.name,
        date: directImages[0].createdTime,
        thumb: directImages[0].thumb,
        count: directImages.length,
      });
    }
  }

  allFolders.sort((a, b) => new Date(b.date) - new Date(a.date));
  return allFolders.slice(0, MAX_FOLDERS_TOTAL);
}

exports.handler = async function (event) {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "GOOGLE_DRIVE_API_KEY 환경변수가 설정되지 않았습니다." }) };
  }

  const folderId = event.queryStringParameters && event.queryStringParameters.folder;

  try {
    // 특정 폴더의 사진 전체를 요청한 경우
    if (folderId) {
      const photos = await listFolderPhotos(apiKey, folderId);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=900" },
        body: JSON.stringify({ photos }),
      };
    }

    // 기본: 최신순 행사 폴더 목록 + 대표(featured) 폴더
    const folders = await listRecentFolders(apiKey);
    const featuredFolder = folders[0] || null;
    let featuredPhotos = [];
    if (featuredFolder) {
      featuredPhotos = await listFolderPhotos(apiKey, featuredFolder.id);
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=900" },
      body: JSON.stringify({
        featuredFolder,
        featuredPhotos,
        folders: folders.slice(1),
        driveFolderUrl: `https://drive.google.com/drive/folders/${PARENT_FOLDER_ID}`,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
