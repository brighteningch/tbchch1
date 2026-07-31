// "곱씹다"(설교요약) 유튜브 재생목록의 영상 목록을 가져온다.
// YouTube Data API v3 playlistItems.list 사용, youtube-live-check와 같은 API 키를 재사용한다.
const PLAYLIST_ID = "PLDzGKJ9-1JMMs_ZZRORUrvH5JW-O6ejXi";
const API_KEY = process.env.YOUTUBE_API_KEY;

exports.handler = async function () {
  if (!API_KEY) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [], error: "YOUTUBE_API_KEY not set" }),
    };
  }

  try {
    const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${PLAYLIST_ID}&maxResults=50&key=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.error) throw new Error(data.error.message || "YouTube API error");

    const items = (data.items || [])
      .filter((it) => it.snippet && it.snippet.resourceId && it.snippet.resourceId.videoId)
      .map((it) => ({
        videoId: it.snippet.resourceId.videoId,
        title: it.snippet.title,
        publishedAt: it.snippet.publishedAt,
        thumbnail: it.snippet.thumbnails && (it.snippet.thumbnails.high || it.snippet.thumbnails.medium || it.snippet.thumbnails.default)
          ? (it.snippet.thumbnails.high || it.snippet.thumbnails.medium || it.snippet.thumbnails.default).url
          : null,
      }))
      // 유튜브 업로드된 순서가 아니라 게시일 최신순으로 정렬
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=900",
      },
      body: JSON.stringify({ items }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: [], error: String(err) }),
    };
  }
};
