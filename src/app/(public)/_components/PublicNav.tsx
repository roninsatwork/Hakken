"use client";
import { productIdentity } from "@/product.identity";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Sparkles, Menu, X, ArrowRight } from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import { ContactLink } from "./ContactLink";

/*
 * No link list yet. Platform, Built on Hakken and Trust & Security are unbuilt
 * and would 404, and Contact went to the same place as "Talk to us" beside it.
 * Links come back one at a time as each page ships.
 */

/**
 * A cream pill inset from the viewport edges, floating over the hero panel and
 * rounded only along its bottom. Links sit beside the wordmark so the right
 * edge belongs entirely to sign-in and the one primary action.
 */
export function PublicNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={cn("ps-nav", (scrolled || open) && "scrolled")}>
      <div className="ps-nav-row">
        <Link href="/" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
          <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[var(--ps-orange)] text-white">
            <Sparkles className="h-[15px] w-[15px]" />
          </span>
          <span className="ps-display text-[16px] tracking-[0.14em]">{productIdentity.name.toUpperCase()}</span>
        </Link>

        <div className="ml-auto hidden items-center gap-[clamp(12px,1.5vw,22px)] md:flex">
          <Link href="/login" className="ps-nav-link">
            Sign in
          </Link>
          <ContactLink className="ps-nav-cta group">
            <span>Talk to us</span>
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </ContactLink>
        </div>

        <button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          className="ml-auto flex h-10 w-10 items-center justify-center rounded-full border border-[var(--ps-line)] text-[var(--ps-ink)] md:hidden"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <nav className="border-t border-[var(--ps-line)] px-4 pb-5 pt-4 md:hidden">
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              onClick={() => setOpen(false)}
              className="flex-1 rounded-full border border-[var(--ps-line)] px-3 py-3 text-center text-[14px] font-medium"
            >
              Sign in
            </Link>
            <ContactLink className="flex-1 rounded-full bg-[var(--ps-ink)] px-3 py-3 text-center text-[14px] font-semibold text-[var(--ps-cream)]">
              Talk to us
            </ContactLink>
          </div>
        </nav>
      )}
    </header>
  );
}
