/**
 * How often one address may ask to be sent a way in.
 *
 * Both ways in — the magic link and the typed code — are a button that posts
 * mail to whatever address is in the box. Nobody is signed in yet, so the limit
 * is per address rather than per person: the point is not to protect an account
 * but to stop the sign-in form being used to bury someone in email.
 *
 * Kept free of database access so the limit can be tested directly. Sign-in is
 * the one screen where a half-built guard locks real people out.
 */

/** Anthony's ruling, 2026-08-25: thirty an hour, on both ways in. */
export const SIGN_IN_MAX_REQUESTS_PER_HOUR = 30;

export const SIGN_IN_REQUEST_WINDOW_MS = 60 * 60 * 1000;

/**
 * Whether another sign-in email may be sent to this address.
 *
 * Counts requests, not sends: an address that has been refused thirty times
 * still gets no mail, and the refusals are what the auth trail shows.
 */
export function isWithinHourlySignInLimit(recentRequestTimes: number[], now: number): boolean {
  const cutoff = now - SIGN_IN_REQUEST_WINDOW_MS;
  return recentRequestTimes.filter((at) => at > cutoff).length < SIGN_IN_MAX_REQUESTS_PER_HOUR;
}
