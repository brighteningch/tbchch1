// 목사님 티스토리 블로그의 '성경공부' 카테고리 게시글 목록을 서버에서 대신 가져와 JSON으로 변환한다.
// 티스토리는 카테고리별 RSS를 제공하지 않아서, RSS(tistory-feed.js)와 달리 카테고리 페이지 HTML을 직접 읽어 파싱한다.
const CATEGORY_URL = "https://eshallom.tistory.com/category/%EC%84%B1%EA%B2%BD%EA%B3%B5%EB%B6%80";

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

exports.handler = async function () {
  try {
    const res = await fetch(CATEGORY_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
    const html = await res.text();
    const items = [];
    const blocks = html.split('<div class="post-item').slice(1);
    for (const block of blocks.slice(0, 12)) {
      const linkMatch = block.match(/href="(\/[0-9]+)"/);
      const titleMatch = block.match(/<span class="title">([\s\S]*?)<\/span>/);
      const excerptMatch = block.match(/<span class="excerpt">([\s\S]*?)<\/span>/);
      const dateMatch = block.match(/<span class="date">([\s\S]*?)<\/span>/);
      if (!linkMatch || !titleMatch) continue;
      items.push({
        title: stripHtml(titleMatch[1]),
        link: "https://eshallom.tistory.com" + linkMatch[1],
        date: dateMatch ? stripHtml(dateMatch[1]) : "",
        excerpt: excerptMatch ? stripHtml(excerptMatch[1]).slice(0, 120) : "",
      });
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
