/** 쿠팡 URL을 파트너스 링크로 변환 */

const COUPANG_PARTNER_ID = process.env.COUPANG_PARTNER_ID || "";
const COUPANG_SUB_ID = process.env.COUPANG_SUB_ID || "hotdeal-radar";

export function toAffiliateLink(url: string): string | null {
  if (!url || !COUPANG_PARTNER_ID) return null;

  // 이미 파트너스 링크면 그대로
  if (url.includes("AFFSDP") || url.includes("partners.coupang.com")) {
    return url;
  }

  // 쿠팡 링크 → 파트너스 변환
  if (url.includes("coupang.com")) {
    return `https://link.coupang.com/re/AFFSDP?lptag=${COUPANG_PARTNER_ID}&subid=${COUPANG_SUB_ID}&pageKey=0&traceid=V0-301&itemId=0&vendorItemId=0&url=${encodeURIComponent(url)}`;
  }

  // 쿠팡이 아닌 링크 → 쿠팡 검색으로 리다이렉트
  return null;
}

/** 제품명으로 쿠팡 검색 파트너스 링크 생성 */
export function toCoupangSearchLink(query: string): string | null {
  if (!COUPANG_PARTNER_ID) return null;
  const searchUrl = `https://www.coupang.com/np/search?component=&q=${encodeURIComponent(query)}`;
  return `https://link.coupang.com/re/AFFSDP?lptag=${COUPANG_PARTNER_ID}&subid=${COUPANG_SUB_ID}&pageKey=0&traceid=V0-301&itemId=0&vendorItemId=0&url=${encodeURIComponent(searchUrl)}`;
}

/** 커뮤니티 글에서 구매 링크 추출 (더 이상 필요 없지만 호환성 유지) */
export async function extractProductUrl(dealLink: string): Promise<string | null> {
  try {
    const res = await fetch(dealLink, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    });
    if (!res.ok) return null;
    const html = await res.text();
    const coupangMatch = html.match(/https?:\/\/[^\s"'<>]*coupang\.com[^\s"'<>]*/i);
    return coupangMatch ? coupangMatch[0] : null;
  } catch {
    return null;
  }
}
