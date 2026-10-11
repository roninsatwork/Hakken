/**
 * Google Analytics events, as Hakken reads them
 * (docs/plans/active/google-analytics-plan.md GA5): which key events are
 * ticked as conversions for the client, and which never are. A scroll or a
 * video play is never counted by accident. One list, in one place, read by the
 * connection (`googleAnalyticsConnect.ts`) and its screen.
 */

/**
 * Key events that are nearly always a conversion — a form sent, a chat
 * started, a call or an email clicked, a booking, a purchase — ticked for the
 * client to confirm. Each has its name in every language
 * (`googleAnalytics.events`, held by `analyticsEvents.test.ts`).
 *
 * The common variants a website's own tag names are here too: Ronins' own
 * events (`form_submission`, `live_chat_event`, `phone_number_click`,
 * `email_link_click`) were missing, so its first connect ticked Purchase,
 * which never fired, and left its 12 form submissions out (plan §16).
 */
export const LIKELY_CONVERSIONS: ReadonlySet<string> = new Set([
  // A form sent.
  "generate_lead",
  "form_submit",
  "submit_form",
  "form_submission",
  "form_submitted",
  "form_sent",
  "form_complete",
  "form_completed",
  "contact",
  "contact_form",
  "contact_form_submit",
  "contact_us",
  "contact_us_submit",
  "lead",
  "lead_form",
  "lead_submit",
  "enquiry",
  "enquiry_form",
  "enquiry_submit",
  "inquiry",
  "inquiry_form",
  // A chat started.
  "live_chat",
  "live_chat_event",
  "live_chat_start",
  "chat_start",
  "chat_started",
  "start_chat",
  // A phone number clicked.
  "click_tel",
  "phone_click",
  "tel_click",
  "click_to_call",
  "call",
  "phone_call",
  "phone_number_click",
  "phone_link_click",
  "tel_link_click",
  "click_phone",
  "call_click",
  // An email address clicked.
  "click_email",
  "email_click",
  "mailto_click",
  "email_link_click",
  "email_link",
  "click_mailto",
  "mailto",
  // A booking, a call back or a quote.
  "book_appointment",
  "booking",
  "book_now",
  "appointment",
  "appointment_booked",
  "schedule",
  "request_callback",
  "callback_request",
  "request_quote",
  "quote_request",
  // A sale.
  "purchase",
]);

/**
 * Events that are never a conversion, however the property marks them:
 * reading, scrolling, watching, downloading. Never ticked for the client, and
 * the screen says why.
 */
export const NEVER_TICKED: ReadonlySet<string> = new Set([
  "scroll",
  "page_view",
  "session_start",
  "first_visit",
  "user_engagement",
  "view_search_results",
  "video_start",
  "video_progress",
  "video_complete",
  "file_download",
  "click",
]);

/** Whether a key event is ticked when the client first chooses what counts. */
export function tickedAtFirst(eventName: string): boolean {
  return LIKELY_CONVERSIONS.has(eventName) && !NEVER_TICKED.has(eventName);
}

/** The event that is a shop's sale: its purchases and revenue come from Analytics' own figures (GA7). */
export const PURCHASE_EVENT = "purchase";

/**
 * Google's own events (google-analytics-plan.md GA30, §18.6.5), by who
 * records them: Google itself on every website, its enhanced measurement, and
 * a shop's steps. Each has its name in every language beside the likely
 * conversions (`googleAnalytics.events`); an event Hakken does not know — the
 * website's own — shows Google's name.
 */
export const AUTOMATIC_EVENTS: ReadonlySet<string> = new Set([
  "page_view", "session_start", "first_visit", "user_engagement", "first_open", "screen_view",
]);
export const MEASURED_EVENTS: ReadonlySet<string> = new Set([
  "scroll", "click", "view_search_results", "file_download", "form_start", "form_submit",
  "video_start", "video_progress", "video_complete",
]);
export const SHOP_EVENTS: ReadonlySet<string> = new Set([
  "view_item_list", "select_item", "view_item", "add_to_wishlist", "add_to_cart", "remove_from_cart", "view_cart",
  "begin_checkout", "add_shipping_info", "add_payment_info", "purchase", "refund", "view_promotion", "select_promotion",
]);
/** Google's other recommended events: sent by the website's own tag, named all the same. */
export const RECOMMENDED_EVENTS: ReadonlySet<string> = new Set([
  "login", "sign_up", "search", "share", "select_content",
  "qualify_lead", "disqualify_lead", "working_lead", "close_convert_lead", "close_unconvert_lead",
]);

/** Events' kinds, as the Kind filter lists them: what counts first, then Google's, then the website's own. */
export const EVENT_KINDS = ["conversion", "automatic", "measured", "shop", "own"] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

/** An event's kind: a conversion when it counts, else who records it. */
export function eventKind(eventName: string, counted: boolean): EventKind {
  if (counted) return "conversion";
  if (AUTOMATIC_EVENTS.has(eventName)) return "automatic";
  if (MEASURED_EVENTS.has(eventName)) return "measured";
  if (SHOP_EVENTS.has(eventName)) return "shop";
  return "own";
}

/**
 * What an event was about, by Google's own name for it (§18.6.5): the link a
 * click followed, the file downloaded, the words searched, how far people
 * scrolled, the video. Any other event has only the pages it happened on.
 */
export const EVENT_DETAIL: Readonly<Record<string, "linkUrl" | "fileName" | "searchTerm" | "percentScrolled" | "videoTitle">> = {
  click: "linkUrl",
  file_download: "fileName",
  view_search_results: "searchTerm",
  scroll: "percentScrolled",
  video_start: "videoTitle",
  video_progress: "videoTitle",
  video_complete: "videoTitle",
};
export type EventDetail = (typeof EVENT_DETAIL)[string];
