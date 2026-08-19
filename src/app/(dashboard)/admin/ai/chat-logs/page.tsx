"use client";

import { ChatLogsScreen } from "@/src/app/(dashboard)/admin/_features/chat-logs/ChatLogsScreen";

export default function ChatLogsDashboard() {
  return <ChatLogsScreen scope={{ kind: "global" }} />;
}
