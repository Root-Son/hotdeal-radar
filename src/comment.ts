/**
 * 업로드된 영상에 고정댓글 달기 — 우리 사이트 링크로
 *
 * Usage: npx tsx src/comment.ts
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
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, "http://localhost:3333/callback");
  const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
  oauth2Client.setCredentials(token);
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
    const comment = [
      `📌 ${v.celeb} 추천 ${v.product} 구매하기:`,
      `${SITE_URL}`,
      ``,
      `셀럽 추천템 + 오늘의 핫딜 모아보기 🔥`,
    ].join("\n");

    try {
      await youtube.commentThreads.insert({
        part: ["snippet"],
        requestBody: {
          snippet: {
            videoId: v.id,
            topLevelComment: {
              snippet: { textOriginal: comment },
            },
          },
        },
      });
      console.log(`✅ ${v.celeb} ${v.product}`);
    } catch (e: any) {
      console.log(`❌ ${v.celeb} ${v.product} — ${e.message}`);
    }
  }

  console.log("\n🎉 완료! 유튜브 스튜디오에서 댓글 '고정' 해주세요.");
}

main().catch(console.error);
