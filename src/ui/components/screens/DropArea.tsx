"use client";

import { useRef, useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import { Button } from "./Button";

/**
 * A place on the page to drop files, with a button to choose them instead.
 *
 * Brought over from the upstream framework on 2026-11-21 for the wiki's Add to
 * the wiki page (wiki-sonae-catch-up-plan-2026-11-21.md, S6), as a shared part
 * on Anthony's word, so any page that takes files can use it rather than a bare
 * file input or an upload pop-up. The file picker is a real input hidden behind
 * the button, so a keyboard user reaches it by the button.
 *
 * `layout="row"` is one line (anything in `leading`, the button, then the
 * words) for a page that already says what the files are for. `stack` is the
 * larger area, with its words above the button.
 */
export function DropArea({
  title,
  hint,
  chooseFilesLabel,
  accept,
  multiple = false,
  disabled = false,
  onFiles,
  layout = "stack",
  leading,
  children,
  className,
}: {
  title: string;
  hint?: ReactNode;
  chooseFilesLabel: string;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  /** The files dropped or chosen: only the first unless `multiple`. Never called with none. */
  onFiles: (files: File[]) => void;
  layout?: "stack" | "row";
  /** Shown first on a "row" area, such as a spinner while the files are read. */
  leading?: ReactNode;
  /** Anything to show inside the area under the button. */
  children?: ReactNode;
  /** Layout only: margin, width. */
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const take = (list: FileList | readonly File[] | null) => {
    const files = list ? Array.from(list) : [];
    if (files.length > 0 && !disabled) onFiles(multiple ? files : files.slice(0, 1));
  };

  const dropHandlers = {
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (!disabled) setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setDragging(false);
      take(event.dataTransfer.files);
    },
  };

  const frame = cn(
    "border border-dashed transition-colors",
    dragging ? "border-foreground/50 bg-foreground/[0.03]" : "border-border-dim",
    disabled && "opacity-50",
  );

  const chooser = (
    <>
      <Button variant="outline" className="text-foreground" disabled={disabled} onClick={() => input.current?.click()}>
        {chooseFilesLabel}
      </Button>
      <input
        ref={input}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
    </>
  );

  if (layout === "row") {
    return (
      <div data-part="drop-area" {...dropHandlers} className={cn("flex flex-wrap items-center gap-4 rounded-[6px] px-4 py-3", frame, className)}>
        {leading}
        {chooser}
        <p className="min-w-0 flex-1 text-[13px] text-secondary">
          {title}
          {hint ? <> {hint}</> : null}
        </p>
        {children}
      </div>
    );
  }

  return (
    <div
      data-part="drop-area"
      {...dropHandlers}
      className={cn("flex flex-col items-center gap-3 rounded-[6px] px-6 py-10 text-center", frame, className)}
    >
      <Upload aria-hidden="true" className="h-6 w-6 text-secondary" />
      <p className="text-[13px] font-medium text-foreground">{title}</p>
      {hint ? <p className="max-w-[56ch] text-[13px] leading-relaxed text-secondary">{hint}</p> : null}
      <div className="mt-1 flex flex-wrap justify-center gap-2">{chooser}</div>
      {children}
    </div>
  );
}
