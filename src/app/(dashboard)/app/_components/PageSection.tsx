import type { ReactNode } from "react";

/**
 * A section's own title and what it holds, above the part it introduces —
 * a table, a settings card, a list. First drawn for Keyword research's Past
 * lookups and Research lists (`ResearchSection`), shared here when
 * Discovery's Local pages needed the same (discovery-local-reputation-ai-plan.md,
 * D18). The title is marked for the screens' look tests.
 */
export function PageSection({ title, description, tight = false, children }: {
  title: string;
  description?: ReactNode;
  /** The line under the title right beneath it, as Discovery's Local pages are drawn; Keyword research's sit apart. */
  tight?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div data-part="section" className={tight ? "flex flex-col" : "flex flex-col gap-3"}>
        <h2 data-part-title className="text-[14px] font-medium text-foreground">{title}</h2>
        {description ? <p className="text-[12px] text-secondary">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}
