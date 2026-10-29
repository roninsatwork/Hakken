import type { ReactNode } from "react";
import { cn } from "@/src/ui/lib/utils";
import { RainField } from "./RainField";

/**
 * The frame of every screen a person sees before they are signed in: the home
 * page, sign-in and its states, the page a sign-in email lands on, and the page
 * an unsubscribe link opens. Drawn and approved on the "Hakken home page"
 * canvas, 2026-10-29 (docs/plans/active/home-page-plan.md and
 * before-sign-in-plan.md): the words on the left, the rain on the right, the
 * halves stacked on a phone, no logo, the copyright line bottom left.
 *
 * `name` is the screen's own marker for its look test; `aside` sits over the
 * rain (the home page's quiet Sign in), after it in the document so it paints
 * above it without a stacking order of its own.
 */
export function RainSplit({
  name,
  width = "wide",
  copyright,
  aside,
  children,
}: {
  name: string;
  /** The home page's column of words is wider than a form's. */
  width?: "wide" | "narrow";
  copyright: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main
      data-part={name}
      className="grid min-h-screen w-full"
      /* A column never wider than the screen, so a phone stacks the halves instead of scrolling sideways. */
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))" }}
    >
      <section
        data-part="hero"
        className="flex min-h-[min(100vh,150vw)] flex-col justify-between gap-12 px-6 pb-10 pt-11 sm:px-14"
      >
        {/* No logo or wordmark at the top (Anthony, 2026-10-29: "we have Hakken in large letters already"); this keeps the words centred. */}
        <div aria-hidden="true" className="h-9" />
        <div className={cn("flex w-full flex-col", width === "wide" ? "max-w-[580px] gap-7" : "max-w-[440px] gap-[22px]")}>
          {children}
        </div>
        <p data-part="copyright" className="m-0 font-mono text-[11px] uppercase tracking-[0.25em] text-muted">
          {copyright}
        </p>
      </section>

      <section data-part="rain" className="relative min-h-[min(100vh,120vw)] overflow-hidden bg-sidebar">
        <RainField />
        {aside}
      </section>
    </main>
  );
}

/** The small line above a title: 発見 · Discovery, Sign in, Your emails. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[12px] uppercase tracking-[0.32em] text-muted">{children}</span>;
}

/** A screen's title, sized past globals.css's fixed h1 through the one escape hatch (rain.css). */
export function ScreenTitle({ children, size = "screen" }: { children: ReactNode; size?: "screen" | "home" }) {
  return (
    <h1 data-part-title className={cn("m-0", size === "home" ? "hk-home-title" : "hk-screen-title")}>
      {children}
    </h1>
  );
}

/** The sentence or two under a title, in plain words that say what to do next. */
export function ScreenCopy({ children, size = "screen" }: { children: ReactNode; size?: "screen" | "home" }) {
  return (
    <p
      data-part="hero-copy"
      className={cn("m-0 text-secondary", size === "home" ? "text-[20px] leading-[1.55]" : "text-[14px] leading-[1.6]")}
    >
      {children}
    </p>
  );
}

/** A single icon in a quiet disc above a title: a tick once something is done, a key, a crossed mail. */
export function IconDisc({ tone, children }: { tone: "success" | "brand"; children: ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className={cn("flex h-11 w-11 items-center justify-center rounded-full bg-card", tone === "success" ? "text-success" : "text-brand")}
    >
      {children}
    </span>
  );
}

/** The kit's primary-action look (Button, variant "primary") on a link, because it navigates. */
export const primaryLinkClassName =
  "inline-flex w-max items-center justify-center gap-2.5 rounded-[10px] bg-foreground px-[22px] py-[13px] text-[15px] font-medium text-background shadow-xl shadow-foreground/10 transition-all hover:bg-foreground/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";

/** The kit's quiet look (Button, variant "quiet") on a link. */
export const quietLinkClassName =
  "inline-flex items-center rounded-[8px] border border-border-dim bg-white/[0.03] px-4 py-2.5 text-[12px] font-medium text-secondary transition-all hover:bg-white/[0.06] hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand";
