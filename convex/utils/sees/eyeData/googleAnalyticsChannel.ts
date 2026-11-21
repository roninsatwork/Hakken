import { AI_ASSISTANTS_CHANNEL } from "../../aiAssistants";

/**
 * What a Google Analytics channel's own screen hands its eye (`channels/channel/page.tsx`), built in one place for the
 * screen and for a chat app's question (`chatAppEyes/googleAnalytics.ts`), so the two can't disagree
 * (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md, Option B): the channel's own read and its days, with the names its
 * findings use, the channel by its title.
 */

/** The channel's title: AI assistants by the page's own name for them, any other channel as Google names it. */
export function channelTitle(channel: string, assistantsTitle: string): string {
  return channel === AI_ASSISTANTS_CHANNEL ? assistantsTitle : channel;
}

/** The list the channel's table opens on (`ChannelTableViews`): AI assistants by assistant, any other channel by landing page. */
export function openingChannelList(channel: string): "source" | "landing" {
  return channel === AI_ASSISTANTS_CHANNEL ? "source" : "landing";
}

export function channelEyeData<Top, Days>(reads: { top: Top; days: Days }, words: { names: Record<string, string>; title: string }) {
  return { figures: reads.top, days: reads.days, names: { ...words.names, channel: words.title } };
}
