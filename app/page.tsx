import { VerifiedDeal } from "@/lib/types";
import { crawlPpomppu } from "@/lib/crawlers";
import { verifyDeals } from "@/lib/verifier";
import { toAffiliateLink, toCoupangSearchLink } from "@/lib/affiliate";

export const revalidate = 600; // 10분마다 갱신

async function getDeals(): Promise<(VerifiedDeal & { affiliateLink: string })[]> {
  const raw = await crawlPpomppu(2);
  // verifyDeals가 이제 쿠팡 가격/이미지/링크를 직접 가져옴
  const verified = await verifyDeals(raw, 20);

  return verified.map((deal) => {
    // 쿠팡 직링크 → 파트너스 링크 변환
    const affiliate = deal.productLink
      ? toAffiliateLink(deal.productLink)
      : toCoupangSearchLink(deal.title);

    return {
      ...deal,
      affiliateLink: affiliate || deal.link,
    };
  });
}

function Badge({ rate }: { rate: number }) {
  if (rate >= 40) return <span className="px-2.5 py-1 rounded-full bg-red-500/90 text-white text-[11px] font-bold">🚨 역대 최저가</span>;
  if (rate >= 25) return <span className="px-2.5 py-1 rounded-full bg-orange-500/90 text-white text-[11px] font-bold">🔥 30일 최저가</span>;
  return <span className="px-2.5 py-1 rounded-full bg-emerald-600/90 text-white text-[11px] font-bold">⚡ 최저가</span>;
}

export default async function Home() {
  const deals = await getDeals();

  return (
    <div className="min-h-screen">
      <header className="border-b border-white/10 sticky top-0 bg-[#0a0a0a]/90 backdrop-blur-md z-50">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black tracking-tight">매일줍줍</h1>
            <p className="text-[11px] text-white/40">안 사면 손해인 것만 모았습니다</p>
          </div>
          <div className="text-[11px] text-white/25">
            {new Date().toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-5">
        {deals.length === 0 ? (
          <div className="text-center py-20 text-white/30">
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
                className="block bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-white/[0.12] rounded-2xl overflow-hidden transition-all group"
              >
                <div className="flex">
                  <div className="w-28 h-28 shrink-0 bg-white/[0.02] flex items-center justify-center overflow-hidden">
                    {deal.imageUrl ? (
                      <img src={deal.imageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl opacity-30">📦</span>
                    )}
                  </div>
                  <div className="flex-1 p-3.5 min-w-0 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1.5">
                        <Badge rate={deal.verification.savingsRate} />
                        <span className="text-[10px] text-white/15">쿠팡</span>
                      </div>
                      <h2 className="font-bold text-[13px] leading-tight truncate group-hover:text-orange-400 transition-colors">
                        {deal.title}
                      </h2>
                    </div>
                    <div className="flex items-baseline gap-2 mt-1">
                      <span className="text-[17px] font-black text-emerald-400">
                        {deal.price.toLocaleString()}원
                      </span>
                      <span className="text-[11px] text-white/25 line-through">
                        {deal.verification.normalPrice.toLocaleString()}원
                      </span>
                      <span className="text-[11px] text-orange-400 font-bold ml-auto">
                        -{deal.verification.savingsRate}%
                      </span>
                    </div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}

        <footer className="text-center py-8 text-white/15 text-[10px] space-y-1">
          <p>매일줍줍 — 매일 엄선한 최저가 핫딜</p>
          <p>이 페이지의 링크를 통해 구매 시 소정의 수수료를 받을 수 있습니다</p>
        </footer>
      </main>
    </div>
  );
}
