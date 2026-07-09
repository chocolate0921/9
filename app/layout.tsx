import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CarryMate",
  description: "AI-assisted mobile collaboration prototype for student team projects.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
