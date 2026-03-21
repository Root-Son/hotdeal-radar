/**
 * 연예인픽 숏폼 v4
 *
 * Usage: npx tsx src/celeb-video.ts "유튜브URL" "제품명" "연예인명"
 *
 * 1. 후킹 (5초) — 원본 클립 + 자막
 * 2. 코멘트 클립들 (각 5초) — 원본 클립 + TTS 나레이션으로 제품 설명
 * 3. 제품 사진 슬라이드 (각 4초) — 여러 장 + 가격/할인 정보
 * 4. CTA (2초) — "고정댓글 링크" 짧게
 */

import "dotenv/config";
import sharp from "sharp";
import { execSync } from "child_process";
import fs from "fs";
import path from "path";

const W = 1080;
const H = 1920;
const AUDIO = "-c:a aac -b:a 128k -ar 44100 -ac 2";
const VIDEO = "-c:v libx264 -preset fast -crf 23 -pix_fmt yuv420p -r 30 -g 30";

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function tts(text: string, out: string): void {
  const t = text.replace(/"/g, '\\"').replace(/[!?]/g, ".");
  execSync(`edge-tts --voice ko-KR-SunHiNeural --rate=+10% --text "${t}" --write-media "${out}"`, { stdio: "pipe" });
}

function run(cmd: string): void {
  execSync(cmd, { stdio: "pipe" });
}

// ─── 자막 (타임스탬프 포함) ───

interface SubEntry {
  start: number; // 초
  text: string;
}

function parseVttTimestamp(ts: string): number {
  const parts = ts.split(":");
  if (parts.length === 3) return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  if (parts.length === 2) return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  return parseFloat(parts[0]);
}

function downloadSubs(url: string): { entries: SubEntry[]; fullText: string } {
  try {
    // 기존 파일 정리
    execSync("rm -f /tmp/csub*.vtt", { stdio: "pipe" });
    run(`yt-dlp --write-auto-sub --sub-lang ko --skip-download --sub-format vtt -o "/tmp/csub" "${url}" --no-warnings 2>&1`);
    const files = execSync("ls /tmp/csub*.vtt 2>/dev/null || true").toString().trim().split("\n").filter(Boolean);

    for (const f of files) {
      const raw = fs.readFileSync(f, "utf-8");
      const lines = raw.split("\n");
      const entries: SubEntry[] = [];
      let currentTime = 0;

      for (let i = 0; i < lines.length; i++) {
        const timeMatch = lines[i].match(/^(\d{2}:\d{2}[\d:.]+)\s*-->/);
        if (timeMatch) {
          currentTime = parseVttTimestamp(timeMatch[1]);
          // 다음 줄이 텍스트
          const textLines: string[] = [];
          for (let j = i + 1; j < lines.length && lines[j].trim() !== "" && !lines[j].match(/-->/); j++) {
            const clean = lines[j].replace(/<[^>]*>/g, "").trim();
            if (clean && !clean.match(/^(WEBVTT|Kind:|Language:)/)) textLines.push(clean);
          }
          if (textLines.length > 0) {
            entries.push({ start: currentTime, text: textLines.join(" ") });
          }
        }
      }

      try { fs.unlinkSync(f); } catch {}
      const fullText = entries.map(e => e.text).join(" ").replace(/\s+/g, " ").slice(0, 3000);
      return { entries, fullText };
    }
  } catch {}
  return { entries: [], fullText: "" };
}

// ─── 유튜브 다운로드 + 제품 관련 클립 추출 ───

function downloadVideo(url: string, dir: string): { srcPath: string; duration: number } {
  const src = path.join(dir, "source.mp4");
  run(`yt-dlp -f "best[height<=720]" -o "${src}" "${url}" --no-warnings`);
  const dur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${src}"`).toString().trim());
  return { srcPath: src, duration: dur };
}

function extractClips(srcPath: string, timestamps: number[], dir: string, duration: number): string[] {
  const clips: string[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const t = Math.max(0, Math.min(timestamps[i], duration - 6));
    const p = path.join(dir, `raw_${i}.mp4`);
    run(`ffmpeg -y -ss ${t} -i "${srcPath}" -t 5 -vf "crop=ih*9/16:ih,scale=${W}:${H}" ${VIDEO} ${AUDIO} "${p}"`);
    clips.push(p);
  }
  return clips;
}

function findProductTimestamps(entries: SubEntry[], productName: string, count: number, duration: number): number[] {
  // 제품 관련 키워드
  const keywords = productName.toLowerCase().split(/\s+/).filter(w => w.length >= 2);

  // 자막에서 제품 언급 구간 찾기
  const matches: { start: number; score: number }[] = [];
  for (const entry of entries) {
    const text = entry.text.toLowerCase();
    const score = keywords.filter(kw => text.includes(kw)).length;
    if (score > 0) {
      matches.push({ start: entry.start, score });
    }
  }

  // 근접한 매칭들을 하나의 구간으로 합침 (20초 이내 = 같은 구간)
  const groups: { start: number; bestScore: number }[] = [];
  const sortedByTime = [...matches].sort((a, b) => a.start - b.start);
  for (const m of sortedByTime) {
    const existing = groups.find(g => Math.abs(g.start - m.start) < 20);
    if (existing) {
      if (m.score > existing.bestScore) {
        existing.start = m.start;
        existing.bestScore = m.score;
      }
    } else {
      groups.push({ start: m.start, bestScore: m.score });
    }
  }

  // 점수 높은 순
  groups.sort((a, b) => b.bestScore - a.bestScore);
  const selected = groups.slice(0, count).map(g => g.start);

  if (selected.length >= count) {
    return selected;
  }

  // 매칭 부족하면 그룹핑된 것 + 균등 분할로 보충
  const found = [...selected];
  while (found.length < count) {
    const t = Math.round(duration * (0.15 + (found.length * 0.7) / count));
    if (found.every(s => Math.abs(s - t) > 20)) {
      found.push(t);
    } else {
      found.push(t + 20);
    }
  }
  return found.slice(0, count);
}

// ─── Gemini ───

interface Analysis {
  hookLine: string;
  commentTts: string[]; // 코멘트 클립 위에 읽을 나레이션 3개
  commentSubs: string[]; // 화면에 보여줄 자막 3개
  productTts: string;
  features: string[];
}

async function gemini(celeb: string, product: string, subs: string): Promise<Analysis> {
  const fb: Analysis = {
    hookLine: `${celeb} 추천템!`,
    commentTts: [`${celeb}이 이 제품 진짜 좋다고 했거든요`, `매일 쓰는 애정템이래요`, `이건 한번 써보면 못 끊는대요`],
    commentSubs: ["진짜 좋아!", "매일 쓰는 애정템", "못 끊어..."],
    productTts: `${celeb}이 추천한 ${product}. 지금 쿠팡에서 확인해보세요.`,
    features: ["프리미엄 퀄리티", "매일 쓰기 좋은 제품"],
  };
  const key = process.env.GEMINI_API_KEY;
  if (!key) return fb;
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `유튜브 숏폼 나레이션. "${celeb}"이(가) "${product}" 추천 영상.

[자막] ${subs.slice(0, 1500)}

[규칙]
- 반드시 "${celeb}" 이름을 hookLine에 포함!
- "~왈" "~의 필수템" 같은 뻔한 표현 금지
- 흥분해서 친구한테 소개하는 느낌. 과장 OK
- 한국어 조사를 정확히! "${celeb}" 이름 끝 글자 받침 확인해서 이/가, 은/는, 을/를 맞춰. 예: "제니가"(O) "제니이"(X), "정국이"(O) "정국이이"(X), "태연이"(O)
- commentTts의 처음 1개는 "${celeb}"이 왜 이걸 좋아하는지, 나머지 2개는 제품 설명

JSON:
{
  "hookLine": "첫 화면 자막. 반드시 ${celeb} 이름 포함! 15~22자. 호기심+감탄 자극. 예: '${celeb}이 홀딱 반한 이 립밤!', '${celeb} 10년째 쓰는 향수 정체', '${celeb}이 난리 난 이 치약!'",
  "commentTts": ["나레이션 3개. 첫 번째는 ${celeb}이 왜 좋아하는지 (25~40자). 나머지는 제품 매력 소개. 예: '${celeb}이 촬영장에서도 매일 바른대요 이거', '발색이 진짜 미쳤거든요 한번 보세요', '만원대인데 이 퀄리티 실화냐고요'"],
  "commentSubs": ["화면 자막 3개. 10~15자. 임팩트. 예: '촬영장에서도 매일!', '발색 미쳤다!!', '만원대 실화?!'"],
  "productTts": "제품 사진 나올 때 나레이션. 30~60자. 가격 꼭 말하고 놀라는 톤. 예: '이게 만삼천원이에요 진짜 미쳤죠'",
  "features": ["제품 장점 2~3개. 예: '24시간 촉촉 지속', '자극 없는 순한 성분'"]
}` }] }],
        generationConfig: { maxOutputTokens: 8192, temperature: 0.7 },
      }),
    });
    if (!res.ok) return fb;
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.find((p: { text?: string }) => p.text)?.text || "";
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return fb;
    const p = JSON.parse(m[0]);
    return {
      hookLine: p.hookLine || fb.hookLine,
      commentTts: p.commentTts?.length >= 3 ? p.commentTts : fb.commentTts,
      commentSubs: p.commentSubs?.length >= 3 ? p.commentSubs : fb.commentSubs,
      productTts: p.productTts || fb.productTts,
      features: p.features?.length > 0 ? p.features : fb.features,
    };
  } catch { return fb; }
}

