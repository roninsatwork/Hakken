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
    /** What attaching to a host Hakken already tracks brings with it. */
    inherits: (counts: {
      keywords: number;
      questions: number;
      rivals: number;
      weeks: number;
    }) => string;
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
 * a warning, and is worded that way. When it does join one, a third line says
 * what comes with it: the searches, questions and history somebody else has
 * already paid for. That is the best thing that can happen on this form, and it
 * was a footnote about not fetching twice until the host gained lists of its
 * own.
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
            {/*
              Only when there is something to inherit. A host that is known but
              has nothing on it yet would otherwise announce four zeroes, which
              reads as a fault rather than as "new".
            */}
            {preview.inherits && (
              preview.inherits.keywords + preview.inherits.questions
              + preview.inherits.rivals + preview.inherits.weeksOfHistory > 0
            ) ? (
              <p className="flex items-start gap-1.5 text-[11px] text-success">
                <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0" />
                {labels.inherits({
                  keywords: preview.inherits.keywords,
                  questions: preview.inherits.questions,
                  rivals: preview.inherits.rivals,
                  weeks: preview.inherits.weeksOfHistory,
                })}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-[12px] text-destructive">{preview.message}</p>
        )
      ) : null}
    </ModalField>
  );
}
