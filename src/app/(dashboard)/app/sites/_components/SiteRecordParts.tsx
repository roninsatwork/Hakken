"use client";

import type { ReactNode } from "react";
import { CompactList } from "@/src/ui/components/screens/CompactList";

/**
 * The parts a record's own screen is built from, beyond the kit's: a list of
 * facts about the record, and the title over a table that sits inside it.
 * Shared by every record's screen (a keyword, a page, …) so they read alike.
 */

export type SiteFact = { key: string; label: ReactNode; value: ReactNode };

/**
 * What we know about a record, one fact a line: what it is on the left, its
 * value on the right. Facts we have no value for are left out by the caller
 * rather than shown as a row of dashes.
 */
export function SiteFacts({ facts, empty }: { facts: SiteFact[]; empty: ReactNode }) {
  return (
    <CompactList
      rows={facts}
      rowKey={(fact) => fact.key}
      empty={empty}
      columns={[
        { key: "label", className: "text-[13px] text-secondary", cell: (fact) => fact.label },
        { key: "value", align: "right", className: "text-[13px] text-foreground", cell: (fact) => fact.value },
      ]}
    />
  );
}

/**
 * The title over a table inside a record's screen — the keywords of a page,
 * say. The screen's own header is above it already, so this only names the
 * table, in the card's header slot (`DataTable`'s `cardHeader`).
 */
export function RecordTableTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="border-b border-border-dim/50 bg-background/50 p-4">
      <h3 className="text-[14px] font-medium tracking-wide text-foreground">{title}</h3>
      {description ? <p className="mt-0.5 text-[12px] text-secondary">{description}</p> : null}
    </div>
  );
}
