"use client";

import { useParams } from "next/navigation";
import { AdminRouteSubmenu } from "@/src/app/(dashboard)/admin/_components/AdminRouteSubmenu";

export function CompanyAiSectionNav() {
  const params = useParams();
  const companyId = params.id as string;
  const baseHref = `/admin/companies/${companyId}/ai`;
  const items = [
    { label: "Overview", href: baseHref },
    { label: "Knowledge", href: `${baseHref}/knowledge` },
    { label: "Memory", href: `${baseHref}/memory` },
    { label: "Skills", href: `${baseHref}/skills` },
    { label: "Prompt", href: `${baseHref}/prompt` },
    { label: "AI Rules", href: `${baseHref}/rules` },
    { label: "AI Models", href: `${baseHref}/models` },
    { label: "Evals", href: `${baseHref}/evals` },
    { label: "Chat Logs", href: `${baseHref}/chat-logs` },
  ];

  return (
    <AdminRouteSubmenu
      compactLabel="AI section"
      label="AI workspace sections"
      items={items}
      mode="compactOnly"
    />
  );
}
