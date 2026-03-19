/**
 * 연예인픽 숏폼 영상 생성
 *
 * Usage: npx tsx src/celeb-video.ts "유튜브URL" "제품명" "연예인명"
 *
 * 구조:
 * 1. 후킹 (3초) — 방송 캡쳐 + "XXX이 극찬한 이 제품!"
 * 2. 제품 소개 (8초) — 제품 이미지 + 설명
 * 3. CTA (2초) — "고정댓글에서 구매"
 */

import "dotenv/config";
import sharp from "sharp";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const WIDTH = 1080;
const HEIGHT = 1920;
const OUTPUT_DIR = path.resolve("output");

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function generateTTS(text: string, outputPath: string): void {
  const escaped = text.replace(/"/g, '\\"').replace(/!/g, ".").replace(/\?/g, ".");
  execSync(
    `edge-tts --voice ko-KR-SunHiNeural --rate=+10% --text "${escaped}" --write-media "${outputPath}"`,
    { stdio: "pipe" }
  );
}

// ─── 1. 유튜브에서 캡쳐 추출 ───

function extractScreenshots(youtubeUrl: string, workDir: string): string[] {
  // 영상 다운로드 (720p)
  const videoPath = path.join(workDir, "source.mp4");
  execSync(
    `yt-dlp -f "best[height<=720]" -o "${videoPath}" "${youtubeUrl}" --no-warnings`,
    { stdio: "pipe" }
  );

  // 영상 길이 확인
  const durationStr = execSync(
    `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`
  ).toString().trim();
  const duration = parseFloat(durationStr);

  // 3등분 지점에서 캡쳐 (초반, 중반에서 2장)
  const timestamps = [
    Math.round(duration * 0.2),
    Math.round(duration * 0.5),
  ];

  const screenshots: string[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ssPath = path.join(workDir, `screenshot_${i}.jpg`);
    execSync(
      `ffmpeg -y -ss ${timestamps[i]} -i "${videoPath}" -vframes 1 -q:v 2 "${ssPath}"`,
      { stdio: "pipe" }
    );
    // 세로 비율로 크롭
    execSync(
      `ffmpeg -y -i "${ssPath}" -vf "crop=ih*9/16:ih,scale=${WIDTH}:${HEIGHT}" "${ssPath}.tmp.jpg"`,
      { stdio: "pipe" }
    );
    fs.renameSync(`${ssPath}.tmp.jpg`, ssPath);
    screenshots.push(ssPath);
  }

  // 원본 삭제 (용량)
  fs.unlinkSync(videoPath);

  return screenshots;
}

// ─── 2. 유튜브 자막 추출 ───

function extractSubtitles(youtubeUrl: string): string {
  try {
    // 자동 자막 포함해서 한국어 자막 추출
    const result = execSync(
      `yt-dlp --write-auto-sub --sub-lang ko --skip-download --sub-format vtt -o "/tmp/celeb_sub" "${youtubeUrl}" --no-warnings 2>&1`,
      { stdio: "pipe" }
    ).toString();

    // vtt 파일 찾기
    const vttFiles = ["/tmp/celeb_sub.ko.vtt", "/tmp/celeb_sub.ko.vtt"];
    for (const vttPath of vttFiles) {
      if (fs.existsSync(vttPath)) {
        const vtt = fs.readFileSync(vttPath, "utf-8");
        // VTT에서 텍스트만 추출 (타임스탬프, 태그 제거)
        const text = vtt
          .split("\n")
          .filter(line => !line.match(/^(\d|WEBVTT|NOTE|-->|\s*$)/) && !line.startsWith("Kind:") && !line.startsWith("Language:"))
          .map(line => line.replace(/<[^>]*>/g, "").trim())
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/g, " ")
          .slice(0, 2000); // 2000자 제한
        fs.unlinkSync(vttPath);
        return text;
      }
    }

    // glob으로 찾기
    const files = execSync("ls /tmp/celeb_sub*.vtt 2>/dev/null || true").toString().trim().split("\n").filter(Boolean);
    for (const f of files) {
      const vtt = fs.readFileSync(f, "utf-8");
      const text = vtt
        .split("\n")
        .filter(line => !line.match(/^(\d|WEBVTT|NOTE|-->|\s*$)/))
        .map(line => line.replace(/<[^>]*>/g, "").trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .slice(0, 2000);
      fs.unlinkSync(f);
      return text;
    }
  } catch {}
  return "";
}

// ─── 3. 제품 정보 조회 (네이버 + Gemini) ───

interface ProductInfo {
  title: string;
  price: number;
  image: string;
  description: string;
  coupangLink: string;
  celebQuote: string;
}

async function getProductInfo(productName: string, celebName: string, subtitles: string): Promise<ProductInfo> {
  const clientId = process.env.NAVER_CLIENT_ID!;
  const clientSecret = process.env.NAVER_CLIENT_SECRET!;
  const partnerId = process.env.COUPANG_PARTNER_ID || "AF6424400";

  // 네이버 쇼핑 검색
  const res = await fetch(
    `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(productName)}&display=5&sort=sim`,
    {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    }
  );

  let price = 0;
  let image = "";
  let naverTitle = productName;

  if (res.ok) {
    const data = await res.json();
    const item = data.items?.[0];
    if (item) {
      price = parseInt(item.lprice) || 0;
      image = item.image || "";
      naverTitle = item.title.replace(/<[^>]*>/g, "");
    }
  }

  // 쿠팡 검색 파트너스 링크
  const coupangSearchUrl = `https://www.coupang.com/np/search?component=&q=${encodeURIComponent(productName)}`;
  const coupangLink = `https://link.coupang.com/re/AFFSDP?lptag=${partnerId}&subid=celeb&url=${encodeURIComponent(coupangSearchUrl)}`;

  // Gemini로 제품 설명 생성
  let description = "";
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: `${celebName}이/가 추천한 "${productName}" 숏폼 나레이션을 만들어줘.

${subtitles ? `[영상 자막 내용]\n${subtitles.slice(0, 1000)}\n` : ""}

[규칙]
1. 자막에서 ${celebName}이 이 제품에 대해 뭐라고 했는지 핵심만 뽑아서 인용해줘 (예: "${celebName} 왈: '이거 없으면 못 살아'")
2. 그 다음 제품의 핵심 특징/장점 1~2개
3. 총 3~4줄, 쇼츠 나레이션용이라 짧고 흥분되게
4. 자막이 없거나 제품 언급이 없으면 일반적인 제품 소개로` }] }],
            generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
          }),
        }
      );
      if (geminiRes.ok) {
        const geminiData = await geminiRes.json();
        description = geminiData.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text || "";
      }
    } catch {}
  }

  if (!description) {
    description = `${celebName}이 직접 추천한 ${productName}! 지금 바로 확인해보세요.`;
  }

  // 설명에서 인용구 추출 (""안의 내용)
  const quoteMatch = description.match(/[""'']([^""'']{5,50})[""'']/);
  const celebQuote = quoteMatch ? quoteMatch[1] : "";

  return { title: naverTitle, price, image, description, coupangLink, celebQuote };
}

