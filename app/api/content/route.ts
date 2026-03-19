import { NextResponse } from "next/server";
import { crawlPpomppu, crawlFmkorea } from "@/lib/crawlers";
import { verifyDeals } from "@/lib/verifier";
import { generateDailyContent } from "@/lib/content";
import { toAffiliateLink, extractProductUrl } from "@/lib/affiliate";

export async function GET() {
  try {
    // 1. 크롤링
    const [ppomppuDeals, fmkoreaDeals] = await Promise.all([
      crawlPpomppu(2),
      crawlFmkorea(2),
    ]);

    // 2. 검증
    const verified = await verifyDeals(
      [...ppomppuDeals, ...fmkoreaDeals],
      10
    );

    // 3. 콘텐츠 생성 (상위 5개)
    const withContent = await generateDailyContent(verified, 5);

    // 4. 구매 링크 추출 + 어필리에이트 변환 (하나씩, 실패해도 계속)
    const final = [];
    for (const deal of withContent) {
      let productUrl: string | null = null;
      try {
        productUrl = await extractProductUrl(deal.link);
      } catch { /* 실패하면 원본 링크 사용 */ }

      const affiliate = productUrl ? toAffiliateLink(productUrl) : null;
      final.push({
        ...deal,
        productLink: productUrl || deal.link,
        affiliateLink: affiliate || productUrl || deal.link,
      });
    }

    return NextResponse.json({
      date: new Date().toISOString().split("T")[0],
      count: final.length,
      deals: final.map((d) => ({
        title: d.title,
        price: d.price,
        store: d.store,
        source: d.source,
        category: d.category,
        link: d.link,
        affiliateLink: d.affiliateLink,
        verification: d.verification,
        content: d.content,
      })),
    });
  } catch (error) {
    console.error("Content API error:", error);
    return NextResponse.json(
      { error: "콘텐츠 생성 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
