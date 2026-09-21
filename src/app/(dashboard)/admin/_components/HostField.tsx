"use client";

import { useQuery } from "convex/react";
import { CheckCircle2, Info } from "lucide-react";

import { api } from "@/convex/_generated/api";
import { ModalField } from "@/src/ui/components/screens/ModalForm";

type HostFieldProps = {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  labels: {
    savedAs: (host: string) => string;
    alreadyKnown: string;
    newWebsite: string;
  };
};

/**
 * An address field that shows the key it will be stored as, before saving.
 *
 * Not decoration. A website is identified by its normalised host, so pasting a
 * shop's URL and getting `example.com` rather than `shop.example.com` is the
 * only moment anyone can catch that they are about to watch the wrong thing.
 * And because one host is one record shared by everyone, the second line says
 * whether this will join an existing record — which is the system working, not
 * a warning, and is worded that way.
 *
 * Shared between the two add forms because they ask the same question and a
 * second copy would drift; the only difference between them is the wording,
 * which is passed in.
 */
export function HostField({ label, placeholder, value, onChange, labels }: HostFieldProps) {
  // Only asked once there is something to read, so an empty field says nothing
  // rather than "that does not look like a website address".
  const preview = useQuery(
    api.websites.previewWebsiteHost,
    value.trim().length > 2 ? { url: value } : "skip",
  );

  return (
    <ModalField
      label={label}
      type="text"
      required
      autoFocus
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
    >
      {preview ? (
        preview.ok ? (
          <div className="mt-2 flex flex-col gap-1">
            <p className="flex items-center gap-1.5 text-[12px] text-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-success" />
              {labels.savedAs(preview.displayHost)}
            </p>
            <p className="flex items-start gap-1.5 text-[11px] text-muted">
              <Info className="mt-0.5 h-3 w-3 shrink-0" />
              {preview.alreadyKnown ? labels.alreadyKnown : labels.newWebsite}
            </p>
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-destructive">{preview.message}</p>
        )
      ) : null}
    </ModalField>
  );
}
