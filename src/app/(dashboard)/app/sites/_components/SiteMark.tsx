import { cn } from "@/src/ui/lib/utils";
import { siteInitial } from "./siteGroups";

/**
 * A website's letter in the Sites lists: a rounded square for one the company
 * owns, a circle for a competitor, so the two read apart at a glance. Its
 * host is always written beside it, so the mark is decoration.
 */
export function SiteMark({ host, owned, small = false }: { host: string; owned: boolean; small?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center bg-foreground/10 font-semibold text-foreground",
        owned ? "rounded-[8px]" : "rounded-full",
        small ? "h-5 w-5 text-[10px]" : "h-8 w-8 text-[13px]",
      )}
    >
      {siteInitial(host)}
    </span>
  );
}
