import { productIdentity } from "@/product.identity";
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
  title: productIdentity.title,
  description: productIdentity.description,
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
      {/*
        Inter's variable sits on <html>, not <body>: globals.css works out
        `--font-sans: var(--font-inter), …` on the root, and with the variable
        only on <body> it never resolved there, so the app quietly drew the
        system font (found 2026-10-04, design-drift-plan; Anthony: "make it
        inter"). JetBrains Mono stays on <body>, where `font-mono` reads it.
      */}
      <html lang={locale} suppressHydrationWarning className={inter.variable}>
        <body
          suppressHydrationWarning
          className={cn(
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
