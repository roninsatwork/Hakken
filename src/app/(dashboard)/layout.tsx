import SidebarNavigation from "@/src/ui/components/layout/SidebarNavigation";
import FluidWorkspace from "@/src/ui/components/layout/FluidWorkspace";

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <SidebarNavigation />
      <FluidWorkspace>
        {children}
      </FluidWorkspace>
    </div>
  );
}
