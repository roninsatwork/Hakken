"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { LAYER } from "@/src/ui/lib/layers";

/**
 * The quick switcher (living-wiki plan, phase 1): Cmd/Ctrl-K anywhere in
 * the wiki, a few letters, and you're on any page — each hit showing the
 * sentence that matched. House overlay on the house layer, mounted by
 * the wiki screens at both heights and walled exactly as they are.
 */
export function WikiQuickSwitcher({
  companyId,
  basePath,
}: {
  companyId?: Id<"companies">;
  basePath: string;
}) {
  const t = useTranslations("aiPages.switcher");
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const companyHits = useQuery(
    api.wikiPages.searchPagesForCompany,
    isOpen && companyId && term.trim().length >= 2 ? { companyId, term } : "skip"
  );
  const globalHits = useQuery(
    api.wikiPages.searchPagesForGlobal,
    isOpen && !companyId && term.trim().length >= 2 ? { term } : "skip"
  );
  const hits = (companyId ? companyHits : globalHits) ?? [];

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen((current) => !current);
        setTerm("");
        setSelected(0);
      }
      if (event.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 0);
  }, [isOpen]);


  if (!isOpen) return null;

  const open = (pageId: string) => {
    setIsOpen(false);
    router.push(`${basePath}/${pageId}`);
  };

  return (
    <div className={`fixed inset-0 ${LAYER.OVERLAY} flex items-start justify-center pt-[18vh] px-6`}>
      <button
        type="button"
        aria-label={t("close")}
        onClick={() => setIsOpen(false)}
        className="absolute inset-0 bg-black/60 backdrop-blur-[6px] cursor-default"
      />
      <div className="relative w-full max-w-xl rounded-[16px] border border-border-dim bg-sidebar shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-border-dim">
          <Search className="w-4 h-4 text-muted shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              // The highlight returns to the first result as the words change.
              // This belongs here rather than in an effect on `term`: typing is
              // the event, and setting state from an effect makes React render
              // the old highlight once before correcting it.
              setSelected(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelected((current) => Math.min(current + 1, hits.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelected((current) => Math.max(current - 1, 0));
              } else if (event.key === "Enter" && hits[selected]) {
                open(hits[selected].pageId);
              }
            }}
            placeholder={t("placeholder")}
            className="flex-1 bg-transparent text-[15px] text-foreground placeholder:text-muted/60 focus:outline-none"
          />
          <kbd className="px-2 py-0.5 rounded-[6px] border border-border-dim text-[11px] text-muted">esc</kbd>
        </div>
        {term.trim().length >= 2 && (
          <ul className="max-h-[46vh] overflow-y-auto py-2">
            {hits.length === 0 ? (
              <li className="px-5 py-4 text-[13px] text-muted">{t("empty")}</li>
            ) : (
              hits.map((hit, index) => (
                <li key={hit.pageId}>
                  <button
                    type="button"
                    onClick={() => open(hit.pageId)}
                    onMouseEnter={() => setSelected(index)}
                    className={`w-full text-left px-5 py-3 flex flex-col gap-0.5 transition-colors ${
                      index === selected ? "bg-hover" : ""
                    }`}
                  >
                    <span className="text-[14px] font-medium text-foreground">
                      {hit.title.replace(/^https?:\/\//, "")}
                      <span className="ml-2 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim/60 text-secondary text-[11px] font-normal">
                        {t(`kinds.${hit.kind}`)}
                      </span>
                    </span>
                    {hit.snippet && (
                      <span className="text-[12.5px] text-muted line-clamp-1">{hit.snippet}</span>
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
