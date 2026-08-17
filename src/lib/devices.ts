/**
 * A browser's own description of itself, said the way a person would.
 *
 * The sign-in history stores `navigator.userAgent` verbatim, so the Device
 * column read:
 *
 *   Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36
 *   (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36
 *
 * That is a machine talking to a machine, sitting in a column a person reads to
 * answer one question: was that me? "Chrome on a Mac" answers it.
 *
 * Done when the row is drawn rather than when it is written, so every sign-in
 * already recorded reads properly too — there are years of them and rewriting
 * history to fix a label would be the wrong trade.
 *
 * The order of the checks matters. Every browser lies about being the others:
 * Edge's own string contains "Chrome" and "Safari", Chrome's contains "Safari".
 * So the most specific claim is tested first and the most-lied-about last.
 */

const BROWSERS: Array<{ name: string; match: RegExp }> = [
  { name: "Edge", match: /\bEdgA?\/|\bEdg\// },
  { name: "Opera", match: /\bOPR\/|\bOpera\b/ },
  { name: "Samsung Internet", match: /\bSamsungBrowser\// },
  { name: "Firefox", match: /\bFirefox\/|\bFxiOS\// },
  { name: "Chrome", match: /\bChrome\/|\bCriOS\// },
  { name: "Safari", match: /\bSafari\// },
];

const PLATFORMS: Array<{ name: string; match: RegExp }> = [
  // Before the Mac check: an iPad reports "Macintosh" in desktop mode.
  { name: "an iPad", match: /\biPad\b/ },
  { name: "an iPhone", match: /\biPhone\b/ },
  { name: "an Android phone", match: /\bAndroid\b/ },
  { name: "a Mac", match: /\bMacintosh\b|\bMac OS X\b/ },
  { name: "Windows", match: /\bWindows\b/ },
  { name: "Linux", match: /\bLinux\b|\bX11\b/ },
];

/**
 * `Chrome on a Mac`, or the best half of that, or the original.
 *
 * Returning the raw string when nothing matches is deliberate: a device nobody
 * anticipated is still evidence, and printing "Unknown" in its place would
 * throw away the only clue about what signed in.
 */
export function describeDevice(userAgent: string | null | undefined): string {
  const raw = (userAgent ?? "").trim();
  if (!raw) return "Unknown device";

  const browser = BROWSERS.find((entry) => entry.match.test(raw))?.name;
  const platform = PLATFORMS.find((entry) => entry.match.test(raw))?.name;

  if (browser && platform) return `${browser} on ${platform}`;
  if (browser) return browser;
  if (platform) return platform.replace(/^an? /, "").replace(/^./, (c) => c.toUpperCase());
  return raw;
}
