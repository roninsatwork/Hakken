/**
 * A page by the name a shop owner would say (funnel-way-1-plan-2026-11-05.md, step 3): Basket, Checkout, Search results,
 * with its web address kept for the hover. One short list for each shop platform, as `shopPages.ts` has. Any other page takes
 * its name from its address. Two addresses with one name are the same thing to a person.
 */
const SHOP_NAMES: ReadonlyArray<readonly [RegExp, string]> = [
  // Magento.
  [/^\/checkout\/cart/, "Basket"],
  [/^\/checkout\/onepage\/success/, "Order complete"],
  [/^\/checkout/, "Checkout"],
  [/^\/catalogsearch\/result/, "Search results"],
  [/^\/customer\/account\/create/, "New account"],
  [/^\/customer\/account\/login/, "Log in"],
  [/^\/customer\/account/, "Your account"],
  [/^\/sales\/order\/history/, "Order history"],
  [/^\/sales\/order/, "An order"],
  [/^\/wishlist/, "Wish list"],
  // Shopify.
  [/^\/cart/, "Basket"],
  [/^\/checkouts/, "Checkout"],
  [/^\/search/, "Search results"],
  [/^\/account\/login/, "Log in"],
  [/^\/account/, "Your account"],
  // WooCommerce.
  [/^\/basket/, "Basket"],
  [/^\/my-account/, "Your account"],
  // BigCommerce.
  [/^\/cart\.php/, "Basket"],
  [/^\/account\.php/, "Your account"],
  [/^\/login\.php/, "Log in"],
  [/^\/search\.php/, "Search results"],
];

const pathOf = (address: string) => address.replace(/^https?:\/\/[^/]+/i, "").split(/[?#]/)[0].toLowerCase();

/** "Home page", a shop's page by its plain name, or the last part of the address in words. */
export function pageName(address: string): string {
  const path = pathOf(address);
  if (path === "" || path === "/") return "Home page";
  for (const [pattern, name] of SHOP_NAMES) if (pattern.test(path)) return name;
  const last = path.replace(/\/+$/, "").split("/").pop() ?? path;
  const words = last.replace(/\.(html?|php|aspx?)$/, "").replace(/[-_]+/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : address;
}

/** Letters a page's short name keeps (`shortTitle`). */
export const SHORT_NAME = 28;

/**
 * A page's title, short, for a chart's key or the eye's words (Anthony on the Search Console Pages canvas, 17 November
 * 2026: "i dont like long axis lables"): without the website's name after its " | " or " - ", cut to about 28 letters
 * at a word. "A Guide To Choose The Right Tubular Latch - Our Blog" reads "A Guide To Choose The Right…". Search
 * Console's Pages chart (`shortPageName`) and its eye's movers say pages so.
 */
export function shortTitle(name: string): string {
  // Any space beside the bar or dash: More Handles' titles carry a non-breaking one ("Door Handles |\u00a0More Handles"),
  // which the chart and the eye said whole until 18 November 2026. En and em dashes split it too.
  const bare = name.split(/\s+[|\u2013\u2014-]\s+/)[0].trim() || name.trim();
  if (bare.length <= SHORT_NAME) return bare;
  const cut = bare.slice(0, SHORT_NAME + 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > 8 ? cut.slice(0, at) : bare.slice(0, SHORT_NAME)).replace(/[\s,.;:?!-]+$/, "")}…`;
}
