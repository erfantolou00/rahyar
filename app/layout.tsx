import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import { DirectionProvider } from "@/components/ui/direction";
import "./globals.css";

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  display: "swap",
  variable: "--font-sans",
});

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
    <html lang="fa" dir="rtl" className={`${vazirmatn.variable} ${vazirmatn.className} h-full antialiased`}>
      <body className="min-h-full">
        <DirectionProvider direction="rtl">{children}</DirectionProvider>
      </body>
    </html>
  );
}
