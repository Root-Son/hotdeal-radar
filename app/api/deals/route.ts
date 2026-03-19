export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { crawlPpomppu, crawlFmkorea } from "@/lib/crawlers";
import { verifyDeals } from "@/lib/verifier";

export async function GET() {
  try {
    // 1. 뽐뿌 + 에펨코리아 동시 크롤링
    let ppomppuDeals: Awaited<ReturnType<typeof crawlPpomppu>>;
    let fmkoreaDeals: Awaited<ReturnType<typeof crawlFmkorea>>;
    try {
      ppomppuDeals = await crawlPpomppu(1);
    } catch (e) {
      console.error("Ppomppu crawl error:", String(e));
      ppomppuDeals = [];
    }
    try {
      fmkoreaDeals = await crawlFmkorea(1);
    } catch (e) {
      console.error("Fmkorea crawl error:", e);
      fmkoreaDeals = [];
    }
    console.log(`Crawled: ppomppu=${ppomppuDeals.length}, fmkorea=${fmkoreaDeals.length}`);

    const allDeals = [...ppomppuDeals, ...fmkoreaDeals];

    // 2. 가격 검증 (상위 15개만)
    const verified = await verifyDeals(allDeals, 15);

    return NextResponse.json({
      total: allDeals.length,
      verified: verified.length,
      deals: verified,
      crawledAt: new Date().toISOString(),
      debug: { ppomppu: ppomppuDeals.length, fmkorea: fmkoreaDeals.length },
    });
  } catch (error) {
    console.error("Deals API error:", error);
    return NextResponse.json(
      { error: "핫딜 수집 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}
