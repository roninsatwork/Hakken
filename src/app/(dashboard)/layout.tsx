import { Bricolage_Grotesque } from "next/font/google";
import { cn } from "@/src/ui/lib/utils";
import SidebarNavigation from "@/src/ui/components/layout/SidebarNavigation";
import FluidWorkspace from "@/src/ui/components/layout/FluidWorkspace";

/**
 * The display face, shared with the public site.
 *
 * `/app` tells the same story to the same buyer as the marketing site, and was
 * telling it in a different voice — Inter Light against the site's Bricolage.
 * Loading it here rather than in the page keeps it a layout concern, and the
 * `.sonae-display` class in globals.css is the only thing that reads it.
 */
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
});

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className={cn(bricolage.variable, "flex h-screen overflow-hidden bg-background")}>
      <SidebarNavigation />
      <FluidWorkspace>
        {children}
      </FluidWorkspace>
    </div>
  );
}
