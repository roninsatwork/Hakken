"use client";

import { Suspense } from "react";
import { LegacySalesDataRedirect } from "./LegacySalesDataRedirect";

/**
 * The section used to live at `/app/sales-data`, before it moved under the
 * workspace's own name. A bookmark or a link in someone's inbox still lands.
 *
 * It cannot be a config redirect: the new address contains the workspace name,
 * which is only known once the signed-in user's company has been read.
 */
export default function LegacySalesDataPage() {
  return (
    <Suspense fallback={null}>
      <LegacySalesDataRedirect to="spreadsheet-import" />
    </Suspense>
  );
}
