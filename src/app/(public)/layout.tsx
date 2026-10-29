import type { Metadata } from "next";
import { productIdentity } from "@/product.identity";
import "@/src/ui/components/public/rain.css";

export const metadata: Metadata = {
  title: {
    default: `${productIdentity.name} — Discovery`,
    template: `%s · ${productIdentity.name}`,
  },
  description: productIdentity.tagline,
};

/**
 * The public site is one screen, the home page, in the app's own dark look
 * (docs/plans/active/home-page-plan.md, 2026-10-29). It wears the `dark`
 * tokens whatever the visitor's device prefers, so the page a client lands on
 * is the page they were shown.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="dark public-home flex min-h-screen w-full flex-col bg-background text-foreground">{children}</div>;
}
