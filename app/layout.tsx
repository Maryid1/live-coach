import type { Metadata } from "next";
import "./coach.css";

export const metadata: Metadata = {
  title: "在场 · 健身直播助播台",
  description: "把注意力留给观众。多平台问答、提词、暖场和直播自查。",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