// ─── 3. 카드 이미지 생성 ───

async function createHookCard(screenshotPath: string, celebName: string, productName: string): Promise<Buffer> {
  // 캡쳐 위에 텍스트 오버레이
  const imgBuf = fs.readFileSync(screenshotPath);
  const base = await sharp(imgBuf).resize(WIDTH, HEIGHT, { fit: "cover" }).png().toBuffer();

  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="hookFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0.6)"/>
          <stop offset="30%" stop-color="rgba(0,0,0,0)"/>
          <stop offset="60%" stop-color="rgba(0,0,0,0)"/>
          <stop offset="100%" stop-color="rgba(0,0,0,0.8)"/>
        </linearGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#hookFade)"/>

      <!-- 상단 배지 -->
      <rect x="300" y="120" width="480" height="60" rx="30" fill="rgba(255,0,0,0.9)"/>
      <text x="540" y="162" text-anchor="middle" font-size="30" font-weight="900" fill="white" font-family="sans-serif">연예인 PICK</text>

      <!-- 하단 텍스트 -->
      <text x="540" y="1650" text-anchor="middle" font-size="55" font-weight="900" fill="white" font-family="sans-serif">${escapeXml(celebName)}이 극찬한</text>
      <text x="540" y="1740" text-anchor="middle" font-size="65" font-weight="900" fill="#FFD54F" font-family="sans-serif">${escapeXml(productName.slice(0, 15))}</text>
      <text x="540" y="1830" text-anchor="middle" font-size="35" fill="rgba(255,255,255,0.7)" font-family="sans-serif">이거 뭔데? 어디서 사?</text>
    </svg>`;

  return sharp(base)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .png()
    .toBuffer();
}

async function createProductCard(product: ProductInfo): Promise<Buffer> {
  // 제품 이미지 다운로드
  let productImgBuf: Buffer | null = null;
  if (product.image) {
    try {
      const res = await fetch(product.image);
      if (res.ok) {
        productImgBuf = Buffer.from(await res.arrayBuffer());
        productImgBuf = await sharp(productImgBuf)
          .resize(600, 600, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 1 } })
          .png()
          .toBuffer();
      }
    } catch {}
  }

  // 배경
  const base = sharp({
    create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
  });

  const descLines: string[] = [];
  let line = "";
  for (const char of product.description.split("\n")[0].slice(0, 80)) {
    line += char;
    if (line.length >= 18) { descLines.push(line); line = ""; }
  }
  if (line) descLines.push(line);

  const descSvg = descLines
    .map((l, i) => `<text x="540" y="${1250 + i * 50}" text-anchor="middle" font-size="32" fill="#444" font-family="sans-serif">${escapeXml(l)}</text>`)
    .join("");

  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${WIDTH}" height="${HEIGHT}" fill="white"/>

      <!-- 연예인 코멘트 -->
      ${product.celebQuote ? `
        <rect x="100" y="700" width="860" height="100" rx="20" fill="#FFF3E0"/>
        <text x="540" y="740" text-anchor="middle" font-size="28" fill="#E65100" font-family="sans-serif" font-style="italic">"${escapeXml(product.celebQuote.slice(0, 30))}"</text>
        <text x="540" y="780" text-anchor="middle" font-size="22" fill="#BF360C" font-family="sans-serif">— 본인 직접 언급</text>
      ` : ""}

      <!-- 제목 -->
      <text x="540" y="${product.celebQuote ? 880 : 750}" text-anchor="middle" font-size="45" font-weight="900" fill="#111" font-family="sans-serif">${escapeXml(product.title.slice(0, 22))}</text>

      <!-- 가격 -->
      ${product.price > 0 ? `
        <text x="540" y="${product.celebQuote ? 970 : 850}" text-anchor="middle" font-size="70" font-weight="900" fill="#E53935" font-family="sans-serif">${product.price.toLocaleString()}원</text>
      ` : ""}

      <!-- 설명 -->
      ${descSvg}

      <!-- 하단 CTA -->
      <rect x="240" y="1700" width="600" height="80" rx="40" fill="#E53935"/>
      <text x="540" y="1752" text-anchor="middle" font-size="35" font-weight="bold" fill="white" font-family="sans-serif">쿠팡에서 최저가 확인하기</text>
    </svg>`;

  let result = await base.png().toBuffer();

  const composites: sharp.OverlayOptions[] = [
    { input: Buffer.from(svg), top: 0, left: 0 },
  ];

  if (productImgBuf) {
    composites.unshift({ input: productImgBuf, top: 80, left: 240 });
  }

  result = await sharp(result).composite(composites).png().toBuffer();
  return result;
}

