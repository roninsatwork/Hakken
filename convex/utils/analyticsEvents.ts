/**
 * Google Analytics events, as Hakken reads them
 * (docs/plans/active/google-analytics-plan.md GA5): which key events are
 * ticked as conversions for the client, and which never are. A scroll or a
 * video play is never counted by accident. One list, in one place, read by the
 * connection (`googleAnalyticsConnect.ts`) and its screen.
 */

/**
 * Key events that are nearly always a conversion — a form sent, a call or an
 * email clicked, a booking, a purchase — ticked for the client to confirm.
 */
export const LIKELY_CONVERSIONS: ReadonlySet<string> = new Set([
  "generate_lead",
  "form_submit",
  "submit_form",
  "contact",
  "contact_form",
  "contact_form_submit",
  "click_tel",
  "phone_click",
  "tel_click",
  "click_to_call",
  "call",
  "click_email",
  "email_click",
  "mailto_click",
  "book_appointment",
  "booking",
  "schedule",
  "request_quote",
  "quote_request",
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
