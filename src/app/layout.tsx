import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getLocale } from 'next-intl/server';
import { UIProvider } from "@/src/context/UIContext";
import { ToastProvider } from "@/src/context/ToastContext";
import { ConvexClientProvider } from "@/src/context/ConvexClientProvider";
import { SystemSettingsProvider } from "@/src/context/SystemSettingsContext";
import { AnalyticsProvider } from "@/src/ui/components/layout/AnalyticsProvider";

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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <ConvexAuthNextjsServerProvider>
      <html lang={locale} suppressHydrationWarning>
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
              <SystemSettingsProvider>
                <NextIntlClientProvider locale={locale} messages={messages}>
                  <UIProvider>
                    <ToastProvider>
                      <div className="w-full min-h-screen flex flex-col items-stretch overflow-x-hidden">
                        {children}
                      </div>
                      <AnalyticsProvider />
                    </ToastProvider>
                  </UIProvider>
                </NextIntlClientProvider>
              </SystemSettingsProvider>
            </ConvexClientProvider>
          </ThemeProvider>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  );
}
