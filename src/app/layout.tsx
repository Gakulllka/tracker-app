import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Delta — Трекер задач",
  description: "Delta — операционный монитор БА и монитор руководителя. Управление задачами, бюджетами и план-фактом.",
  keywords: ["Delta", "трекер задач", "монитор БА", "план-факт", "управление задачами"],
  authors: [{ name: "Delta Team" }],
  icons: {
    icon: "/logo.svg",
  },
  openGraph: {
    title: "Delta — Трекер задач",
    description: "Операционный монитор БА и монитор руководителя",
    siteName: "Delta",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Delta — Трекер задач",
    description: "Операционный монитор БА и монитор руководителя",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
