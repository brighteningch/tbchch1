// 목사님 티스토리 블로그 RSS를 서버에서 대신 가져와 JSON으로 변환한다.
// 브라우저에서 직접 fetch하면 티스토리 RSS가 CORS를 막아서 이 함수를 거친다.
const FEED_URL = "https://eshallom.tistory.com/rss";

function stripHtml(html) {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractTag(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!m) return "";
  return m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "").trim();
}

exports.handler = async function () {
  try {
    const res = await fetch(FEED_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
    const xml = await res.text();
    const items = [];
    const itemBlocks = xml.split("<item>").slice(1);
    for (const block of itemBlocks.slice(0, 8)) {
      const title = extractTag(block, "title");
      const link = extractTag(block, "link");
      const pubDate = extractTag(block, "pubDate");
      const descRaw = extractTag(block, "description");
      const desc = stripHtml(descRaw).slice(0, 120);
      items.push({ title, link, pubDate, description: desc });
    }
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=1800",
      },
      body: JSON.stringify({ items }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(err) }),
    };
  }
};
