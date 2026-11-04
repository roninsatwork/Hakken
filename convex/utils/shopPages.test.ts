import { describe, expect, test } from "vitest";
import { isShopPage } from "./shopPages";

describe("a shop's own search, basket and account pages", () => {
  test.each([
    // Magento, as More Handles has them.
    "https://www.morehandles.co.uk/catalogsearch/result/",
    "https://www.morehandles.co.uk/catalogsearch/result/index/",
    "https://www.morehandles.co.uk/checkout/cart/",
    "https://www.morehandles.co.uk/checkout/onepage/success/",
    "https://www.morehandles.co.uk/customer/account/login/referer/aHR0cHM6Ly93d3c/",
    "https://www.morehandles.co.uk/sales/order/history/",
    "https://www.morehandles.co.uk/wishlist/",
    "https://www.morehandles.co.uk/paypal/express/review/",
    "https://www.morehandles.co.uk/searchanise/result",
    // Shopify.
    "https://shop.test/cart",
    "https://shop.test/checkouts/abc",
    "https://shop.test/account/login",
    "https://shop.test/search?q=knob",
    // WooCommerce.
    "https://shop.test/my-account/orders/",
    // BigCommerce.
    "https://shop.test/cart.php",
    // A path alone reads the same, and capitals make no difference.
    "/Checkout/Cart/",
  ])("%s is one", (address) => {
    expect(isShopPage(address)).toBe(true);
  });

  test.each([
    "https://www.morehandles.co.uk/",
    "https://www.morehandles.co.uk/cupboard-handles-knobs/cupboard-handles.html",
    "https://www.morehandles.co.uk/waltz-round-cupboard-knob-on-stepped-rose.html",
    // The word alone isn't enough: only the whole folder counts.
    "https://shop.test/customer-stories/",
    "https://shop.test/searchlights/",
    "https://shop.test/accounting-services/",
    "https://shop.test/sales-training/",
    "https://shop.test/sales/",
    "https://shop.test/blog/how-to-checkout-faster/",
  ])("%s isn't one", (address) => {
    expect(isShopPage(address)).toBe(false);
  });
});
