import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "매일줍줍 | 오늘의 개이득 핫딜",
  description: "매일 엄선한 최저가 핫딜. 안 사면 손해인 제품만 모았습니다.",
  openGraph: {
    title: "매일줍줍 | 오늘의 개이득 핫딜",
    description: "매일 엄선한 최저가 핫딜. 안 사면 손해인 제품만 모았습니다.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#0a0a0a] text-white">{children}</body>
    </html>
  );
}
