"use client";

import { ChatAppPage } from "../ChatAppPage";

/** Claude's own page, opened from the profile's Integrations tab (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, board 3). */
export default function ClaudeIntegrationPage() {
  return <ChatAppPage app="claude" />;
}
