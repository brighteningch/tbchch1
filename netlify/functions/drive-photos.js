// 홈페이지 갤러리: 카테고리 4개 요약 + 카테고리 안 행사 폴더 목록(최신순) + 특정 폴더 안의 사진 전체 조회
// 실제 폴더 구조: 최상위 폴더 → 카테고리 폴더(교회학교/예배사진/청소년&청년/행사사진) → 날짜별 행사 폴더 → 사진 파일
// API 키는 절대 코드에 넣지 않고 Netlify 환경변수(GOOGLE_DRIVE_API_KEY)로만 읽는다.
const PARENT_FOLDER_ID = "1tbcejmqyzPM94zowqFwv12ZYml3LMRkU";
const CATEGORY_ORDER = ["행사사진", "청소년&청년", "예배사진", "교회학교"];

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

// 행사 폴더 이름에서 실제 행사 날짜를 해석한다
// 1) "20260607 한우리교회 선교예배" 처럼 맨 앞 8자리가 YYYYMMDD인 경우 → 정확한 날짜
// 2) "2019년도 자료", "2024 샘터교회선교예배" 처럼 연도만 있는 경우 → 그 해 1월 1일로 근사
function parseFolderDate(name) {
  if (!name) return null;

  let m = name.match(/^(\d{4})(\d{2})(\d{2})(?!\d)/);
  if (m) {
    const [, y, mo, d] = m;
    const monthNum = Number(mo), dayNum = Number(d);
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
      const date = new Date(Date.UTC(Number(y), monthNum - 1, dayNum));
      if (!isNaN(date.getTime())) return date.toISOString();
    }
  }

  m = name.match(/^(\d{4})(?!\d)/);
  if (m) {
    const year = Number(m[1]);
    if (year >= 2000 && year <= 2100) {
      const date = new Date(Date.UTC(year, 0, 1));
      if (!isNaN(date.getTime())) return date.toISOString();
    }
  }

  return null;
}

// 특정 폴더(행사 폴더) 안의 사진 전체를 최신순으로 반환
async function listFolderPhotos(apiKey, folderId) {
  const files = await driveList(`'${folderId}' in parents and trashed = false`, apiKey, FIELDS);
  const photos = files.filter(isImage).map(toPhoto);
  photos.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
  return photos;
}

// 카테고리 폴더 하나 안의 행사 폴더들을 최신순으로 반환 (폴더별 대표 썸네일 포함)
async function listEventFoldersInCategory(apiKey, categoryId) {
  const children = await driveList(`'${categoryId}' in parents and trashed = false`, apiKey, FIELDS);
  const eventFolders = children.filter(isFolder);

  const folderInfos = await Promise.all(
    eventFolders.map(async (ev) => {
      const files = await driveList(`'${ev.id}' in parents and trashed = false`, apiKey, FIELDS);
      const images = files.filter(isImage).map(toPhoto);
      images.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
      if (images.length === 0) return null;
      return {
        id: ev.id,
        name: ev.name,
        date: parseFolderDate(ev.name) || images[0].createdTime,
        thumb: images[0].thumb,
        count: images.length,
      };
    })
  );

  let folders = folderInfos.filter(Boolean);

  // 카테고리 폴더에 바로 사진이 있는 경우(하위폴더 없이)도 하나의 앨범처럼 취급
  const directImages = children.filter(isImage).map(toPhoto);
  if (directImages.length > 0) {
    directImages.sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime));
    folders.push({
      id: categoryId,
      name: "기타 사진",
      date: directImages[0].createdTime,
      thumb: directImages[0].thumb,
      count: directImages.length,
    });
  }

  folders.sort((a, b) => new Date(b.date) - new Date(a.date));
  return folders;
}

// 최상위 카테고리 4개의 요약 정보(대표 썸네일 · 앨범 개수 · 최근 업데이트일)를 정해진 순서로 반환
async function listCategories(apiKey) {
  const level1 = await driveList(`'${PARENT_FOLDER_ID}' in parents and trashed = false`, apiKey, FIELDS);
  const categoryFolders = level1.filter(isFolder).sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a.name);
    const ib = CATEGORY_ORDER.indexOf(b.name);
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
  });

  return Promise.all(
    categoryFolders.map(async (cat) => {
      const eventFolders = await listEventFoldersInCategory(apiKey, cat.id);
      const latest = eventFolders[0] || null;
      return {
        id: cat.id,
        name: cat.name,
        count: eventFolders.length,
        date: latest ? latest.date : null,
        thumb: latest ? latest.thumb : null,
      };
    })
  );
}

exports.handler = async function (event) {
  const apiKey = process.env.GOOGLE_DRIVE_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "GOOGLE_DRIVE_API_KEY 환경변수가 설정되지 않았습니다." }) };
  }

  const params = event.queryStringParameters || {};
  const folderId = params.folder;
  const categoryId = params.category;

  try {
    // 특정 폴더(행사 폴더)의 사진 전체를 요청한 경우
    if (folderId) {
      const photos = await listFolderPhotos(apiKey, folderId);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=900" },
        body: JSON.stringify({ photos }),
      };
    }

    // 카테고리 안의 행사 폴더 목록(최신순)을 요청한 경우
    if (categoryId) {
      const folders = await listEventFoldersInCategory(apiKey, categoryId);
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=900" },
        body: JSON.stringify({ folders }),
      };
    }

    // 기본: 최상위 카테고리 4개 요약
    const categories = await listCategories(apiKey);
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=900" },
      body: JSON.stringify({
        categories,
        driveFolderUrl: `https://drive.google.com/drive/folders/${PARENT_FOLDER_ID}`,
      }),
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err) }) };
  }
};
