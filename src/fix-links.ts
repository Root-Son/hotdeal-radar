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
  { id: "WlMUem4lwFU", celeb: "장원영", product: "어뮤즈 젤핏 틴트", affLink: "https://link.coupang.com/a/d84ko0" },
  { id: "TfflcZ8pVwk", celeb: "정국", product: "라네즈 립 글로이 밤 거미베어", affLink: "https://link.coupang.com/a/d84qGQ" },
  { id: "EAM88zVKGlo", celeb: "제니", product: "옥 페이셜 마사지 롤러", affLink: "https://link.coupang.com/a/d84sqm" },
  { id: "6GMhyE2dDkw", celeb: "태연", product: "마비스 치약", affLink: "https://link.coupang.com/a/d84tIS" },
  { id: "tjRRugK_N0A", celeb: "태연", product: "에르메스 H24 향수", affLink: "https://link.coupang.com/a/d84vR6" },
];

async function main() {
  const auth = authorize();
  const youtube = google.youtube({ version: "v3", auth });

  for (const v of videos) {
    const desc = [
      `${v.celeb} 추천 ${v.product} 🔥`,
      ``,
      `🔗 구매 링크: 채널 프로필 → 링크 클릭!`,
      `쿠팡 직접 구매: ${v.affLink}`,
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
          snippet: { title: `${v.celeb} 추천 ${v.product} 🔥 #Shorts`, description: desc, categoryId: "22" },
        },
      });
      console.log(`✅ 설명: ${v.celeb} ${v.product}`);
    } catch (e: any) {
      console.log(`❌ 설명: ${e.message}`);
    }

    // 댓글도 새로
    try {
      await youtube.commentThreads.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            videoId: v.id,
            topLevelComment: { snippet: { textOriginal: `📌 ${v.celeb} 추천 ${v.product} 구매:\n${v.affLink}\n\n채널 프로필 링크에서도 구매 가능해요 🔥` } },
          },
        },
      });
      console.log(`✅ 댓글: ${v.celeb} ${v.product}`);
    } catch (e: any) {
      console.log(`❌ 댓글: ${e.message}`);
    }
  }
  console.log("\n🎉 완료!");
}

main().catch(console.error);
