"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import { NAV_ACTIVE_PILL, NAV_ACTIVE_TEXT, NAV_IDLE_TEXT } from "@/src/ui/components/layout/navStyles";
import { Button } from "@/src/ui/components/screens/Button";
import { Field } from "@/src/ui/components/screens/Field";
import { Select } from "@/src/ui/components/screens/Select";

export type SectionMenuItem = {
  id: string;
  label: string;
  /** Where it leads; null for a page not built yet, listed greyed with `note`. */
  href: string | null;
  /** The number beside it, already written out; null for none. */
  count?: string | null;
  /** Said beside a page not built yet — "Coming soon". */
  note?: string;
  /** The page's own icon, before its name: the websites admin's menu, whose page headers wear the same one. */
  icon?: LucideIcon;
};

export type SectionMenuGroup = { id: string; label: string; items: SectionMenuItem[] };

/**
 * A section's side menu — first the Sites menu (D4, D5), shared with Learn
 * since (docs/plans/active/knowledge-news-and-digest-plan.md, revised again
 * 2026-10-01, R4): "Jump to a page" finds any page by typing, then one group
 * per kind of page, each page with its number beside it so the headline is
 * visible without opening anything. On a phone the whole menu is one
 * drop-down. The section says what its pages, numbers and addresses are; this
 * says how they look, so the two menus cannot drift apart.
 *
 * **Each group folds away.** Anthony, 2026-09-24, of Sites: "there are too
 * many options on the screen — can we make each section an accordion please".
 * `openAtFirst` names the groups open from the start; the group of the page
 * being read always is — a menu that hid the page you are on would leave you
 * lost — and a group opened stays open while you move between pages. Typing
 * in "Jump to a page" shows every match, open or not.
 *
 * A short menu leaves the jump box out (no `jump`), and a menu whose pages
 * have icons draws each before its name — both for the websites admin's menu,
 * which drew its own copy of this until the 2026-10-03 clean-up.
 */
export function SectionMenu({
  label,
  jump,
  groups,
  currentId,
  openAtFirst,
}: {
  /** The menu's name, for a screen reader and the phone's drop-down. */
  label: string;
  /** The "Jump to a page" box's label and placeholder; left out, a short menu has none. */
  jump?: { label: string; placeholder: string };
  groups: SectionMenuGroup[];
  /** The page being read. */
  currentId: string;
  openAtFirst: readonly string[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState("");
  const currentGroup = groups.find((group) => group.items.some((item) => item.id === currentId))?.id ?? null;

  const [open, setOpen] = useState<ReadonlySet<string>>(
    () => new Set([...openAtFirst, ...(currentGroup ? [currentGroup] : [])]),
  );
  // Arriving on a page in a closed group — from a link on another page, say —
  // opens it, adjusted during render rather than in an effect so the menu
  // never draws a frame with the page hidden.
  const [seenGroup, setSeenGroup] = useState(currentGroup);
  if (seenGroup !== currentGroup) {
    setSeenGroup(currentGroup);
    if (currentGroup) setOpen((before) => new Set([...before, currentGroup]));
  }
  const toggle = (group: string) => setOpen((before) => {
    const next = new Set(before);
    if (next.has(group)) next.delete(group);
    else next.add(group);
    return next;
  });

  const term = filter.trim().toLowerCase();
  const matches = (group: SectionMenuGroup, item: SectionMenuItem) => !term || `${group.label} ${item.label}`.toLowerCase().includes(term);

  return (
    <>
      <div className="lg:hidden">
        <Select
          aria-label={label}
          value={currentId}
          onChange={(id) => {
            const href = groups.flatMap((group) => group.items).find((item) => item.id === id)?.href;
            if (href) router.push(href);
          }}
        >
          {groups.map((group) => (
            <optgroup key={group.id} label={group.label}>
              {group.items.map((item) => (
                <option key={item.id} value={item.id} disabled={!item.href}>
                  {item.label}{item.href || !item.note ? "" : ` · ${item.note}`}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>

      <nav aria-label={label} className="hidden flex-col gap-1 text-[13px] lg:flex">
        {jump ? <Field label={jump.label} labelHidden placeholder={jump.placeholder} value={filter} onChange={(event) => setFilter(event.target.value)} /> : null}
        {groups.map((group) => {
          const items = group.items.filter((item) => matches(group, item));
          if (items.length === 0) return null;
          const isOpen = term !== "" || open.has(group.id);
          const panelId = `section-menu-${group.id}`;
          return (
            <div key={group.id} className="flex flex-col gap-0.5">
              <Button
                variant="ghost"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(group.id)}
                className="flex w-full items-center justify-between rounded-lg px-3 pt-4 pb-1.5 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted hover:bg-transparent hover:text-foreground"
              >
                <span>{group.label}</span>
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen && "rotate-180")} aria-hidden="true" />
              </Button>
              {isOpen ? (
                <div id={panelId} className="flex flex-col gap-0.5">
                  {items.map((item) => {
                    if (!item.href) {
                      return (
                        <span
                          key={item.id}
                          aria-disabled="true"
                          className="flex items-center justify-between gap-2 rounded-[8px] border border-transparent px-3 py-1.5 tracking-wide text-muted/70"
                        >
                          <span>{item.label}</span>
                          {item.note ? <span className="text-[10px] uppercase tracking-wider">{item.note}</span> : null}
                        </span>
                      );
                    }
                    const isCurrent = item.id === currentId;
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        aria-current={isCurrent ? "page" : undefined}
                        className={cn(
                          // The page being read wears the sidebar's own pill (`navStyles.ts`);
                          // the rest keep a clear border so nothing shifts when it moves.
                          "flex items-center justify-between gap-2 rounded-[8px] border px-3 py-1.5 tracking-wide transition-colors",
                          isCurrent ? cn(NAV_ACTIVE_PILL, NAV_ACTIVE_TEXT) : cn("border-transparent", NAV_IDLE_TEXT),
                        )}
                      >
                        <span className="flex items-center gap-2.5">
                          {/* Never orange: that is a page's action, not where you are (`navStyles.ts`). */}
                          {Icon ? <Icon className={cn("h-4 w-4 shrink-0", isCurrent ? "text-foreground" : "text-muted")} aria-hidden="true" /> : null}
                          <span>{item.label}</span>
                        </span>
                        {item.count ? <span className="text-[11px] tabular-nums text-muted">{item.count}</span> : null}
                      </Link>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </nav>
    </>
  );
}
