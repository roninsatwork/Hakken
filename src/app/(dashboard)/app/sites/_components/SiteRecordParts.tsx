"use client";

import type { ReactNode } from "react";
import { CompactList } from "@/src/ui/components/screens/CompactList";

/**
 * The parts a record's own screen is built from, beyond the kit's: a list of
 * facts about the record. Shared by every record's screen (a keyword, a
 * page, …) so they read alike; a table inside one wears the Sites table's own
 * top bar (`SiteTableBar`), with its title.
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
