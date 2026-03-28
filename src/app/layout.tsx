import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from 'next-intl';
import { UIProvider } from "@/src/context/UIContext";
import { ConvexClientProvider } from "@/src/context/ConvexClientProvider";
import SidebarNavigation from "@/src/ui/components/layout/SidebarNavigation";
import FluidWorkspace from "@/src/ui/components/layout/FluidWorkspace";

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
                <div className="flex h-screen overflow-hidden">
                  <SidebarNavigation />
                  <FluidWorkspace>
                    {children}
                  </FluidWorkspace>
                </div>
              </UIProvider>
            </NextIntlClientProvider>
          </ConvexClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
