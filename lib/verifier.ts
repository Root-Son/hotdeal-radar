import { HotDeal, VerifiedDeal } from "./types";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** 네이버 쇼핑에서 동일 제품의 일반 판매가 조회 */
async function getNaverPrice(
  query: string
): Promise<{ avgPrice: number; lowestPrice: number; count: number }> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return { avgPrice: 0, lowestPrice: 0, count: 0 };

  const res = await fetch(
    `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=20&sort=sim`,
    {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    }
  );

  if (!res.ok) return { avgPrice: 0, lowestPrice: 0, count: 0 };

  const data = await res.json();
  const items = (data.items || [])
    .map((i: { lprice: string; productType: string }) => ({
      price: parseInt(i.lprice) || 0,
      type: i.productType,
    }))
    .filter((i: { price: number }) => i.price > 0);

  // 요금제/번들 제거
  const junk = /요금제|할부|약정|사은품/i;
  const filtered = (data.items || [])
    .filter((i: { title: string }) => !junk.test(i.title))
    .map((i: { lprice: string }) => parseInt(i.lprice) || 0)
    .filter((p: number) => p > 0);

  if (filtered.length === 0) return { avgPrice: 0, lowestPrice: 0, count: 0 };

  const sorted = [...filtered].sort((a: number, b: number) => a - b);
  const avg = Math.round(sorted.reduce((a: number, b: number) => a + b, 0) / sorted.length);

  return {
    avgPrice: avg,
    lowestPrice: sorted[0],
    count: sorted.length,
  };
}

/** 딜 가격을 시장가와 비교해서 검증 */
export async function verifyDeal(deal: HotDeal): Promise<VerifiedDeal> {
  if (deal.price <= 0) {
    return {
      ...deal,
      verification: {
        type: "space",
        normalPrice: 0,
        currentPrice: deal.price,
        savingsRate: 0,
        savingsAmount: 0,
        priceSource: "",
        verdict: "okay",
        verdictLabel: "가격 정보 없음",
      },
    };
  }

  // 제목에서 검색 키워드 추출 (가격, 수량 정보 제거)
  const searchQuery = deal.title
    .replace(/[\d,]+원/g, "")
    .replace(/\d+개|무료배송|할인|특가|최저가/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40);

  const naverData = await getNaverPrice(searchQuery);

  if (naverData.avgPrice <= 0) {
    return {
      ...deal,
      verification: {
        type: "space",
        normalPrice: 0,
        currentPrice: deal.price,
        savingsRate: 0,
        savingsAmount: 0,
        priceSource: "비교 불가",
        verdict: "okay",
        verdictLabel: "시세 비교 어려움",
      },
    };
  }

  // 공간축 비교: 다른 사이트 평균가 vs 이 딜 가격
  const savingsAmount = naverData.avgPrice - deal.price;
  const savingsRate = Math.round((savingsAmount / naverData.avgPrice) * 100);

  let verdict: VerifiedDeal["verification"]["verdict"];
  let verdictLabel: string;

  if (savingsRate >= 40) {
    verdict = "mega";
    verdictLabel = "🔥 역대급 핫딜";
  } else if (savingsRate >= 20) {
    verdict = "good";
    verdictLabel = "✅ 사면 이득";
  } else if (savingsRate >= 5) {
    verdict = "okay";
    verdictLabel = "👀 조금 저렴";
  } else {
    verdict = "fake";
    verdictLabel = "❌ 별로 안 싸요";
  }

  return {
    ...deal,
    verification: {
      type: "space",
      normalPrice: naverData.avgPrice,
      currentPrice: deal.price,
      savingsRate,
      savingsAmount,
      priceSource: `네이버 쇼핑 ${naverData.count}개 판매처 평균`,
      verdict,
      verdictLabel,
    },
  };
}

/** 여러 딜을 병렬 검증 */
export async function verifyDeals(
  deals: HotDeal[],
  limit = 10
): Promise<VerifiedDeal[]> {
  // 가격 있는 것만, 추천수 높은 순으로 정렬
  const candidates = deals
    .filter((d) => d.price > 0 && !d.isSoldOut)
    .sort((a, b) => b.upvotes - a.upvotes)
    .slice(0, limit);

  const results = await Promise.all(candidates.map(verifyDeal));

  // 이득인 것만 필터 + 절약률 높은 순
  return results
    .filter((d) => d.verification.verdict !== "fake")
    .sort((a, b) => b.verification.savingsRate - a.verification.savingsRate);
}
