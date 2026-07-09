import type { Metadata } from "next";
import type { Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { ErrorBoundary } from "@/components/error-boundary";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f8fffe" },
    { media: "(prefers-color-scheme: dark)", color: "#0d0d1a" },
  ],
};

export const metadata: Metadata = {
  title: "Delta — Трекер задач",
  description: "Delta — операционный монитор БА и монитор руководителя.",
  authors: [{ name: "Delta Team" }],
  icons: { icon: "/logo.svg" },
  openGraph: {
    title: "Delta — Трекер задач",
    description: "Операционный монитор БА и монитор руководителя",
    siteName: "Delta",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <ErrorBoundary>
          {children}
        </ErrorBoundary>
        <Toaster />
      </body>
    </html>
  );
}
