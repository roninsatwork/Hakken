import type { ReactNode } from "react";
import { AdminRouteSubmenu } from "@/src/app/(dashboard)/admin/_components/AdminRouteSubmenu";

type CompanyAiLayoutProps = {
  children: ReactNode;
  params: Promise<{ id: string }>;
};

export default async function CompanyAiLayout({ children, params }: CompanyAiLayoutProps) {
  const { id } = await params;
  const baseHref = `/admin/companies/${id}/ai`;
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
    <div className="flex flex-col lg:flex-row lg:items-start gap-6 w-full">
      <AdminRouteSubmenu label="AI workspace sections" items={items} />
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}
