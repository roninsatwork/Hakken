"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type AdminRouteSubmenuItem = {
  href: string;
  label: string;
};

type AdminRouteSubmenuProps = {
  items: AdminRouteSubmenuItem[];
  label: string;
};

function getActiveSubmenuHref(pathname: string, items: AdminRouteSubmenuItem[]) {
  const matches = items.filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  return matches.sort((a, b) => b.href.length - a.href.length)[0]?.href;
}

export function AdminRouteSubmenu({ items, label }: AdminRouteSubmenuProps) {
  const pathname = usePathname();
  const activeHref = getActiveSubmenuHref(pathname, items);

  return (
    <nav
      aria-label={label}
      className="w-full self-start lg:w-[220px] shrink-0 sticky top-6 bg-sidebar/40 border border-border-dim shadow-sm backdrop-blur-xl rounded-[16px] overflow-hidden flex flex-col pt-2 pb-2"
    >
      {items.map((item) => {
        const isActive = activeHref === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={`text-left px-5 py-3.5 text-[14px] font-medium transition-colors ${
              isActive ? "bg-brand text-white" : "text-secondary hover:text-foreground hover:bg-foreground/5"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
