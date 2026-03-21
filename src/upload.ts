/**
 * 매일줍줍 유튜브 업로드
 *
 * Usage:
 *   npx tsx src/upload.ts <workDir>           # 단일 업로드
 *   npx tsx src/upload.ts all                 # Downloads의 celeb_*.mp4 전부 업로드
 */

import "dotenv/config";
import fs from "fs";
import path from "path";
import { google } from "googleapis";
import http from "http";

const CHANNEL_ID = "UCpaTc8XqvBnCuRpBTxotkEg";
const TOKEN_PATH = path.resolve("youtube_token.json");
const CLIENT_SECRET_PATH = path.resolve("client_secret.json");

async function authorize() {
  const content = JSON.parse(fs.readFileSync(CLIENT_SECRET_PATH, "utf-8"));
  const { client_id, client_secret } = content.installed || content.web;
  const oauth2Client = new google.auth.OAuth2(client_id, client_secret, "http://localhost:3333/callback");

  if (fs.existsSync(TOKEN_PATH)) {
    const token = JSON.parse(fs.readFileSync(TOKEN_PATH, "utf-8"));
    oauth2Client.setCredentials(token);

    // 토큰 만료 체크
    if (token.expiry_date && token.expiry_date < Date.now()) {
      try {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(credentials));
      } catch {
        console.log("토큰 갱신 실패, 재인증 필요");
        return await getNewToken(oauth2Client);
      }
    }
    return oauth2Client;
  }

  return await getNewToken(oauth2Client);
}

function getNewToken(oauth2Client: any): Promise<any> {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: ["https://www.googleapis.com/auth/youtube"],
  });
  console.log("🔗 브라우저에서 인증하세요:", authUrl);

  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url!, `http://localhost:3333`);
      const code = url.searchParams.get("code");
      if (code) {
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);
        fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens));
        res.end("인증 완료! 창을 닫으세요.");
        server.close();
        resolve(oauth2Client);
      }
    });
    server.listen(3333);
  });
}

interface UploadInfo {
  videoPath: string;
  title: string;
  description: string;
  tags: string[];
}

function parseUploadInfo(videoPath: string): UploadInfo {
  // 파일명에서 정보 추출: celeb_제니_옥_페이셜_마사지_롤러.mp4
  const basename = path.basename(videoPath, ".mp4");
  const parts = basename.replace("celeb_", "").split("_");
  const celebName = parts[0];
  const productName = parts.slice(1).join(" ");

  // description.txt 찾기
  let description = "";
  const dir = path.dirname(videoPath);
  const descFile = path.join(dir, "description.txt");
  if (fs.existsSync(descFile)) {
    description = fs.readFileSync(descFile, "utf-8");
  } else {
    // Downloads에서 왔으면 output 폴더에서 찾기
    const outputDirs = fs.readdirSync(path.resolve("output"))
      .filter(d => d.includes(celebName))
      .sort()
      .reverse();
    for (const d of outputDirs) {
      const df = path.join(path.resolve("output"), d, "description.txt");
      if (fs.existsSync(df)) {
        description = fs.readFileSync(df, "utf-8");
        break;
      }
    }
  }

  if (!description) {
    const pid = process.env.COUPANG_PARTNER_ID || "AF6424400";
    const cUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(productName)}`;
    const affLink = `https://link.coupang.com/re/AFFSDP?lptag=${pid}&subid=celeb&url=${encodeURIComponent(cUrl)}`;
    description = [
      `${celebName} 추천 ${productName} 🔥`,
      "",
      `📌 구매 링크:`,
      affLink,
      "",
      `이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.`,
      "",
      `#${celebName} #${productName.replace(/\s/g, "")} #추천템 #매일줍줍`,
    ].join("\n");
  }

  const title = `${celebName} 추천 ${productName} 🔥 #Shorts`;
  const tags = [celebName, productName, "추천템", "매일줍줍", "셀럽픽", "쿠팡", "핫딜"];

  return { videoPath, title: title.slice(0, 100), description, tags };
}

async function uploadVideo(auth: any, info: UploadInfo): Promise<string> {
  const youtube = google.youtube({ version: "v3", auth });

  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: info.title,
        description: info.description,
        tags: info.tags,
        categoryId: "22", // People & Blogs
        defaultLanguage: "ko",
        defaultAudioLanguage: "ko",
      },
      status: {
        privacyStatus: "public",
        selfDeclaredMadeForKids: false,
        shorts: { shortsVerticalFit: true },
      },
    },
    media: {
      body: fs.createReadStream(info.videoPath),
    },
  } as any);

  return res.data.id!;
}

async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.log("Usage:");
    console.log("  npx tsx src/upload.ts all              # Downloads의 celeb_*.mp4 전부");
    console.log("  npx tsx src/upload.ts <video.mp4>      # 단일 파일");
    process.exit(1);
  }

  const auth = await authorize();
  console.log("✅ YouTube 인증 완료");

  let videos: string[] = [];

  if (arg === "all") {
    const dlDir = path.join(process.env.HOME || "~", "Downloads");
    videos = fs.readdirSync(dlDir)
      .filter(f => f.startsWith("celeb_") && f.endsWith(".mp4") && !f.includes("_v"))
      .map(f => path.join(dlDir, f));
  } else if (fs.existsSync(arg)) {
    videos = [path.resolve(arg)];
  } else {
    console.log("파일을 찾을 수 없습니다:", arg);
    process.exit(1);
  }

  if (videos.length === 0) {
    console.log("업로드할 영상이 없습니다");
    process.exit(1);
  }

  console.log(`📤 ${videos.length}개 영상 업로드 시작\n`);

  for (const videoPath of videos) {
    const info = parseUploadInfo(videoPath);
    console.log(`📤 ${info.title}`);
    try {
      const videoId = await uploadVideo(auth, info);
      console.log(`  ✅ https://youtube.com/shorts/${videoId}\n`);
    } catch (e: any) {
      console.log(`  ❌ 실패: ${e.message}\n`);
    }
  }

  console.log("🎉 업로드 완료!");
}

main().catch(console.error);
