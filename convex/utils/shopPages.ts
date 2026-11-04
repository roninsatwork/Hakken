/**
 * A shop's own workings: its search results, basket, checkout and account pages. On More Handles they get 1 in 5 of all
 * views and fill the top of All pages, crowding out the pages a shop can do something about (all-pages-way-6-plan-2026-11-04.md,
 * step 2). They're found by their web address, one short list for each shop platform, so nothing saved changes and they
 * stay in Not sorted on every other screen. A website with none of these addresses shows every page.
 */

/** All pages' Classification menu: these pages together, as if they were a classification. They aren't one. */
export const SHOP_PAGES_KIND = "SHOP_PAGES";

/** Whole folders of an address. `/customer` matches `/customer/account/`, and never `/customer-stories/`. */
const SHOP_FOLDERS = [
  // Magento.
  "/catalogsearch", "/checkout", "/customer", "/sales/order", "/sales/guest", "/wishlist", "/paypal",
  // Searchanise, a search app that runs on Magento and Shopify.
  "/searchanise",
  // Shopify.
  "/cart", "/checkouts", "/account", "/search", "/orders",
  // WooCommerce.
  "/my-account",
  // BigCommerce.
  "/cart.php", "/account.php", "/login.php", "/search.php",
] as const;

function pathOf(address: string): string {
  const withoutHost = address.replace(/^https?:\/\/[^/]+/i, "");
  const path = withoutHost.split(/[?#]/)[0].toLowerCase();
  return path.startsWith("/") ? path : `/${path}`;
}

export function isShopPage(address: string): boolean {
  const path = pathOf(address);
  return SHOP_FOLDERS.some((folder) => path === folder || path === `${folder}/` || path.startsWith(`${folder}/`));
}
