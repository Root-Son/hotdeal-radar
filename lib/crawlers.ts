import { HotDeal } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ─── 뽐뿌 핫딜 (모바일) ───

export async function crawlPpomppu(pages = 1): Promise<HotDeal[]> {
  const deals: HotDeal[] = [];

  for (let page = 1; page <= pages; page++) {
    const url = `https://m.ppomppu.co.kr/new/bbs_list.php?id=ppomppu&page=${page}`;
    let res;
    try {
      res = await fetch(url, { headers: { "User-Agent": UA }, cache: "no-store" });
    } catch (e) {
      console.error("Ppomppu fetch error:", e);
      continue;
    }
    if (!res.ok) {
      console.error("Ppomppu HTTP error:", res.status);
      continue;
    }

    // euc-kr 디코딩 — Node.js의 TextDecoder는 euc-kr 지원
    const buffer = Buffer.from(await res.arrayBuffer());
    const html = new TextDecoder("euc-kr").decode(buffer);

    // 1단계: 모든 링크 위치 찾기
    const linkRegex = /href="(\/new\/bbs_view\.php\?[^"]+)"[^>]*class="list_b_01n"/g;
    let m;
    while ((m = linkRegex.exec(html)) !== null) {
      const relLink = m[1];
      const noMatch = relLink.match(/no=(\d+)/);
      const no = noMatch?.[1] || String(Date.now());
      // 링크 위치에서 1500자 블록
      const block = html.slice(m.index, m.index + 1500);

      // 제목: <span class="cont" ~ 다음 </li> 사이의 텍스트
      const contMatch = block.match(/<span class="cont"[^>]*>([\s\S]*?)<\/span>\s*(?:<span class="rp">|<\/li>)/);
      if (!contMatch) continue;
      const contHtml = contMatch[1];
      let title = contHtml.replace(/<[^>]*>/g, "").trim();

      // 스토어
      const storeMatch = contHtml.match(/\[([^\]]+)\]/);
      const store = storeMatch?.[1] || "";
      title = title.replace(/^\[[^\]]+\]\s*/, "").trim();

      // 가격
      const priceMatch = title.match(/([\d,]+)\s*원/);
      const price = priceMatch ? parseInt(priceMatch[1].replace(/,/g, "")) : 0;

      // 품절
      const isSoldOut = contHtml.includes("line-through");

      // 댓글
      const rpMatch = block.match(/<span class="rp">(\d+)<\/span>/);
      const comments = parseInt(rpMatch?.[1] || "0");

      // 시간
      const timeMatch = block.match(/<time>([^<]+)<\/time>/);
      const postedAt = timeMatch?.[1] || "";

      if (title) {
        deals.push({
          id: `ppomppu_${no}`,
          title,
          price,
          store,
          category: "",
          link: `https://m.ppomppu.co.kr${relLink}`,
          source: "뽐뿌",
          upvotes: 0,
          comments,
          postedAt,
          isSoldOut,
          imageUrl: undefined,
        });
      }
    }
  }
  return deals;
}

// ─── 에펨코리아 핫딜 ───

export async function crawlFmkorea(pages = 1): Promise<HotDeal[]> {
  const deals: HotDeal[] = [];

  for (let page = 1; page <= pages; page++) {
    const url =
      page === 1
        ? "https://www.fmkorea.com/hotdeal"
        : `https://www.fmkorea.com/index.php?mid=hotdeal&page=${page}`;

    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) continue;

    const html = await res.text();

    // 각 게시글 파싱
    const postRegex =
      /<li\s+class="li\s[^"]*"[^>]*>[\s\S]*?<\/li>/g;
    let match;

    while ((match = postRegex.exec(html)) !== null) {
      const block = match[0];

      // 제목 + 링크
      const titleMatch = block.match(
        /<h3[^>]*class="title"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>[\s\S]*?<span[^>]*class="ellipsis-target"[^>]*>([\s\S]*?)<\/span>/
      );
      if (!titleMatch) continue;

      const relLink = titleMatch[1];
      const title = titleMatch[2].replace(/<[^>]*>/g, "").trim();

      // 추천수
      const votesMatch = block.match(
        /class="count">(\d+)<\/span>/
      );
      const upvotes = parseInt(votesMatch?.[1] || "0");

      // 가격
      const priceMatch = block.match(
        /가격:[\s\S]*?class="strong">([\d,]+)원?<\/a>/
      );
      const price = priceMatch
        ? parseInt(priceMatch[1].replace(/,/g, ""))
        : 0;

      // 스토어
      const storeMatch = block.match(
        /쇼핑몰:[\s\S]*?class="strong">([^<]+)<\/a>/
      );
      const store = storeMatch?.[1]?.trim() || "";

      // 카테고리
      const catMatch = block.match(
        /class="category"><a[^>]*>([^<]+)<\/a>/
      );
      const category = catMatch?.[1] || "";

      // 댓글수
      const commentMatch = block.match(
        /class="comment_count">\[(\d+)\]/
      );
      const comments = parseInt(commentMatch?.[1] || "0");

      // 시간
      const timeMatch = block.match(
        /class="regdate">([^<]+)<\/span>/
      );
      const postedAt = timeMatch?.[1]?.trim() || "";

      // 품절
      const isSoldOut =
        block.includes("품절") || block.includes("line-through");

      // 이미지
      const imgMatch = block.match(
        /data-original="([^"]+)"/
      );
      const imageUrl = imgMatch?.[1]
        ? (imgMatch[1].startsWith("//") ? "https:" + imgMatch[1] : imgMatch[1])
        : undefined;

      const docId = relLink.replace(/\//g, "");

      if (title) {
        deals.push({
          id: `fmkorea_${docId}`,
          title,
          price,
          store,
          category,
          link: `https://www.fmkorea.com${relLink}`,
          source: "에펨코리아",
          upvotes,
          comments,
          postedAt,
          isSoldOut,
          imageUrl,
        });
      }
    }
  }

  return deals;
}
