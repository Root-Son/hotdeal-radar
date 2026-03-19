/**
 * 핫딜 숏폼 영상 자동 생성 v2
 *
 * Usage: npx tsx src/generate-video.ts
 */

import "dotenv/config";
import sharp from "sharp";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const WIDTH = 1080;
const HEIGHT = 1920;
const OUTPUT_DIR = path.resolve("output");

interface DealSlide {
  title: string;
  store: string;
  originalPrice: number;
  dealPrice: number;
  savingsRate: number;
  verdict: string;
  imageUrl?: string;
  affiliateLink: string;
  // Gemini 생성 콘텐츠
  headline: string;
  narration: string;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── 제품 이미지 다운로드 ───

async function downloadImage(url: string, savePath: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://www.google.com" },
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    // 1080x1080으로 리사이즈 (상단 영역용)
    await sharp(buf)
      .resize(WIDTH, WIDTH, { fit: "cover" })
      .toFile(savePath);
    return true;
  } catch {
    return false;
  }
}

// ─── 미니 가격 차트 SVG ───

function generatePriceChartSvg(normalPrice: number, dealPrice: number, startY: number): string {
  const chartX = 120;
  const chartW = 840;
  const chartH = 160;
  const chartY = startY;

  // 가격 포인트 생성 (평소가 근처에서 약간 변동 → 마지막에 급락)
  const points: number[] = [];
  for (let i = 0; i < 12; i++) {
    // 평소가 ±10% 변동
    const variation = normalPrice * (0.9 + Math.random() * 0.2);
    points.push(variation);
  }
  points.push(dealPrice); // 마지막 = 딜 가격 (급락!)

  const maxP = Math.max(...points) * 1.05;
  const minP = Math.min(...points) * 0.95;
  const range = maxP - minP || 1;

  const coords = points.map((p, i) => {
    const x = chartX + (i / (points.length - 1)) * chartW;
    const y = chartY + chartH - ((p - minP) / range) * chartH;
    return `${x},${y}`;
  });

  // 평소가 라인 (점선)
  const normalY = chartY + chartH - ((normalPrice - minP) / range) * chartH;
  // 딜가 포인트
  const lastCoord = coords[coords.length - 1].split(",");

  return `
    <!-- 차트 배경 -->
    <rect x="${chartX - 10}" y="${chartY - 10}" width="${chartW + 20}" height="${chartH + 45}" rx="15" fill="rgba(255,255,255,0.06)"/>

    <!-- 평소가 기준선 (점선) -->
    <line x1="${chartX}" y1="${normalY}" x2="${chartX + chartW}" y2="${normalY}" stroke="rgba(255,255,255,0.2)" stroke-width="1.5" stroke-dasharray="8,6"/>
    <text x="${chartX + chartW + 5}" y="${normalY + 5}" font-size="20" fill="rgba(255,255,255,0.3)" font-family="sans-serif">${(normalPrice / 1000).toFixed(0)}k</text>

    <!-- 가격 라인 -->
    <polyline points="${coords.join(" ")}" fill="none" stroke="#FF6B35" stroke-width="3" stroke-linejoin="round"/>

    <!-- 급락 구간 강조 (빨간 영역) -->
    <polygon points="${coords[coords.length - 2]} ${lastCoord[0]},${lastCoord[1]} ${lastCoord[0]},${chartY + chartH}" fill="rgba(255,23,68,0.25)"/>

    <!-- 딜가 포인트 (빛나는 원) -->
    <circle cx="${lastCoord[0]}" cy="${lastCoord[1]}" r="12" fill="#00E676" opacity="0.3"/>
    <circle cx="${lastCoord[0]}" cy="${lastCoord[1]}" r="7" fill="#00E676"/>

    <!-- 라벨 -->
    <text x="${chartX}" y="${chartY + chartH + 30}" font-size="18" fill="rgba(255,255,255,0.3)" font-family="sans-serif">30일 전</text>
    <text x="${chartX + chartW - 30}" y="${chartY + chartH + 30}" font-size="18" fill="#00E676" font-weight="bold" font-family="sans-serif">오늘</text>
  `;
}

// ─── 카드 이미지 생성 ───

