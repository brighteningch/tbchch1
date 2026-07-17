// 빛나는교회 유튜브 채널이 지금 실시간 방송 중인지 확인한다.
// 브라우저에서 유튜브 페이지를 직접 fetch하면 CORS로 막혀서 이 함수를 거친다.
// API 키 없이, 채널의 /live 페이지 HTML에서 isLiveNow 여부를 직접 읽는다.
const LIVE_PAGE_URL = "https://www.youtube.com/@TheBrighteningchurch/live";

exports.handler = async function () {
  try {
    const res = await fetch(LIVE_PAGE_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
      },
    });
    const html = await res.text();

    const isLive = /"isLiveNow":true/.test(html);
    let videoId = null;
    if (isLive) {
      const m = html.match(/"videoId":"([\w-]{11})"/);
      videoId = m ? m[1] : null;
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
      },
      body: JSON.stringify({ live: isLive && !!videoId, videoId }),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ live: false, videoId: null, error: String(err) }),
    };
  }
};
