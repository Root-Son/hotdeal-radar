import { VerifiedDeal } from "./types";
import { saveSnapshot, getLowestEver } from "./supabase";

/** 네이버 쇼핑에서 인기 카테고리별 쿠팡 최저가 상품 수집 */
export async function fetchCoupangDeals(): Promise<VerifiedDeal[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return [];

  // 인기 검색어 목록
  const queries = [
    "무선이어폰", "로봇청소기", "에어프라이어", "전동칫솔",
    "닭가슴살", "프로틴", "비타민", "오메가3",
    "운동화", "크로스백", "선크림", "샴푸",
    "키보드", "마우스패드", "충전기", "보조배터리",
    "커피캡슐", "견과류", "세탁세제", "화장지",
    "텀블러", "물티슈", "치약", "핸드크림",
  ];

  const junk = /요금제|할부|약정|사은품|통신사|리퍼|중고|반품/i;
  const deals: VerifiedDeal[] = [];

  // 5개씩 병렬
  for (let i = 0; i < queries.length; i += 5) {
    const batch = queries.slice(i, i + 5);
    const batchResults = await Promise.all(
      batch.map(async (query) => {
        try {
          const res = await fetch(
            `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=30&sort=sim`,
            {
              headers: {
                "X-Naver-Client-Id": clientId,
                "X-Naver-Client-Secret": clientSecret,
              },
            }
          );
          if (!res.ok) return [];

          const data = await res.json();
          const items = (data.items || []).filter(
            (item: { title: string; lprice: string; mallName: string }) =>
              !junk.test(item.title) && parseInt(item.lprice) > 0
          );

          // 쿠팡 상품 찾기
          const coupangItems = items.filter(
            (item: { mallName: string; link: string }) =>
              item.mallName === "쿠팡" || item.link.includes("coupang.com")
          );

          // 쿠팡 외 상품들
          const otherItems = items.filter(
            (item: { mallName: string; link: string }) =>
              item.mallName !== "쿠팡" && !item.link.includes("coupang.com")
          );

          if (coupangItems.length === 0) return [];

          const best = coupangItems.sort(
            (a: { lprice: string }, b: { lprice: string }) =>
              parseInt(a.lprice) - parseInt(b.lprice)
          )[0];

          const coupangPrice = parseInt(best.lprice);
          const otherPrices = otherItems
            .map((i: { lprice: string }) => parseInt(i.lprice))
            .filter((p: number) => p > 0);
          const avgOther = otherPrices.length > 0
            ? Math.round(otherPrices.reduce((a: number, b: number) => a + b, 0) / otherPrices.length)
            : Math.round(coupangPrice * 1.25);

          const savingsRate = Math.max(0, Math.round(((avgOther - coupangPrice) / avgOther) * 100));
          if (savingsRate < 1) return []; // 쿠팡이 더 비싸면 제외

          const productKey = query.replace(/\s+/g, "_");

          // 스냅샷 저장
          try {
            await saveSnapshot({
              productKey,
              productName: best.title.replace(/<[^>]*>/g, ""),
              price: coupangPrice,
              productUrl: best.link,
              imageUrl: best.image,
            });
          } catch {}

          let isAllTimeLow = true;
          try {
            const lowest = await getLowestEver(productKey);
            isAllTimeLow = lowest === null || coupangPrice <= lowest;
          } catch {}

          let verdictLabel: string;
          let verdict: "mega" | "good" | "okay";
          if (isAllTimeLow && savingsRate >= 15) {
            verdict = "mega";
            verdictLabel = "🚨 역대 최저가";
          } else if (savingsRate >= 15) {
            verdict = "good";
            verdictLabel = "🔥 최근 30일 최저가";
          } else {
            verdict = "okay";
            verdictLabel = "⚡ 지금이 제일 싸요";
          }

          return [{
            id: `coupang_${productKey}`,
            title: best.title.replace(/<[^>]*>/g, ""),
            price: coupangPrice,
            store: "쿠팡",
            category: query,
            link: best.link,
            source: "뽐뿌" as const,
            upvotes: 0,
            comments: 0,
            postedAt: "",
            isSoldOut: false,
            imageUrl: best.image,
            productLink: best.link,
            verification: {
              type: isAllTimeLow ? "time" as const : "space" as const,
              normalPrice: avgOther,
              currentPrice: coupangPrice,
              savingsRate,
              savingsAmount: avgOther - coupangPrice,
              priceSource: `타 쇼핑몰 ${otherPrices.length}곳 평균`,
              verdict,
              verdictLabel,
            },
          }] as VerifiedDeal[];
        } catch {
          return [];
        }
      })
    );
    deals.push(...batchResults.flat());
  }

  // 절약률 높은 순 정렬
  return deals.sort((a, b) => b.verification.savingsRate - a.verification.savingsRate);
}
