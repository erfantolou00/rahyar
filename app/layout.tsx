import type { Metadata } from "next";
import { DirectionProvider } from "@/components/ui/direction";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "رهیار",
    template: "%s | رهیار",
  },
  description: "دستیار مالی شخصی",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className="h-full antialiased">
      <head>
        <link
          rel="preload"
          href="/fonts/vazirmatn.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-full">
        <DirectionProvider direction="rtl">{children}</DirectionProvider>
      </body>
    </html>
  );
}
