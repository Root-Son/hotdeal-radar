export interface HotDeal {
  id: string;
  title: string;
  price: number;
  originalPrice?: number; // 원래 가격 (할인율 계산용)
  discountRate?: number;  // 할인율 %
  store: string;          // 쿠팡, G마켓 등
  category: string;
  link: string;           // 원본 커뮤니티 글 링크
  productLink?: string;   // 실제 구매 링크
  source: "뽐뿌" | "에펨코리아" | "쿠팡";
  upvotes: number;
  comments: number;
  postedAt: string;
  isSoldOut: boolean;
  imageUrl?: string;
}

export interface VerifiedDeal extends HotDeal {
  verification: {
    type: "time" | "space" | "both"; // 시간축/공간축/둘다
    normalPrice: number;     // 평소 가격 or 타사이트 가격
    currentPrice: number;    // 현재 딜 가격
    savingsRate: number;     // 절약률 %
    savingsAmount: number;   // 절약 금액
    priceSource: string;     // 비교 출처 (네이버쇼핑, 다나와 등)
    verdict: "mega" | "good" | "okay" | "fake"; // 개이득/이득/보통/허위
    verdictLabel: string;
  };
  affiliateLink?: string;  // 제휴 링크
  priceHistory?: { date: string; price: number }[]; // 가격 추이
}

export interface DealContent {
  headline: string;     // "이건 사야 됨"
  description: string;  // 왜 이득인지
  hashtags: string[];
}