// ─── 제품 정보 ───

async function productInfo(name: string) {
  const cId = process.env.NAVER_CLIENT_ID!, cSec = process.env.NAVER_CLIENT_SECRET!;
  const res = await fetch(`https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(name)}&display=5&sort=sim`,
    { headers: { "X-Naver-Client-Id": cId, "X-Naver-Client-Secret": cSec } });
  if (!res.ok) return { images: [] as string[], price: 0, title: name };
  const data = await res.json();
  const items = (data.items || []).filter((i: { image: string }) => i.image);
  return {
    images: items.slice(0, 3).map((i: { image: string }) => i.image),
    price: parseInt(items[0]?.lprice) || 0,
    title: items[0]?.title?.replace(/<[^>]*>/g, "") || name,
  };
}

async function dlImg(url: string, out: string): Promise<boolean> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", Referer: "https://google.com" } });
    if (!res.ok) return false;
    await sharp(Buffer.from(await res.arrayBuffer())).resize(600, 600, { fit: "contain", background: { r: 245, g: 245, b: 245, alpha: 1 } }).toFile(out);
    return true;
  } catch { return false; }
}

// ─── 오버레이 PNG 만들어서 영상에 합성 ───

async function overlayOnClip(clip: string, out: string, svgContent: string): Promise<void> {
  const pngPath = out.replace(".mp4", "_ov.png");
  await sharp(Buffer.from(`<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${svgContent}</svg>`)).png().toFile(pngPath);
  run(`ffmpeg -y -i "${clip}" -i "${pngPath}" -filter_complex "overlay=0:0" ${VIDEO} ${AUDIO} "${out}"`);
}

