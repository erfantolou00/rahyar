import type { Metadata, Viewport } from "next";
import { InstallPrompt } from "@/components/install-prompt";
import { PwaRegister } from "@/components/pwa-register";
import { DirectionProvider } from "@/components/ui/direction";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "رهیار",
    template: "%s | رهیار",
  },
  description: "دستیار مالی شخصی",
  applicationName: "رهیار",
  robots: { index: false, follow: false },
  appleWebApp: {
    capable: true,
    title: "رهیار",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#4f46e5",
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
        <DirectionProvider direction="rtl">
          {children}
          <PwaRegister />
          <InstallPrompt />
        </DirectionProvider>
      </body>
    </html>
  );
}
