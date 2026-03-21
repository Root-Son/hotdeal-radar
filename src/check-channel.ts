import "dotenv/config";
import fs from "fs";
import { google } from "googleapis";

const content = JSON.parse(fs.readFileSync("client_secret.json", "utf-8"));
const { client_id, client_secret } = content.installed || content.web;
const oauth2Client = new google.auth.OAuth2(client_id, client_secret);
const token = JSON.parse(fs.readFileSync("youtube_token.json", "utf-8"));
oauth2Client.setCredentials(token);

const youtube = google.youtube({ version: "v3", auth: oauth2Client });

async function main() {
  // 내 채널 목록
  const res = await youtube.channels.list({ part: ["snippet", "contentDetails"], mine: true });
  console.log("내 채널 목록:");
  for (const ch of res.data.items || []) {
    console.log(`  ${ch.id} — ${ch.snippet?.title}`);
  }

  // 업로드된 영상 확인
  const videoIds = ["DSPB-xGfJvY", "4eULbsBbSUA", "Jh3gatzkX-Q", "xGYAfzmLVAU", "OyKh96H-JZg"];
  const vRes = await youtube.videos.list({ part: ["snippet"], id: videoIds });
  console.log("\n업로드된 영상:");
  for (const v of vRes.data.items || []) {
    console.log(`  ${v.id} — ${v.snippet?.channelTitle} (${v.snippet?.channelId})`);
  }

  console.log(`\n매일줍줍 채널 ID: UCpaTc8XqvBnCuRpBTxotkEg`);
}

main().catch(console.error);
