/**
 * 기존 영상 삭제 + 새 영상 업로드 + 댓글 달기
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { google } from "googleapis";

const TOKEN_PATH = path.resolve("youtube_token.json");
const CLIENT_SECRET_PATH = path.resolve("client_secret.json");
const SITE_URL = "https://hotdeal-radar-ten.vercel.app";

function authorize() {
  const content = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, "utf-8"));
  const { client_id, client_secret } = content.installed || content.web;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret);
  oauth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8")));
  return oauth2Client;
}

const OLD_VIDEO_IDS = ["DSPB-xGfJvY", "4eULbsBbSUA", "Jh3gatzkX-Q", "xGYAfzmLVAU", "OyKh96H-JZg"];

const VIDEOS = [
  { file: "celeb_장원영_어뮤즈_젤핏_틴트.mp4", celeb: "장원영", product: "어뮤즈 젤핏 틴트" },
  { file: "celeb_정국_라네즈_립_글로이_밤_거미베어.mp4", celeb: "정국", product: "라네즈 립 글로이 밤 거미베어" },
  { file: "celeb_제니_옥_페이셜_마사지_롤러.mp4", celeb: "제니", product: "옥 페이셜 마사지 롤러" },
  { file: "celeb_태연_마비스_치약.mp4", celeb: "태연", product: "마비스 치약" },
  { file: "celeb_태연_에르메스_H24_향수.mp4", celeb: "태연", product: "에르메스 H24 향수" },
];

async function main() {
  const auth = authorize();
  const youtube = google.youtube({ version: "v3", auth });
  const pid = process.env.COUPANG_PARTNER_ID || "AF6424400";
  const dlDir = path.join(process.env.HOME || "~", "Downloads");

  // 1. 기존 영상 삭제
  console.log("🗑️ 기존 영상 삭제...");
  for (const id of OLD_VIDEO_IDS) {
    try {
      await youtube.videos.delete({ id });
      console.log(`  ✅ 삭제: ${id}`);
    } catch (e: any) {
      console.log(`  ⚠️ ${id}: ${e.message}`);
    }
  }

  // 2. 새 영상 업로드
  console.log("\n📤 새 영상 업로드...");
  const newIds: { id: string; celeb: string; product: string }[] = [];

  for (const v of VIDEOS) {
    const videoPath = path.join(dlDir, v.file);
    if (!fs.existsSync(videoPath)) {
      console.log(`  ❌ 파일 없음: ${v.file}`);
      continue;
    }

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
      const res = await youtube.videos.insert({
        part: ["snippet", "status"],
        requestBody: {
          snippet: {
            title: `${v.celeb} 추천 ${v.product} 🔥 #Shorts`,
            description,
            tags: [v.celeb, v.product, "추천템", "매일줍줍", "셀럽픽"],
            categoryId: "22",
            defaultLanguage: "ko",
            defaultAudioLanguage: "ko",
          },
          status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
        },
        media: { body: fs.createReadStream(videoPath) },
      } as any);

      const videoId = res.data.id!;
      newIds.push({ id: videoId, celeb: v.celeb, product: v.product });
      console.log(`  ✅ ${v.celeb} ${v.product} → https://youtube.com/shorts/${videoId}`);
    } catch (e: any) {
      console.log(`  ❌ ${v.celeb} ${v.product}: ${e.message}`);
    }
  }

  // 3. 댓글 달기
  console.log("\n💬 댓글 달기...");
  for (const v of newIds) {
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
      console.log(`  ✅ ${v.celeb} ${v.product}`);
    } catch (e: any) {
      console.log(`  ❌ ${e.message}`);
    }
  }

  // 4. 새 ID 출력 (웹사이트 업데이트용)
  console.log("\n📋 웹사이트 업데이트용 새 ID:");
  for (const v of newIds) {
    console.log(`  { id: "${v.id}", celeb: "${v.celeb}", product: "${v.product}" },`);
  }

  console.log("\n🎉 완료!");
}

main().catch(console.error);
