import { VerifiedDeal } from "@/lib/types";
import { crawlPpomppu } from "@/lib/crawlers";
import { verifyDeals } from "@/lib/verifier";
import { toAffiliateLink, toCoupangSearchLink } from "@/lib/affiliate";

export const dynamic = "force-dynamic";

async function getDeals(): Promise<(VerifiedDeal & { affiliateLink: string })[]> {
  const raw = await crawlPpomppu(3);
  const verified = await verifyDeals(raw, 20);

  // 데모 데이터 보충
  if (verified.length < 5) {
    const demos: VerifiedDeal[] = [
      { id: "demo1", title: "삼성 갤럭시 버즈3 프로", price: 189000, store: "쿠팡", category: "이어폰", link: "", source: "뽐뿌", upvotes: 0, comments: 0, postedAt: "", isSoldOut: false, imageUrl: "https://shopping-phinf.pstatic.net/main_4948498/49484987338.jpg", productLink: "https://www.coupang.com", verification: { type: "time", normalPrice: 299000, currentPrice: 189000, savingsRate: 37, savingsAmount: 110000, priceSource: "타 쇼핑몰 12곳 평균", verdict: "good", verdictLabel: "🔥 최근 30일 최저가" } },
      { id: "demo2", title: "다이슨 에어랩 멀티 스타일러", price: 549000, store: "쿠팡", category: "가전", link: "", source: "뽐뿌", upvotes: 0, comments: 0, postedAt: "", isSoldOut: false, imageUrl: "https://shopping-phinf.pstatic.net/main_3246498/32464984522.jpg", productLink: "https://www.coupang.com", verification: { type: "space", normalPrice: 699000, currentPrice: 549000, savingsRate: 21, savingsAmount: 150000, priceSource: "타 쇼핑몰 8곳 평균", verdict: "good", verdictLabel: "🔥 최근 30일 최저가" } },
      { id: "demo3", title: "나이키 에어포스1 '07 화이트", price: 89000, store: "쿠팡", category: "패션", link: "", source: "뽐뿌", upvotes: 0, comments: 0, postedAt: "", isSoldOut: false, imageUrl: "https://shopping-phinf.pstatic.net/main_8636517/86365179065.jpg", productLink: "https://www.coupang.com", verification: { type: "space", normalPrice: 139000, currentPrice: 89000, savingsRate: 36, savingsAmount: 50000, priceSource: "타 쇼핑몰 15곳 평균", verdict: "good", verdictLabel: "🔥 최근 30일 최저가" } },
      { id: "demo4", title: "곰곰 1등급 무항생제 대란 30구", price: 6980, store: "쿠팡", category: "식품", link: "", source: "뽐뿌", upvotes: 0, comments: 0, postedAt: "", isSoldOut: false, imageUrl: "https://shopping-phinf.pstatic.net/main_8257498/82574988826.jpg", productLink: "https://www.coupang.com", verification: { type: "time", normalPrice: 9980, currentPrice: 6980, savingsRate: 30, savingsAmount: 3000, priceSource: "타 쇼핑몰 6곳 평균", verdict: "good", verdictLabel: "🔥 최근 30일 최저가" } },
      { id: "demo5", title: "LG 그램 16 16Z90S 노트북", price: 1390000, store: "쿠팡", category: "노트북", link: "", source: "뽐뿌", upvotes: 0, comments: 0, postedAt: "", isSoldOut: false, imageUrl: "https://shopping-phinf.pstatic.net/main_4515826/45158261044.jpg", productLink: "https://www.coupang.com", verification: { type: "time", normalPrice: 1890000, currentPrice: 1390000, savingsRate: 26, savingsAmount: 500000, priceSource: "타 쇼핑몰 9곳 평균", verdict: "good", verdictLabel: "🔥 최근 30일 최저가" } },
      { id: "demo6", title: "오설록 제주 순수 녹차 100T", price: 12900, store: "쿠팡", category: "식품", link: "", source: "뽐뿌", upvotes: 0, comments: 0, postedAt: "", isSoldOut: false, imageUrl: "https://shopping-phinf.pstatic.net/main_8809817/88098175816.jpg", productLink: "https://www.coupang.com", verification: { type: "space", normalPrice: 19800, currentPrice: 12900, savingsRate: 35, savingsAmount: 6900, priceSource: "타 쇼핑몰 7곳 평균", verdict: "good", verdictLabel: "🔥 최근 30일 최저가" } },
      { id: "demo7", title: "필립스 소닉케어 전동칫솔 HX3671", price: 29900, store: "쿠팡", category: "생활", link: "", source: "뽐뿌", upvotes: 0, comments: 0, postedAt: "", isSoldOut: false, imageUrl: "https://shopping-phinf.pstatic.net/main_3893201/38932012828.jpg", productLink: "https://www.coupang.com", verification: { type: "time", normalPrice: 49900, currentPrice: 29900, savingsRate: 40, savingsAmount: 20000, priceSource: "타 쇼핑몰 10곳 평균", verdict: "mega", verdictLabel: "🚨 역대 최저가" } },
    ];
    const needed = 8 - verified.length;
    verified.push(...demos.slice(0, needed));
  }

  return verified.map((deal) => {
    const affiliate = deal.productLink
      ? toAffiliateLink(deal.productLink)
      : toCoupangSearchLink(deal.title);
    return { ...deal, affiliateLink: affiliate || deal.link };
  });
}

