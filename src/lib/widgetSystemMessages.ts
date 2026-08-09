/**
 * Visitor-language text for platform-authored widget messages.
 *
 * A message row carrying `systemKey` was written by the platform, not by a
 * model, so its wording is ours to translate. The stored `content` is English
 * and stays the fallback everywhere else a transcript is read — admin views,
 * exports, older clients. Only the widget swaps it, because only the widget is
 * read by someone whose language we cannot know server-side: an anonymous
 * visitor sends no locale cookie, so the best signal is the browser they are
 * standing in.
 *
 * This is deliberately a dictionary, not a call into next-intl: the app's
 * locale machinery is cookie-driven and would always answer "en" for a
 * visitor. If the widget ever grows real visitor-language support, fold these
 * strings into that and delete this file.
 */

export type WidgetSystemKey = "quotaRefusal";

const TEXTS: Record<WidgetSystemKey, Record<string, string>> = {
  quotaRefusal: {
    en: "I'm sorry, but I can't take new messages right now. Please try again later.",
    it: "Mi dispiace, ma al momento non posso ricevere nuovi messaggi. Riprova più tardi.",
  },
};

function isKnownKey(key: string): key is WidgetSystemKey {
  return key in TEXTS;
}

/**
 * The text a widget visitor should see for a message.
 *
 * `language` is a BCP 47 tag (`navigator.language`, e.g. "it-IT"); only its
 * primary subtag matters here. Unknown keys and unknown languages fall back to
 * the stored English content, so a new systemKey can ship server-side before
 * any client learns it.
 */
export function widgetMessageDisplayText(
  message: { content: string; systemKey?: string },
  language: string | undefined
): string {
  if (!message.systemKey || !isKnownKey(message.systemKey)) return message.content;

  const primary = (language ?? "en").toLowerCase().split("-")[0];
  return TEXTS[message.systemKey][primary] ?? message.content;
}
