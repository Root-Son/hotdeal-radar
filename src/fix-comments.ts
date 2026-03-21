/**
 * 기존 댓글 삭제 + 새 댓글 달기 (프로필 유도)
 * + 영상 본문 설명도 수정
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { google } from "googleapis";

const TOKEN_PATH = path.resolve("youtube_token.json");
const CLIENT_SECRET_PATH = path.resolve("client_secret.json");

function authorize() {
  const content = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, "utf-8"));
  const { client_id, client_secret } = content.installed || content.web;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret);
  oauth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8")));
  return oauth2Client;
}

const videos = [
  { id: "DSPB-xGfJvY", celeb: "장원영", product: "어뮤즈 젤핏 틴트" },
  { id: "4eULbsBbSUA", celeb: "정국", product: "라네즈 립 글로이 밤 거미베어" },
  { id: "Jh3gatzkX-Q", celeb: "제니", product: "옥 페이셜 마사지 롤러" },
  { id: "xGYAfzmLVAU", celeb: "태연", product: "마비스 치약" },
  { id: "OyKh96H-JZg", celeb: "태연", product: "에르메스 H24 향수" },
];

async function main() {
  const auth = authorize();
  const youtube = google.youtube({ version: "v3", auth });

  for (const v of videos) {
    // 1. 새 댓글 달기
    const comment = [
      `📌 구매 링크는 채널 프로필에 있어요!`,
      `프로필 클릭 → 링크 클릭 → ${v.product} 바로 구매`,
      ``,
      `셀럽 추천템 + 핫딜 모아보기 🔥`,
    ].join("\n");

    try {
      await youtube.commentThreads.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            videoId: v.id,
            topLevelComment: { snippet: { textOriginal: comment } },
          },
        },
      });
      console.log(`✅ 댓글: ${v.celeb} ${v.product}`);
    } catch (e: any) {
      console.log(`❌ 댓글: ${e.message}`);
    }

    // 2. 영상 본문 수정
    const pid = process.env.COUPANG_PARTNER_ID || "AF6424400";
    const cUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(v.product)}`;
    const affLink = `https://link.coupang.com/re/AFFSDP?lptag=${pid}&subid=celeb&url=${encodeURIComponent(cUrl)}`;

    const description = [
      `${v.celeb} 추천 ${v.product} 🔥`,
      ``,
      `🔗 구매 링크: 채널 프로필 → 링크 클릭!`,
      `직접 검색: ${affLink}`,
      ``,
      `이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.`,
      ``,
      `#${v.celeb} #${v.product.replace(/\s/g, "")} #추천템 #매일줍줍 #셀럽픽`,
    ].join("\n");

    try {
      await youtube.videos.update({
        part: ["snippet"],
        requestBody: {
          id: v.id,
          snippet: {
            title: `${v.celeb} 추천 ${v.product} 🔥 #Shorts`,
            description,
            categoryId: "22",
          },
        },
      });
      console.log(`✅ 본문: ${v.celeb} ${v.product}`);
    } catch (e: any) {
      console.log(`❌ 본문: ${e.message}`);
    }
  }

  console.log("\n🎉 완료!");
}

main().catch(console.error);
