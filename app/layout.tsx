import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { DM_Sans, Fraunces, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const dmSans = DM_Sans({
  variable: "--font-dm-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Vakya - Learn languages by reading what you love",
  description: "Transform any article into a personalized language lesson. Translate to your level, click words for instant meanings, and build your vocabulary naturally.",
  keywords: ["language learning", "translation", "vocabulary", "reading", "CEFR", "language app"],
  authors: [{ name: "Vakya" }],
  openGraph: {
    title: "Vakya - Learn languages by reading what you love",
    description: "Transform any article into a personalized language lesson.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body className={`${dmSans.variable} ${fraunces.variable} ${jetbrainsMono.variable} antialiased`}>
          <div id="app-scroll-wrapper">
            {children}
          </div>
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