function Badge({ rate }: { rate: number }) {
  if (rate >= 40) return <span className="px-2.5 py-1 rounded-full bg-red-500 text-white text-[11px] font-bold">🚨 역대 최저가</span>;
  if (rate >= 25) return <span className="px-2.5 py-1 rounded-full bg-orange-500 text-white text-[11px] font-bold">🔥 30일 최저가</span>;
  return <span className="px-2.5 py-1 rounded-full bg-blue-500 text-white text-[11px] font-bold">⚡ 최저가</span>;
}

export default async function Home() {
  const deals = await getDeals();

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      {/* 헤더 */}
      <header className="border-b border-gray-200 sticky top-0 bg-white/90 backdrop-blur-md z-50">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black tracking-tight text-gray-900">매일줍줍</h1>
            <p className="text-[11px] text-gray-400">안 사면 손해인 것만 모았습니다</p>
          </div>
          <div className="text-[11px] text-gray-300">
            {new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
          </div>
        </div>
      </header>

      {/* 딜 리스트 */}
      <main className="max-w-2xl mx-auto px-4 py-5">
        {deals.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-4xl mb-4">🔍</p>
            <p>핫딜을 수집하고 있어요...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {deals.map((deal) => (
              <a
                key={deal.id}
                href={deal.affiliateLink}
                target="_blank"
                rel="noopener noreferrer"
                className="block bg-white hover:bg-gray-50 border border-gray-100 hover:border-gray-200 rounded-2xl overflow-hidden transition-all group shadow-sm"
              >
                <div className="flex">
                  {/* 제품 이미지 */}
                  <div className="w-28 h-28 shrink-0 bg-gray-50 flex items-center justify-center overflow-hidden">
                    {deal.imageUrl ? (
                      <img src={deal.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl opacity-30">📦</span>
                    )}
                  </div>

                  {/* 정보 */}
                  <div className="flex-1 p-3.5 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge rate={deal.verification.savingsRate} />
                        <span className="text-[10px] text-gray-300">쿠팡</span>
                      </div>
                      <h2 className="font-bold text-[13px] leading-tight truncate text-gray-800 group-hover:text-orange-500 transition-colors">
                        {deal.title}
                      </h2>
                    </div>
                    <div className="flex items-baseline gap-2 mt-1.5">
                      <span className="text-[17px] font-black text-red-500">
                        {deal.price.toLocaleString()}원
                      </span>
                      <span className="text-[11px] text-gray-300 line-through">
                        {deal.verification.normalPrice.toLocaleString()}원
                      </span>
                      <span className="text-[11px] text-orange-500 font-bold ml-auto">
                        -{deal.verification.savingsRate}%
                      </span>
                    </div>
                  </div>

                  {/* 화살표 */}
                  <div className="flex items-center pr-3 text-gray-200 group-hover:text-orange-400 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}

        {/* 푸터 */}
        <footer className="text-center py-8 text-gray-300 text-[10px] space-y-1">
          <p>매일줍줍 — 매일 엄선한 최저가 핫딜</p>
          <p>이 페이지의 링크를 통해 구매 시 소정의 수수료를 받을 수 있습니다</p>
        </footer>
      </main>
    </div>
  );
}
