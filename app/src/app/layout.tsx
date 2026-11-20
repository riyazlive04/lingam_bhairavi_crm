import type { Metadata, Viewport } from "next";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font (CSP allows fonts from 'self' only).
const sans = Inter({ subsets: ["latin"], variable: "--font-sans-app", display: "swap" });
const display = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-display-app", weight: ["600", "700", "800"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "LBE Fire Safety CRM", template: "%s · LBE CRM" },
  description: "Quotations, orders, purchases, projects, refills and daily automation for Linga Bhairavi Enterprise, Hosur.",
  applicationName: "LBE Fire Safety CRM",
  generator: "Sirah Digital",
  authors: [{ name: "Sirah Digital", url: "https://sirahdigital.in/" }],
  creator: "Sirah Digital",
  publisher: "Sirah Digital",
  robots: { index: false, follow: false },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#cf2a1d" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0f14" },
  ],
};

const THEME_SCRIPT = `try{var t=localStorage.getItem("lbe-theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        {/* Apply a saved light/dark choice before paint (no flash). */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className={`${sans.variable} ${display.variable} antialiased`}>{children}</body>
    </html>
  );
}
