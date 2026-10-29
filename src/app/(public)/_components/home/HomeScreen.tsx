import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Eyebrow, RainSplit, ScreenCopy, ScreenTitle, primaryLinkClassName, quietLinkClassName } from "@/src/ui/components/public/RainSplit";

/**
 * The home page: one screen, no scroll on a desktop, in the Conterra shape
 * Anthony asked for on 2026-10-29 — the words on the left, a symbol that moves
 * on the right — drawn as board "Rain" of docs/plans/assets/home-page/ and
 * approved the same day (docs/plans/active/home-page-plan.md). homeLook.test
 * holds it to that drawing.
 *
 * Every word is literal here, as the public site's always were: the screen's
 * own wording in messages/<language>.json is for the app behind sign-in. The
 * copyright line is the one exception, already in the catalogue.
 */
export function HomeScreen({ copyright }: { copyright: string }) {
  return (
    <RainSplit
      name="home"
      copyright={copyright}
      aside={
        <Link href="/login" data-part="sign-in" data-part-label="Sign in" className={`${quietLinkClassName} absolute right-6 top-11 sm:right-14`}>
          Sign in
        </Link>
      }
    >
      <Eyebrow>発見 · Discovery</Eyebrow>
      <ScreenTitle size="home">Hakken</ScreenTitle>
      <div className="flex flex-wrap items-center gap-3.5 font-mono text-[13px] uppercase tracking-[0.18em] text-foreground">
        <span>Found</span>
        <span className="text-muted">→</span>
        <span>Visited</span>
        <span className="text-muted">→</span>
        <span>Converted</span>
        <span className="text-muted">→</span>
        <span>Won</span>
      </div>
      <ScreenCopy size="home">
        Hakken is a team of agents that do the work of an SEO firm, so you do not need one. The SEO, being found on
        Google, and the GEO, being the name ChatGPT and Gemini give when someone asks. They work out which of your
        pages, listings and feeds make money and where the rest lose it, then tell you what to change and why, with
        the research to back it up, so the work you do next is the work that grows the business.
      </ScreenCopy>
      <Link href="/login" data-part="primary-action" className={primaryLinkClassName}>
        <span>Sign in</span>
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </RainSplit>
  );
}