async function createCtaCard(): Promise<Buffer> {
  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${WIDTH}" height="${HEIGHT}" fill="#E53935"/>
      <text x="540" y="850" text-anchor="middle" font-size="60" font-weight="900" fill="white" font-family="sans-serif">구매 링크는</text>
      <text x="540" y="950" text-anchor="middle" font-size="60" font-weight="900" fill="white" font-family="sans-serif">고정댓글에!</text>
      <text x="540" y="1100" text-anchor="middle" font-size="80" fill="white" font-family="sans-serif">👇</text>
      <text x="540" y="1250" text-anchor="middle" font-size="35" fill="rgba(255,255,255,0.7)" font-family="sans-serif">팔로우하면 매일 연예인 추천템 알림!</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ─── 메인 ───

async function main() {
  const [,, youtubeUrl, productName, celebName] = process.argv;

  if (!youtubeUrl || !productName || !celebName) {
    console.log('Usage: npx tsx src/celeb-video.ts "유튜브URL" "제품명" "연예인명"');
    process.exit(1);
  }

  const workDir = path.join(OUTPUT_DIR, `celeb_${celebName}_${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });

  // 1. 유튜브 캡쳐 추출
  console.log("📸 유튜브 캡쳐 추출 중...");
  const screenshots = extractScreenshots(youtubeUrl, workDir);
  console.log(`  ✅ ${screenshots.length}장 캡쳐 완료`);

  // 2. 자막 추출
  console.log("📝 자막 추출 중...");
  const subtitles = extractSubtitles(youtubeUrl);
  console.log(`  ${subtitles ? `✅ ${subtitles.length}자 추출` : "⬜ 자막 없음 (일반 소개로 대체)"}`);

  // 3. 제품 정보 + AI 분석
  console.log("🔍 제품 정보 조회 중...");
  const product = await getProductInfo(productName, celebName, subtitles);
  console.log(`  ✅ ${product.title} — ${product.price.toLocaleString()}원`);

  // 3. 카드 이미지 생성
  console.log("🎨 카드 생성 중...");
  const clips: string[] = [];

  // 후킹 카드 (캡쳐 이미지 + 연예인 이름)
  for (let i = 0; i < screenshots.length; i++) {
    const cardImg = path.join(workDir, `hook_${i}.png`);
    fs.writeFileSync(cardImg, await createHookCard(screenshots[i], celebName, productName));
    const cardTts = path.join(workDir, `hook_${i}.mp3`);
    if (i === 0) {
      generateTTS(`${celebName}이 극찬한 이 제품! 뭔지 아세요?`, cardTts);
    } else {
      generateTTS(`바로 이거예요!`, cardTts);
    }
    const clipPath = path.join(workDir, `clip_hook_${i}.mp4`);
    execSync(`ffmpeg -y -loop 1 -i "${cardImg}" -i "${cardTts}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest -vf "scale=${WIDTH}:${HEIGHT}" "${clipPath}"`, { stdio: "pipe" });
    clips.push(clipPath);
  }

  // 제품 소개 카드
  const productImg = path.join(workDir, "product.png");
  fs.writeFileSync(productImg, await createProductCard(product));
  const productTts = path.join(workDir, "product.mp3");
  generateTTS(product.description.split("\n").slice(0, 2).join(" ").slice(0, 120), productTts);
  const productClip = path.join(workDir, "clip_product.mp4");
  execSync(`ffmpeg -y -loop 1 -i "${productImg}" -i "${productTts}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest -vf "scale=${WIDTH}:${HEIGHT}" "${productClip}"`, { stdio: "pipe" });
  clips.push(productClip);

  // CTA 카드
  const ctaImg = path.join(workDir, "cta.png");
  fs.writeFileSync(ctaImg, await createCtaCard());
  const ctaTts = path.join(workDir, "cta.mp3");
  generateTTS("구매 링크는 고정댓글에 있어요. 팔로우 하면 매일 알려드릴게요!", ctaTts);
  const ctaClip = path.join(workDir, "clip_cta.mp4");
  execSync(`ffmpeg -y -loop 1 -i "${ctaImg}" -i "${ctaTts}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest -vf "scale=${WIDTH}:${HEIGHT}" "${ctaClip}"`, { stdio: "pipe" });
  clips.push(ctaClip);

  // 4. 합치기
  console.log("🔗 클립 합치기...");
  const concatFile = path.join(workDir, "concat.txt");
  fs.writeFileSync(concatFile, clips.map((p) => `file '${p}'`).join("\n"));
  const finalPath = path.join(workDir, "celeb_shorts.mp4");
  execSync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${finalPath}"`, { stdio: "pipe" });

  // Downloads에도 복사
  const downloadName = `celeb_${celebName}_${productName.replace(/\s/g, "_")}.mp4`;
  const downloadPath = path.join(process.env.HOME || "~", "Downloads", downloadName);
  fs.copyFileSync(finalPath, downloadPath);

  // 5. 영상 설명 생성
  const desc = [
    `${celebName}이 극찬한 ${productName}!`,
    "",
    `📌 구매 링크 (쿠팡 최저가):`,
    product.coupangLink,
    "",
    `#${celebName} #${productName.replace(/\s/g, "")} #연예인추천 #추천템 #매일줍줍`,
  ].join("\n");
  const descPath = path.join(workDir, "description.txt");
  fs.writeFileSync(descPath, desc);

  // 결과
  const duration = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalPath}"`).toString().trim();
  console.log(`\n🎉 영상 생성 완료!`);
  console.log(`📁 ${downloadPath}`);
  console.log(`⏱ ${Math.round(parseFloat(duration))}초`);
  console.log(`🔗 쿠팡 링크: ${product.coupangLink.slice(0, 60)}...`);
  console.log(`📝 설명: ${descPath}`);
}

main().catch(console.error);
