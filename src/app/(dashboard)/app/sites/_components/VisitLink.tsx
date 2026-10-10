import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A quiet link out to the real thing — a business's Google profile, a
 * website Discovery is describing — in a new tab, beside a screen's title.
 * Business profile's "Open on Google" and the detail screens' "Visit" are it
 * (discovery-detail-and-hakken-sees-plan.md §2); the detail screens' wears the
 * outward arrow, as drawn.
 */
export function VisitLink({ href, icon = false, children }: { href: string; icon?: boolean; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-[8px] border border-border-dim bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-secondary transition-all hover:bg-white/[0.06] hover:text-foreground"
    >
      {icon ? <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {children}
    </a>
  );
}
