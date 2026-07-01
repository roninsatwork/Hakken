import type { ReactNode } from "react";
import { AdminRouteSubmenu } from "@/src/app/(dashboard)/admin/_components/AdminRouteSubmenu";

type CompanyDirectoryLayoutProps = {
  children: ReactNode;
  params: Promise<{ id: string }>;
};

export default async function CompanyDirectoryLayout({ children, params }: CompanyDirectoryLayoutProps) {
  const { id } = await params;
  const baseHref = `/admin/companies/${id}/directory`;
  const items = [
    { label: "Directory", href: `${baseHref}/users` },
    { label: "Invites", href: `${baseHref}/invites` },
  ];

  return (
    <div className="flex flex-col lg:flex-row lg:items-start gap-6 w-full">
      <AdminRouteSubmenu label="Directory workspace sections" items={items} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
