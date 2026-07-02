"use client";

import { useParams } from "next/navigation";
import { AdminRouteSubmenu } from "@/src/app/(dashboard)/admin/_components/AdminRouteSubmenu";

export function CompanyDirectorySectionNav() {
  const params = useParams();
  const companyId = params.id as string;
  const baseHref = `/admin/companies/${companyId}/directory`;
  const items = [
    { label: "Directory", href: `${baseHref}/users` },
    { label: "Invites", href: `${baseHref}/invites` },
  ];

  return (
    <AdminRouteSubmenu
      compactLabel="Directory section"
      label="Directory workspace sections"
      items={items}
      mode="compactOnly"
    />
  );
}