// ─── 영상 클립에 TTS 오디오 교체 (원본 음소거 + TTS) ───

function replaceAudioWithTts(clip: string, ttsPath: string, out: string): void {
  const ttsDur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${ttsPath}"`).toString().trim());
  const clipDur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${clip}"`).toString().trim());

  if (ttsDur > clipDur) {
    // TTS가 길면 클립 루프
    run(`ffmpeg -y -stream_loop -1 -i "${clip}" -i "${ttsPath}" -map 0:v -map 1:a ${VIDEO} ${AUDIO} -shortest "${out}"`);
  } else {
    run(`ffmpeg -y -i "${clip}" -i "${ttsPath}" -map 0:v -map 1:a ${VIDEO} ${AUDIO} -shortest "${out}"`);
  }
}

// ─── 제품 사진 슬라이드 카드 ───

async function productSlide(imgPath: string | null, title: string, price: number, features: string[], isLast: boolean): Promise<Buffer> {
  const hasImg = imgPath && fs.existsSync(imgPath);
  const featSvg = features.slice(0, 2).map((f, i) =>
    `<rect x="140" y="${1100 + i * 70}" width="800" height="55" rx="12" fill="#F0F0F0"/>
     <text x="540" y="${1135 + i * 70}" text-anchor="middle" font-size="26" fill="#333" font-family="sans-serif">✅ ${esc(f.slice(0, 28))}</text>`
  ).join("");

  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    ${!hasImg ? `<rect width="${W}" height="700" fill="#f5f5f5"/>` : ""}
    <rect y="680" width="${W}" height="${H - 680}" fill="white"/>
    <text x="540" y="800" text-anchor="middle" font-size="40" font-weight="900" fill="#111" font-family="sans-serif">${esc(title.slice(0, 24))}</text>
    ${price > 0 ? `<text x="540" y="900" text-anchor="middle" font-size="65" font-weight="900" fill="#E53935" font-family="sans-serif">${price.toLocaleString()}원</text>` : ""}
    <rect x="440" y="970" width="200" height="3" rx="1" fill="#E53935"/>
    <text x="540" y="1050" text-anchor="middle" font-size="26" fill="#999" font-family="sans-serif">이런 점이 좋아요</text>
    ${featSvg}
    ${""/* CTA는 상시 오버레이에서 처리 */}
  </svg>`;

  const base = await sharp({ create: { width: W, height: H, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer();
  const composites: sharp.OverlayOptions[] = [];
  if (hasImg) {
    const imgBuf = await sharp(fs.readFileSync(imgPath!)).resize(550, 550, { fit: "contain", background: { r: 245, g: 245, b: 245, alpha: 1 } }).png().toBuffer();
    composites.push({ input: imgBuf, top: 70, left: 265 });
  }
  composites.push({ input: Buffer.from(svg), top: 0, left: 0 });
  return sharp(base).composite(composites).png().toBuffer();
}

// ─── 메인 ───

async function main() {
  const [,, url, productName, celebName] = process.argv;
  if (!url || !productName || !celebName) { console.log('Usage: npx tsx src/celeb-video.ts "URL" "제품명" "연예인"'); process.exit(1); }

  const dir = path.resolve("output", `celeb_${celebName}_${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });

  // 1. 영상 다운로드
  console.log("🎬 영상 다운로드...");
  const { srcPath, duration } = downloadVideo(url, dir);
  console.log(`  ✅ ${Math.round(duration)}초`);

  // 2. 자막 추출 (타임스탬프 포함)
  console.log("📝 자막 추출...");
  const { entries: subEntries, fullText: subs } = downloadSubs(url);
  console.log(`  ${subs ? `✅ ${subEntries.length}개 구간, ${subs.length}자` : "⬜ 없음"}`);

  // 3. AI 분석
  console.log("🤖 AI 분석...");
  const ai = await gemini(celebName, productName, subs);
  console.log(`  ✅ "${ai.hookLine}"`);
  ai.commentSubs.forEach(s => console.log(`  💬 "${s}"`));

  // 4. 제품 정보 + 이미지
  console.log("🛍️ 제품 정보...");
  const prod = await productInfo(productName);
  const prodImgs: string[] = [];
  for (let i = 0; i < prod.images.length; i++) {
    const p = path.join(dir, `prod_${i}.jpg`);
    if (await dlImg(prod.images[i], p)) prodImgs.push(p);
  }
  console.log(`  ✅ ${prod.title.slice(0, 30)} — ${prod.price.toLocaleString()}원 (이미지 ${prodImgs.length}장)`);

  // 5. 제품 관련 구간에서 클립 추출
  console.log("✂️ 제품 관련 구간 클립 추출...");
  const timestamps = findProductTimestamps(subEntries, productName, 5, duration);
  console.log(`  타임스탬프: ${timestamps.map(t => Math.round(t) + "초").join(", ")}`);
  const rawClips = extractClips(srcPath, timestamps, dir, duration);
  console.log(`  ✅ ${rawClips.length}개 클립`);

  // 6. 조립
  console.log("🔗 조립...");
  const finals: string[] = [];

  // 6-1. 후킹 — 원본 음성 그대로 + 자막
  const hookOut = path.join(dir, "f_hook.mp4");
  await overlayOnClip(rawClips[0], hookOut, `
    <rect x="60" y="1100" width="960" height="120" rx="20" fill="black" opacity="0.75"/>
    <text x="540" y="1180" text-anchor="middle" font-size="55" font-weight="900" fill="white" font-family="sans-serif">${esc(ai.hookLine.slice(0, 20))}</text>
  `);
  finals.push(hookOut);

  // 5-2. 코멘트 클립들
  for (let i = 0; i < Math.min(ai.commentTts.length, 3); i++) {
    const ci = 1 + (i % (rawClips.length - 1));
    const withSub = path.join(dir, `f_comment_sub_${i}.mp4`);
    await overlayOnClip(rawClips[ci], withSub, `
      <rect x="60" y="1150" width="960" height="80" rx="15" fill="black" opacity="0.7"/>
      <text x="540" y="1205" text-anchor="middle" font-size="42" font-weight="bold" fill="white" font-family="sans-serif">${esc(ai.commentSubs[i])}</text>
    `);

    if (i === 0) {
      // 첫 번째 코멘트: 원본 음성 유지 (연예인 목소리 들려야 함)
      finals.push(withSub);
    } else {
      // 나머지: TTS 나레이션으로 제품 설명
      const ttsFile = path.join(dir, `tts_comment_${i}.mp3`);
      tts(ai.commentTts[i], ttsFile);
      const finalComment = path.join(dir, `f_comment_${i}.mp4`);
      replaceAudioWithTts(withSub, ttsFile, finalComment);
      finals.push(finalComment);
    }
  }

  // 5-3. 제품 사진 슬라이드 — 이미지 여러 장을 하나의 영상으로 + TTS
  const prodTtsFile = path.join(dir, "tts_prod.mp3");
  tts(ai.productTts, prodTtsFile);
  const ttsDur = parseFloat(execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${prodTtsFile}"`).toString().trim());

  // 이미지 카드 생성 (마지막 장에 CTA 포함)
  const imgCount = Math.max(1, prodImgs.length);
  for (let i = 0; i < imgCount; i++) {
    const isLast = i === imgCount - 1;
    const cardImg = path.join(dir, `prodcard_${i}.png`);
    fs.writeFileSync(cardImg, await productSlide(prodImgs[i] || null, prod.title, prod.price, ai.features, isLast));
  }

  // 첫 번째 이미지 + TTS로 메인 제품 클립
  const prodFinal = path.join(dir, "f_prod.mp4");
  run(`ffmpeg -y -loop 1 -i "${path.join(dir, "prodcard_0.png")}" -i "${prodTtsFile}" -vf "scale=${W}:${H},fps=30" ${VIDEO} ${AUDIO} -shortest "${prodFinal}"`);
  finals.push(prodFinal);

  // 나머지 이미지들은 각각 짧은 TTS
  for (let i = 1; i < imgCount; i++) {
    const extraTts = path.join(dir, `tts_extra_${i}.mp3`);
    tts(i === imgCount - 1 ? "고정댓글에서 바로 구매하세요." : "이것도 확인해보세요.", extraTts);
    const extraClip = path.join(dir, `f_prod_${i}.mp4`);
    run(`ffmpeg -y -loop 1 -i "${path.join(dir, `prodcard_${i}.png`)}" -i "${extraTts}" -vf "scale=${W}:${H},fps=30" ${VIDEO} ${AUDIO} -shortest "${extraClip}"`);
    finals.push(extraClip);
  }

  // 6. 합치기
  const concatFile = path.join(dir, "concat.txt");
  fs.writeFileSync(concatFile, finals.map(p => `file '${p}'`).join("\n"));
  const concatPath = path.join(dir, "concat_raw.mp4");
  run(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" ${VIDEO} ${AUDIO} "${concatPath}"`);

  // 7. 상시 오버레이 — 상단 타이틀 (굵직하게) + 하단 CTA
  // hookLine을 2줄로 분할
  const hookWords = ai.hookLine.slice(0, 24);
  const midIdx = Math.ceil(hookWords.length / 2);
  const hookL1 = hookWords.slice(0, midIdx);
  const hookL2 = hookWords.slice(midIdx);

  const overlaySvg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <!-- 상단 타이틀 배경 -->
    <defs>
      <linearGradient id="topGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="black" stop-opacity="0.85"/>
        <stop offset="100%" stop-color="black" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="${W}" height="250" fill="url(#topGrad)"/>

    <!-- 타이틀 텍스트 (2줄, 크고 굵게) -->
    <text x="540" y="95" text-anchor="middle" font-size="62" font-weight="900" fill="white" font-family="sans-serif">${esc(hookL1)}</text>
    <text x="540" y="175" text-anchor="middle" font-size="62" font-weight="900" fill="#FFD54F" font-family="sans-serif">${esc(hookL2)}</text>

    <!-- 하단 CTA -->
    <rect x="190" y="1480" width="700" height="70" rx="35" fill="#E53935" opacity="0.95"/>
    <text x="540" y="1527" text-anchor="middle" font-size="32" font-weight="900" fill="white" font-family="sans-serif">👆 프로필 링크에서 구매</text>
  </svg>`;
  const overlayPng = path.join(dir, "persistent_overlay.png");
  await sharp(Buffer.from(overlaySvg)).png().toFile(overlayPng);

  const finalPath = path.join(dir, "shorts.mp4");
  run(`ffmpeg -y -i "${concatPath}" -i "${overlayPng}" -filter_complex "overlay=0:0" ${VIDEO} ${AUDIO} "${finalPath}"`);

  // 원본 삭제
  try { fs.unlinkSync(srcPath); } catch {}

  // Downloads
  const dlName = `celeb_${celebName}_${productName.replace(/\s/g, "_")}.mp4`;
  const dlPath = path.join(process.env.HOME || "~", "Downloads", dlName);
  fs.copyFileSync(finalPath, dlPath);

  // 설명
  const pid = process.env.COUPANG_PARTNER_ID || "AF6424400";
  const cUrl = `https://www.coupang.com/np/search?q=${encodeURIComponent(productName)}`;
  const affLink = `https://link.coupang.com/re/AFFSDP?lptag=${pid}&subid=celeb&url=${encodeURIComponent(cUrl)}`;
  const desc = [`${celebName} 추천 ${productName} 🔥`, "", ...ai.commentSubs.map(s => `💬 "${s}"`), "",
    `📌 구매 링크:`, affLink, "",
    `이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.`, "",
    `#${celebName} #${productName.replace(/\s/g, "")} #추천템 #매일줍줍`].join("\n");
  fs.writeFileSync(path.join(dir, "description.txt"), desc);

  const d = execSync(`ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${finalPath}"`).toString().trim();
  console.log(`\n🎉 완성! ${Math.round(parseFloat(d))}초`);
  console.log(`📁 ${dlPath}`);
}

main().catch(console.error);
