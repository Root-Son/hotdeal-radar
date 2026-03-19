import { HotDeal, VerifiedDeal } from "./types";
import { saveSnapshot, getPriceHistory, getLowestEver } from "./supabase";

interface NaverShopItem {
  title: string;
  link: string;
  image: string;
  lprice: string;
  mallName: string;
  productType: string;
}

interface CoupangMatch {
  coupangPrice: number;
  coupangLink: string;
  coupangImage: string;
  coupangTitle: string;
  avgOtherPrice: number;  // 쿠팡 외 평균가
  otherCount: number;
}

/** 네이버 쇼핑에서 쿠팡 가격 + 타 쇼핑몰 평균가 조회 */
async function findCoupangDeal(query: string): Promise<CoupangMatch | null> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch(
    `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=40&sort=sim`,
    {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    }
  );

  if (!res.ok) return null;

  const data = await res.json();
  const junk = /요금제|할부|약정|사은품|통신사/i;
  const items: NaverShopItem[] = (data.items || []).filter(
    (i: NaverShopItem) => parseInt(i.lprice) > 0 && !junk.test(i.title)
  );

  if (items.length === 0) return null;

  // 쿠팡 상품 찾기
  const coupangItems = items.filter((i) =>
    i.mallName === "쿠팡" || i.link.includes("coupang.com")
  );

  // 쿠팡 외 상품들
  const otherItems = items.filter((i) =>
    i.mallName !== "쿠팡" && !i.link.includes("coupang.com")
  );

  if (coupangItems.length === 0) return null;

  // 쿠팡 최저가
  const coupangSorted = coupangItems.sort(
    (a, b) => parseInt(a.lprice) - parseInt(b.lprice)
  );
  const best = coupangSorted[0];
  const coupangPrice = parseInt(best.lprice);

  // 타 쇼핑몰 평균가
  const otherPrices = otherItems.map((i) => parseInt(i.lprice)).filter((p) => p > 0);
  const avgOtherPrice = otherPrices.length > 0
    ? Math.round(otherPrices.reduce((a, b) => a + b, 0) / otherPrices.length)
    : 0;

  return {
    coupangPrice,
    coupangLink: best.link,
    coupangImage: best.image,
    coupangTitle: best.title.replace(/<[^>]*>/g, ""),
    avgOtherPrice,
    otherCount: otherPrices.length,
  };
}

/** 딜 검증: 쿠팡에서 진짜 싼지 확인 */
export async function verifyDeal(deal: HotDeal): Promise<VerifiedDeal | null> {
  if (deal.price <= 0) return null;

  // 검색 키워드 정제
  const searchQuery = deal.title
    .replace(/[\d,]+\s*원/g, "")
    .replace(/\d+개|무료배송|할인|특가|최저가|네멤|무배/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 35);

  const match = await findCoupangDeal(searchQuery);

  // 쿠팡에 없으면 제외
  if (!match) return null;

  // 비교 기준: 쿠팡 가격 vs 타 쇼핑몰 평균가
  const referencePrice = match.avgOtherPrice > 0 ? match.avgOtherPrice : deal.price * 1.3;
  const savingsAmount = referencePrice - match.coupangPrice;
  const savingsRate = Math.round((savingsAmount / referencePrice) * 100);

  // 쿠팡이 타 쇼핑몰보다 비싸면 제외
  if (savingsRate < 5) return null;

  // 제품 키 생성 (제목 기반 정규화)
  const productKey = searchQuery.replace(/\s+/g, "_").toLowerCase();

  // 스냅샷 저장 + 히스토리 조회 (실패해도 계속 진행)
  let isAllTimeLow = true;
  let history: { date: string; price: number }[] = [];
  try {
    await saveSnapshot({
      productKey,
      productName: match.coupangTitle,
      price: match.coupangPrice,
      productUrl: match.coupangLink,
      imageUrl: match.coupangImage,
    });
    const lowestEver = await getLowestEver(productKey);
    isAllTimeLow = lowestEver === null || match.coupangPrice <= lowestEver;
    history = await getPriceHistory(productKey, 30);
  } catch {
    // Supabase 실패해도 딜 자체는 보여줌
  }

  let verdict: VerifiedDeal["verification"]["verdict"];
  let verdictLabel: string;

  if (isAllTimeLow && savingsRate >= 20) {
    verdict = "mega";
    verdictLabel = "🚨 역대 최저가";
  } else if (savingsRate >= 30) {
    verdict = "mega";
    verdictLabel = "🔥 최근 30일 최저가";
  } else if (savingsRate >= 15) {
    verdict = "good";
    verdictLabel = "🔥 최근 30일 최저가";
  } else {
    verdict = "okay";
    verdictLabel = "⚡ 지금이 제일 싸요";
  }

  return {
    ...deal,
    price: match.coupangPrice,
    imageUrl: match.coupangImage,
    productLink: match.coupangLink,
    verification: {
      type: isAllTimeLow ? "time" : "space",
      normalPrice: referencePrice,
      currentPrice: match.coupangPrice,
      savingsRate,
      savingsAmount,
      priceSource: match.otherCount > 0
        ? `타 쇼핑몰 ${match.otherCount}곳 평균`
        : "시장 평균 추정",
      verdict,
      verdictLabel,
    },
    priceHistory: history,
  };
}

/** 여러 딜 검증 — 쿠팡에서 싼 것만 남김 */
export async function verifyDeals(
  deals: HotDeal[],
  limit = 15
): Promise<VerifiedDeal[]> {
  const candidates = deals
    .filter((d) => d.price > 0 && !d.isSoldOut)
    .sort((a, b) => b.upvotes - a.upvotes)
    .slice(0, limit);

  const results = await Promise.all(candidates.map(verifyDeal));

  return results
    .filter((d): d is VerifiedDeal => d !== null)
    .sort((a, b) => b.verification.savingsRate - a.verification.savingsRate);
}
