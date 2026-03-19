/** 구매 링크를 어필리에이트 링크로 변환 */

const COUPANG_PARTNER_ID = process.env.COUPANG_PARTNER_ID || "";
const COUPANG_SUB_ID = process.env.COUPANG_SUB_ID || "hotdeal-radar";

export function toAffiliateLink(url: string): string | null {
  if (!url) return null;

  // 쿠팡 링크 → 쿠팡파트너스 링크
  if (url.includes("coupang.com") && COUPANG_PARTNER_ID) {
    // 이미 파트너스 링크면 그대로
    if (url.includes("AFFSDP") || url.includes("partners.coupang.com")) {
      return url;
    }
    return `https://link.coupang.com/re/AFFSDP?lptag=AF${COUPANG_PARTNER_ID}&subid=${COUPANG_SUB_ID}&pageKey=0&traceid=V0-301&itemId=0&vendorItemId=0&url=${encodeURIComponent(url)}`;
  }

  // 네이버 → 네이버 커미션 (추후)
  // 11번가 → 11번가 어필리에이트 (추후)

  return null;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** 커뮤니티 글 본문에서 실제 구매 링크 추출 */
export async function extractProductUrl(dealLink: string): Promise<string | null> {
  try {
    const res = await fetch(dealLink, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;

    const html = await res.text();

    // 쿠팡 링크 추출
    const coupangMatch = html.match(/https?:\/\/[^\s"'<>]*coupang\.com[^\s"'<>]*/i);
    if (coupangMatch) return coupangMatch[0];

    // 네이버 쇼핑 링크
    const naverMatch = html.match(/https?:\/\/[^\s"'<>]*shopping\.naver\.com[^\s"'<>]*/i);
    if (naverMatch) return naverMatch[0];

    // 11번가
    const st11Match = html.match(/https?:\/\/[^\s"'<>]*11st\.co\.kr[^\s"'<>]*/i);
    if (st11Match) return st11Match[0];

    // 기타 쇼핑몰 링크
    const shopMatch = html.match(/https?:\/\/[^\s"'<>]*(?:gmarket|auction|ssg|kurly|musinsa|nike)\.com[^\s"'<>]*/i);
    if (shopMatch) return shopMatch[0];

    return null;
  } catch {
    return null;
  }
}
