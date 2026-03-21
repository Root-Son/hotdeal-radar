import { VerifiedDeal } from "@/lib/types";
import { fetchCoupangDeals } from "@/lib/coupang-deals";
import { toAffiliateLink, toCoupangSearchLink } from "@/lib/affiliate";

export const dynamic = "force-dynamic";

async function getDeals(): Promise<(VerifiedDeal & { affiliateLink: string })[]> {
  const verified = await fetchCoupangDeals();

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

const CELEB_PICKS = [
  { celeb: "장원영", product: "어뮤즈 젤핏 틴트", price: 17000, image: "https://shopping-phinf.pstatic.net/main_8940434/89404340332.1.jpg", video: "https://youtube.com/shorts/WlMUem4lwFU", query: "어뮤즈 젤핏 틴트" },
  { celeb: "정국", product: "라네즈 립 글로이 밤 거미베어", price: 12920, image: "https://shopping-phinf.pstatic.net/main_8636517/86365179065.jpg", video: "https://youtube.com/shorts/TfflcZ8pVwk", query: "라네즈 립 글로이 밤 거미베어" },
  { celeb: "제니", product: "옥 페이셜 마사지 롤러", price: 7820, image: "https://shopping-phinf.pstatic.net/main_3893201/38932012828.jpg", video: "https://youtube.com/shorts/EAM88zVKGlo", query: "옥 페이셜 마사지 롤러" },
  { celeb: "태연", product: "마비스 치약", price: 16900, image: "https://shopping-phinf.pstatic.net/main_8809817/88098175816.jpg", video: "https://youtube.com/shorts/6GMhyE2dDkw", query: "마비스 치약" },
  { celeb: "태연", product: "에르메스 H24 향수", price: 102900, image: "https://shopping-phinf.pstatic.net/main_4515826/45158261044.jpg", video: "https://youtube.com/shorts/tjRRugK_N0A", query: "에르메스 H24 향수" },
];

export default async function Home() {
  const deals = await getDeals();
  const pid = "AF6424400";

  return (
    <div className="min-h-screen bg-[#f5f5f5]">
      {/* 헤더 */}
      <header className="border-b border-gray-200 sticky top-0 bg-white/90 backdrop-blur-md z-50">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black tracking-tight text-gray-900">매일줍줍</h1>
            <p className="text-[11px] text-gray-400">셀럽 추천템 + 최저가 핫딜</p>
          </div>
          <a href="https://www.youtube.com/@maeil_jupjup" target="_blank" rel="noopener noreferrer" className="text-[11px] text-red-500 font-bold">YouTube ▸</a>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        {/* 셀럽 추천템 */}
        <section className="mb-8">
          <h2 className="text-lg font-black text-gray-900 mb-3">🔥 셀럽 추천템</h2>
          <div className="space-y-3">
            {CELEB_PICKS.map((pick) => {
              const cUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(pick.query)}`;
              const affLink = `https://link.coupang.com/re/AFFSDP?lptag=${pid}&subid=celeb&url=${encodeURIComponent(cUrl)}`;
              return (
                <div key={pick.celeb + pick.product} className="bg-white border border-gray-100 rounded-2xl overflow-hidden shadow-sm">
                  <div className="flex">
                    <div className="w-28 h-28 shrink-0 bg-gray-50 flex items-center justify-center overflow-hidden">
                      <img src={`/api/img?url=${encodeURIComponent(pick.image)}`} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="flex-1 p-3.5 min-w-0 flex flex-col justify-between">
                      <div>
                        <span className="px-2 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">{pick.celeb} PICK</span>
                        <h3 className="font-bold text-[13px] leading-tight mt-1.5 text-gray-800">{pick.product}</h3>
                      </div>
                      <div className="text-[17px] font-black text-red-500">{pick.price.toLocaleString()}원</div>
                    </div>
                  </div>
                  <div className="flex gap-2 px-3.5 pb-3">
                    <a href={affLink} target="_blank" rel="noopener noreferrer" className="flex-1 text-center bg-blue-50 hover:bg-blue-100 rounded-xl px-3 py-2 text-[12px] text-blue-600 font-bold transition-colors">
                      쿠팡에서 구매하기
                    </a>
                    <a href={pick.video} target="_blank" rel="noopener noreferrer" className="flex-1 text-center bg-red-50 hover:bg-red-100 rounded-xl px-3 py-2 text-[12px] text-red-500 font-bold transition-colors">
                      영상 보기
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 핫딜 리스트 */}
        <section>
          <h2 className="text-lg font-black text-gray-900 mb-3">⚡ 오늘의 핫딜</h2>
          {deals.length === 0 ? (
            <div className="text-center py-10 text-gray-400">
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
                      <img src={`/api/img?url=${encodeURIComponent(deal.imageUrl!)}`} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl opacity-30">📦</span>
                    )}
                  </div>

                  {/* 정보 */}
                  <div className="flex-1 p-3.5 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge rate={deal.verification.savingsRate} />
                        <span className="text-[11px] text-blue-500 font-medium">쿠팡</span>
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

                </div>
                {/* 쿠팡 구매 버튼 */}
                <div className="px-3.5 pb-3">
                  <div className="flex items-center justify-between bg-blue-50 rounded-xl px-3 py-2">
                    <span className="text-[11px] text-blue-600 font-bold">쿠팡에서 구매하기</span>
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </div>
                </div>
              </a>
            ))}
          </div>
          )}
        </section>

        {/* 푸터 */}
        <footer className="text-center py-8 text-gray-500 text-xs space-y-2">
          <p className="font-medium text-gray-600">매일줍줍 — 매일 엄선한 최저가 핫딜</p>
          <p>이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다</p>
          <p>© 2026 매일줍줍 · 쿠팡파트너스 ID: AF6424400</p>
        </footer>
      </main>
    </div>
  );
}
