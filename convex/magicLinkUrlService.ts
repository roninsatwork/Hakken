/**
 * Turning the framework's sign-in link into one a mail scanner cannot spend.
 *
 * Convex Auth mails a link to `<SITE_URL>/?code=<code>`, and the React client
 * redeems any `code` it finds in the query string the moment the page mounts.
 * That is one GET away from a signed-in session, which is exactly what a
 * corporate mail gateway does to every link it delivers. Ours was being
 * redeemed 24 to 29 seconds after send — before the recipient had the email —
 * and the code is single-use, so by the time a human clicked there was nothing
 * left. They asked for another, it happened again, and that is the loop.
 *
 * So the mailed link points at a page that holds the code and does nothing with
 * it. The parameter is renamed on the way out, because a page carrying `code`
 * would be redeemed by the provider on mount wherever it lived — the rename is
 * what makes the interstitial inert rather than merely quiet. Redemption
 * happens only inside a click handler on that page: after an anchor-based
 * first version was spent by a gateway that renders pages and follows the
 * links it finds in them, no URL that redeems on load exists anywhere — not in
 * the email, not in the page's DOM.
 *
 * A sandbox that synthetically clicks buttons could still spend the code. The
 * typed one-time code remains the answer for those, and neither option takes
 * the other away.
 */

/** The query parameter the interstitial carries. Deliberately not `code`. */
export const CONSENT_CODE_PARAM = "c";

/** Where the interstitial lives, relative to the app's own origin. */
export const CONSENT_PATH = "/verify";

/**
 * Rewrite the framework's verification URL into our consent URL.
 *
 * Returns the original URL untouched when it carries no `code`, or when no site
 * URL is configured. Failing back to a working-but-scannable link is the right
 * trade: a link that signs people in too easily still signs them in, whereas a
 * malformed one strands them.
 */
export function buildConsentUrl(actionUrl: string, siteUrl: string | undefined): string {
  const configuredSite = siteUrl?.trim();
  if (!configuredSite) {
    return actionUrl;
  }

  let parsed: URL;
  try {
    parsed = new URL(actionUrl);
  } catch {
    return actionUrl;
  }

  const code = parsed.searchParams.get("code");
  if (!code) {
    return actionUrl;
  }

  let consent: URL;
  try {
    consent = new URL(CONSENT_PATH, configuredSite.endsWith("/") ? configuredSite : `${configuredSite}/`);
  } catch {
    return actionUrl;
  }

  consent.searchParams.set(CONSENT_CODE_PARAM, code);

  // Carry the caller's redirect through, so a link that was meant to land on a
  // particular screen still does once the button is pressed.
  const redirectTo = parsed.searchParams.get("redirectTo");
  if (redirectTo) {
    consent.searchParams.set("redirectTo", redirectTo);
  }

  return consent.toString();
}
