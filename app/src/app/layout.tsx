import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: { default: "LBE Fire Safety CRM", template: "%s · LBE CRM" },
  description: "Quotations, orders, purchases, projects, refills and automation agents for Linga Bhairavi Enterprise, Hosur.",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#d0221d" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN">
      <body className={`${inter.variable} antialiased`}>{children}</body>
    </html>
  );
}
