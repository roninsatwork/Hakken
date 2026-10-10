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