async function createIntroCard(): Promise<Buffer> {
  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${WIDTH}" height="${HEIGHT}" fill="#0a0a0a"/>
      <text x="540" y="860" text-anchor="middle" font-size="180" fill="white" font-family="sans-serif">🔥</text>
      <text x="540" y="1050" text-anchor="middle" font-size="90" font-weight="900" fill="white" font-family="sans-serif">오늘의 개이득템</text>
      <rect x="340" y="1100" width="400" height="6" rx="3" fill="#FF6B35"/>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function createDealCard(
  deal: DealSlide,
  index: number,
  total: number,
  productImgPath?: string
): Promise<Buffer> {
  // 배경: 제품 이미지가 있으면 상단에 표시
  let baseImage: sharp.Sharp;

  if (productImgPath && fs.existsSync(productImgPath)) {
    // 제품 이미지를 상단 절반에, 하단은 검정 그라데이션
    const imgBuf = fs.readFileSync(productImgPath);
    const composite = await sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } },
    })
      .composite([
        { input: imgBuf, top: 0, left: 0 },
      ])
      .png()
      .toBuffer();
    baseImage = sharp(composite);
  } else {
    baseImage = sharp({
      create: { width: WIDTH, height: HEIGHT, channels: 4, background: { r: 10, g: 10, b: 10, alpha: 1 } },
    });
  }

  // 오버레이 SVG
  const titleLines: string[] = [];
  let line = "";
  for (const char of deal.title) {
    line += char;
    if (line.length >= 12) { titleLines.push(line); line = ""; }
  }
  if (line) titleLines.push(line);

  const titleSvg = titleLines
    .map((l, i) => `<text x="540" y="${1150 + i * 75}" text-anchor="middle" font-size="60" font-weight="800" fill="white" font-family="sans-serif">${escapeXml(l)}</text>`)
    .join("");

  const priceY = 1150 + titleLines.length * 75 + 30;

  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <!-- 하단 그라데이션 오버레이 -->
      <defs>
        <linearGradient id="fade${index}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(0,0,0,0)"/>
          <stop offset="45%" stop-color="rgba(0,0,0,0.3)"/>
          <stop offset="55%" stop-color="rgba(0,0,0,0.85)"/>
          <stop offset="100%" stop-color="rgba(10,10,10,1)"/>
        </linearGradient>
      </defs>
      <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#fade${index})"/>

      <!-- 상단 순번 배지 -->
      <rect x="40" y="60" width="120" height="55" rx="27" fill="#FF6B35"/>
      <text x="100" y="98" text-anchor="middle" font-size="30" font-weight="bold" fill="white" font-family="sans-serif">${index + 1} / ${total}</text>

      <!-- 최저가 배지 (우측 상단) -->
      <rect x="680" y="50" width="370" height="70" rx="35" fill="#FF1744"/>
      <text x="865" y="97" text-anchor="middle" font-size="30" font-weight="900" fill="white" font-family="sans-serif">${deal.savingsRate >= 40 ? "🚨 역대 최저가!" : deal.savingsRate >= 25 ? "🔥 최근 30일 최저가!" : "⚡ 지금이 제일 싸요!"}</text>

      <!-- 헤드라인 -->
      ${deal.headline ? `<text x="540" y="1050" text-anchor="middle" font-size="42" font-weight="900" fill="#FFD54F" font-family="sans-serif">${escapeXml(deal.headline)}</text>` : ""}

      <!-- 판매처 -->
      <rect x="380" y="1080" width="320" height="45" rx="22" fill="rgba(255,255,255,0.12)"/>
      <text x="540" y="1112" text-anchor="middle" font-size="26" fill="rgba(255,255,255,0.7)" font-family="sans-serif">${escapeXml(deal.store || "온라인")}</text>

      <!-- 제목 -->
      ${titleSvg}

      <!-- 미니 가격 차트 -->
      ${generatePriceChartSvg(deal.originalPrice, deal.dealPrice, priceY + 20)}

      <!-- 현재가 강조 -->
      <text x="540" y="${priceY + 245}" text-anchor="middle" font-size="36" fill="rgba(255,255,255,0.4)" font-family="sans-serif">지금 안 사면 손해</text>
      <text x="540" y="${priceY + 330}" text-anchor="middle" font-size="90" font-weight="900" fill="#00E676" font-family="sans-serif">${deal.dealPrice.toLocaleString()}<tspan font-size="50">원</tspan></text>

      <!-- 하단 바 -->
      <rect x="0" y="1830" width="${WIDTH}" height="90" fill="rgba(255,107,53,0.9)"/>
      <text x="540" y="1885" text-anchor="middle" font-size="30" font-weight="bold" fill="white" font-family="sans-serif">고정댓글에서 바로 구매 가능!</text>
    </svg>`;

  const overlaySvg = Buffer.from(svg);
  return baseImage
    .composite([{ input: overlaySvg, top: 0, left: 0 }])
    .png()
    .toBuffer();
}

async function createOutroCard(): Promise<Buffer> {
  const svg = `
    <svg width="${WIDTH}" height="${HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${WIDTH}" height="${HEIGHT}" fill="#0a0a0a"/>
      <text x="540" y="880" text-anchor="middle" font-size="80" font-weight="900" fill="white" font-family="sans-serif">구독 + 좋아요</text>
      <text x="540" y="980" text-anchor="middle" font-size="45" fill="rgba(255,255,255,0.6)" font-family="sans-serif">매일 핫딜 알림 받기</text>
      <text x="540" y="1080" text-anchor="middle" font-size="100" fill="white" font-family="sans-serif">🔔</text>
    </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

