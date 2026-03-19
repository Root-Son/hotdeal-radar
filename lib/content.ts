import { VerifiedDeal, DealContent } from "./types";

/** Gemini로 숏폼/카드뉴스 콘텐츠 자동 생성 */
export async function generateDealContent(
  deal: VerifiedDeal
): Promise<DealContent> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return fallbackContent(deal);
  }

  const v = deal.verification;
  const prompt = `핫딜 숏폼 콘텐츠를 만들어줘. 유튜브 쇼츠/릴스용.

[딜 정보]
제품: ${deal.title}
현재가: ${deal.price.toLocaleString()}원
평소가: ${v.normalPrice.toLocaleString()}원
절약률: ${v.savingsRate}%
절약금액: ${v.savingsAmount.toLocaleString()}원
판매처: ${deal.store}
카테고리: ${deal.category}

[규칙]
1. headline: 후킹 한 줄 (15자 이내). 시청자가 멈출만한 자극적 문구. 예: "이거 안 사면 호구", "역대 최저가 떴다", "지금 당장 사세요"
2. description: 3~4줄 스크립트. 이 구성으로:
   - 무슨 제품인지 한 줄
   - 평소 가격 vs 지금 가격 비교 (구체적 숫자)
   - 왜 사야하는지 한 줄
   - 마무리 CTA
   자연스럽고 흥분된 말투. 친구한테 알려주는 느낌.
3. hashtags: 5개. #핫딜 #특가 + 제품/카테고리 관련

JSON만 출력:
{"headline":"...","description":"...","hashtags":["#핫딜","..."]}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 8192, temperature: 0.8 },
        }),
      }
    );

    if (!res.ok) return fallbackContent(deal);

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return fallbackContent(deal);

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      headline: parsed.headline || "",
      description: parsed.description || "",
      hashtags: parsed.hashtags || [],
    };
  } catch {
    return fallbackContent(deal);
  }
}

function fallbackContent(deal: VerifiedDeal): DealContent {
  const v = deal.verification;
  return {
    headline: v.savingsRate >= 40 ? "이거 안 사면 손해" : "지금이 제일 싸다",
    description: `${deal.title}\n평소 ${v.normalPrice.toLocaleString()}원인데 지금 ${deal.price.toLocaleString()}원!\n${v.savingsRate}% 할인, ${v.savingsAmount.toLocaleString()}원 아끼는 거예요.\n${deal.store}에서 지금 바로 확인하세요!`,
    hashtags: ["#핫딜", "#특가", "#오늘의딜", `#${deal.store}`, `#${deal.category || "쇼핑"}`],
  };
}

/** 여러 딜의 콘텐츠를 한번에 생성 */
export async function generateDailyContent(
  deals: VerifiedDeal[],
  limit = 5
): Promise<(VerifiedDeal & { content: DealContent })[]> {
  const top = deals.slice(0, limit);
  const results = await Promise.all(
    top.map(async (deal) => ({
      ...deal,
      content: await generateDealContent(deal),
    }))
  );
  return results;
}
