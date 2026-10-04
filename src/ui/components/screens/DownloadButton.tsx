"use client";

import { Download } from "lucide-react";
import { Button } from "./Button";

/**
 * The download button every table and list wears in its top bar: a quiet
 * button with the download mark, saying what it is doing while the file is
 * made. One part where Sites' list and table downloads and Search Console's
 * drew three (2026-10-03 clean-up); what is downloaded, and how, stays the
 * caller's.
 */
export function DownloadButton({ label, busyLabel, busy = false, disabled = false, onClick }: {
  label: string;
  busyLabel?: string;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      data-part="download"
      data-part-label={label}
      variant="quiet"
      disabled={disabled || busy}
      onClick={onClick}
      className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-[12px]"
      aria-live="polite"
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      {busy && busyLabel ? busyLabel : label}
    </Button>
  );
}

/** Hand a file to the browser to save: the CSV text and its name. */
export function saveTextFile(text: string, fileName: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