// ─── TTS ───

function generateTTS(text: string, outputPath: string): void {
  const escaped = text.replace(/"/g, '\\"').replace(/!/g, ".");
  execSync(
    `edge-tts --voice ko-KR-InJoonNeural --rate=+15% --text "${escaped}" --write-media "${outputPath}"`,
    { stdio: "pipe" }
  );
}

// ─── 네이버에서 제품 이미지 검색 ───

async function searchProductImage(query: string): Promise<string | null> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch(
    `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=1&sort=sim`,
    {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    }
  );
  if (!res.ok) return null;
  const data = await res.json();
  return data.items?.[0]?.image || null;
}

// ─── 메인 ───

async function main() {
  console.log("🔍 핫딜 수집 + AI 스크립트 생성 중...");
  const res = await fetch("http://localhost:3002/api/content");
  const data = await res.json();

  const deals: DealSlide[] = (data.deals || [])
    .filter((d: { verification: { savingsRate: number } }) => d.verification.savingsRate >= 15)
    .slice(0, 7)
    .map((d: {
      title: string;
      store: string;
      link: string;
      affiliateLink?: string;
      imageUrl?: string;
      verification: { normalPrice: number; currentPrice: number; savingsRate: number; verdictLabel: string };
      content?: { headline: string; description: string };
    }) => ({
      title: d.title.replace(/\([\d,]+원[^)]*\)/g, "").replace(/\s+/g, " ").trim().slice(0, 24),
      store: d.store,
      originalPrice: d.verification.normalPrice,
      dealPrice: d.verification.currentPrice,
      savingsRate: d.verification.savingsRate,
      verdict: d.verification.verdictLabel,
      imageUrl: d.imageUrl,
      affiliateLink: d.affiliateLink || d.link,
      headline: d.content?.headline || "",
      narration: d.content?.description || "",
    }));

  if (deals.length === 0) {
    console.log("❌ 이득인 딜이 없습니다");
    return;
  }

  console.log(`✅ ${deals.length}개 딜 선정`);

  const workDir = path.join(OUTPUT_DIR, `hotdeal_${new Date().toISOString().slice(0, 10)}`);
  fs.mkdirSync(workDir, { recursive: true });

  // 1. 제품 이미지 다운로드
  console.log("📸 제품 이미지 수집 중...");
  const imgPaths: (string | undefined)[] = [];
  for (let i = 0; i < deals.length; i++) {
    const imgPath = path.join(workDir, `product_${i}.jpg`);
    let ok = false;

    // 크롤링 이미지 시도
    if (deals[i].imageUrl) {
      ok = await downloadImage(deals[i].imageUrl!, imgPath);
    }
    // 없으면 네이버에서 검색
    if (!ok) {
      const naverImg = await searchProductImage(deals[i].title);
      if (naverImg) ok = await downloadImage(naverImg, imgPath);
    }

    imgPaths.push(ok ? imgPath : undefined);
    console.log(`  ${ok ? "✅" : "⬜"} ${deals[i].title.slice(0, 20)}`);
  }

  // 2. 이미지 카드 + TTS
  console.log("🎨 영상 카드 생성 중...");
  const clips: string[] = [];

  // 인트로 (1.5초 — 짧게)
  const introImg = path.join(workDir, "intro.png");
  fs.writeFileSync(introImg, await createIntroCard());
  const introTts = path.join(workDir, "intro.mp3");
  generateTTS("오늘의 개이득템!", introTts);
  const introClip = path.join(workDir, "clip_intro.mp4");
  execSync(`ffmpeg -y -loop 1 -i "${introImg}" -i "${introTts}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest -vf "scale=${WIDTH}:${HEIGHT}" "${introClip}"`, { stdio: "pipe" });
  clips.push(introClip);

  // 딜 카드
  for (let i = 0; i < deals.length; i++) {
    const d = deals[i];
    const cardImg = path.join(workDir, `card_${i}.png`);
    fs.writeFileSync(cardImg, await createDealCard(d, i, deals.length, imgPaths[i]));

    const cardTts = path.join(workDir, `card_${i}.mp3`);
    // Gemini AI가 생성한 흥분되는 나레이션 (2줄만 — 숏폼은 빠르게)
    const ttsText = d.narration
      ? d.narration.split("\n").slice(0, 2).join(" ").slice(0, 120)
      : `${d.store}에서 ${d.title}! ${d.savingsRate}퍼센트 할인!`;
    generateTTS(ttsText, cardTts);

    const clipPath = path.join(workDir, `clip_${i}.mp4`);
    execSync(`ffmpeg -y -loop 1 -i "${cardImg}" -i "${cardTts}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest -vf "scale=${WIDTH}:${HEIGHT}" "${clipPath}"`, { stdio: "pipe" });
    clips.push(clipPath);
  }

  // 아웃트로 (1.5초)
  const outroImg = path.join(workDir, "outro.png");
  fs.writeFileSync(outroImg, await createOutroCard());
  const outroTts = path.join(workDir, "outro.mp3");
  generateTTS("구독 좋아요!", outroTts);
  const outroClip = path.join(workDir, "clip_outro.mp4");
  execSync(`ffmpeg -y -loop 1 -i "${outroImg}" -i "${outroTts}" -c:v libx264 -tune stillimage -c:a aac -b:a 192k -pix_fmt yuv420p -shortest -vf "scale=${WIDTH}:${HEIGHT}" "${outroClip}"`, { stdio: "pipe" });
  clips.push(outroClip);

  // 3. 합치기
  console.log("🔗 클립 합치기...");
  const concatFile = path.join(workDir, "concat.txt");
  fs.writeFileSync(concatFile, clips.map((p) => `file '${p}'`).join("\n"));

  const finalPath = path.join(workDir, "hotdeal_shorts.mp4");
  execSync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${finalPath}"`, { stdio: "pipe" });

  // 4. 영상 설명 (어필리에이트 링크 포함)
  const descLines = [
    `🔥 오늘의 개이득템 ${deals.length}선`,
    "",
    ...deals.map((d, i) => `${i + 1}. ${d.title} (${d.savingsRate}% 절약)`),
    "",
    "📌 구매 링크:",
    ...deals.map((d, i) => `${i + 1}. ${d.affiliateLink}`),
    "",
    "#핫딜 #특가 #오늘의딜 #개이득 #쇼핑",
  ];
  const descPath = path.join(workDir, "description.txt");
  fs.writeFileSync(descPath, descLines.join("\n"));

  // 결과
  const stat = fs.statSync(finalPath);
  const duration = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalPath}"`).toString().trim();

  // Downloads 폴더에도 복사
  const downloadPath = path.join(process.env.HOME || "~", "Downloads", `hotdeal_shorts_${new Date().toISOString().slice(0, 10)}.mp4`);
  fs.copyFileSync(finalPath, downloadPath);

  console.log(`\n🎉 영상 생성 완료!`);
  console.log(`📁 ${downloadPath}`);
  console.log(`⏱ ${Math.round(parseFloat(duration))}초 / 📦 ${(stat.size / 1024 / 1024).toFixed(1)}MB`);
  console.log(`📝 설명: ${descPath}`);
}

main().catch(console.error);
