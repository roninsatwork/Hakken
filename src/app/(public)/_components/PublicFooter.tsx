import { productIdentity } from "@/product.identity";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { ContactLink } from "./ContactLink";

/* Only routes that exist — see the note in PublicNav. */
const COLUMNS = [
  {
    heading: "Company",
    links: [
      { href: "/contact", label: "Contact" },
      { href: "/login", label: "Sign in" },
    ],
  },
];

export function PublicFooter() {
  // Deployment configuration, never hardcoded — an unconfigured deployment
  // renders the credit without a link (see no-client-specific-fallbacks test).
  const companyUrl = process.env.NEXT_PUBLIC_COMPANY_URL;
  const credit = "Powered by Ronins";

  return (
    <footer className="border-t border-[var(--ps-line)] bg-[var(--ps-cream-2)]">
      <div className="mx-auto flex w-full max-w-[1328px] flex-col gap-10 px-[clamp(20px,3.4vw,48px)] py-14">
        <div className="flex flex-col justify-between gap-10 sm:flex-row">
          <div className="flex max-w-sm flex-col gap-3">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[var(--ps-orange)] text-white">
                <Sparkles className="h-4 w-4" />
              </span>
              <span className="ps-display text-[15px] tracking-[0.18em]">{productIdentity.name.toUpperCase()}</span>
            </div>
            <p className="text-[13px] leading-relaxed text-[var(--ps-ink-60)]">
              {productIdentity.tagline}
            </p>
          </div>

          <div className="flex gap-16">
            {COLUMNS.map((column) => (
              <div key={column.heading} className="flex flex-col gap-3">
                <span className="text-[12.5px] font-bold uppercase tracking-[0.12em] text-[var(--ps-ink-60)]">
                  {column.heading}
                </span>
                {column.links.map((link) =>
                  link.href === "/contact" ? (
                    <ContactLink
                      key={link.href}
                      className="text-[14px] text-[var(--ps-ink-60)] transition-colors hover:text-[var(--ps-ink)]"
                    >
                      {link.label}
                    </ContactLink>
                  ) : (
                    <Link
                      key={link.href}
                      href={link.href}
                      className="text-[14px] text-[var(--ps-ink-60)] transition-colors hover:text-[var(--ps-ink)]"
                    >
                      {link.label}
                    </Link>
                  )
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-3 border-t border-[var(--ps-line)] pt-6 sm:flex-row sm:items-center">
          <p className="text-[12px] uppercase tracking-widest text-[var(--ps-ink-60)]">
            © {new Date().getFullYear()} {productIdentity.name}. All rights reserved.
          </p>
          <p className="text-[12px] uppercase tracking-widest text-[var(--ps-ink-60)]">
            {companyUrl ? (
              <a
                href={companyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-[var(--ps-ink)]"
              >
                {credit}
              </a>
            ) : (
              <span>{credit}</span>
            )}
          </p>
        </div>
      </div>
    </footer>
  );
}
