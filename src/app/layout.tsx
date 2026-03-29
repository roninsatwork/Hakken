import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { UIProvider } from "@/src/context/UIContext";
import { ConvexClientProvider } from "@/src/context/ConvexClientProvider";

import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server";

import { ThemeProvider } from "@/src/ui/providers/ThemeProvider";
import { cn } from "@/src/ui/lib/utils";

import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sonae - Protocol",
  description: "Sonae Living Dossier",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html lang="en" suppressHydrationWarning>
        <body
          suppressHydrationWarning
          className={cn(
            inter.variable, 
            jetbrainsMono.variable, 
            "antialiased min-h-screen pt-0 m-0 w-full font-sans tracking-tight"
          )}
        >
          <ThemeProvider>
            <ConvexClientProvider>
              <NextIntlClientProvider>
                <UIProvider>
                  <div className="w-full min-h-screen flex flex-col items-stretch overflow-x-hidden">
                  {children}
                </div>
                </UIProvider>
              </NextIntlClientProvider>
            </ConvexClientProvider>
          </ThemeProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
