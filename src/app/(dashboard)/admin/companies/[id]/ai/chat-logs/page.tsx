"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { ChatLogsScreen } from "@/src/app/(dashboard)/admin/_features/chat-logs/ChatLogsScreen";

export default function CompanyChatLogsDashboard() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;

  return <ChatLogsScreen scope={{ kind: "company", companyId }} />;
}
