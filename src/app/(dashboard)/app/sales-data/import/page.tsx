"use client";

import { Suspense } from "react";
import { LegacySalesDataRedirect } from "../LegacySalesDataRedirect";

/** The old address for the import screen. See the sibling page for why. */
export default function LegacySalesDataImportPage() {
  return (
    <Suspense fallback={null}>
      <LegacySalesDataRedirect to="import-data" />
    </Suspense>
  );
}
