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
