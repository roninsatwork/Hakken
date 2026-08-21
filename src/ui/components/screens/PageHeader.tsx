"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/src/ui/lib/utils";
import { Button } from "@/src/ui/atoms/Button";
import { useCanWriteHere } from "./AccessLevel";

type AdminPageHeaderProps = {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /**
   * Rule under the title, for pages that carry a tab bar beneath it.
   *
   * The Artificial Intelligence pages had their own near-identical copy of this
   * component purely to add this line, and the Skill Center had a third copy
   * with no line at all. Opting in here converges the three without changing how
   * any other admin page looks.
   */
  divider?: boolean;
};

export function PageHeader({ icon, title, description, action, divider = false }: AdminPageHeaderProps) {
  return (
    <div className={`flex flex-col sm:flex-row sm:items-end justify-between gap-4${divider ? " border-b border-border-dim pb-6" : ""}`}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
          {icon}
          {title}
        </h1>
        {description ? <p className="text-[13px] text-secondary mt-1 tracking-wide">{description}</p> : null}
      </div>

      {action}
    </div>
  );
}

type AdminPagePrimaryActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  children: ReactNode;
};

export function PagePrimaryAction({
  icon,
  children,
  className = "",
  type = "button",
  ...buttonProps
}: AdminPagePrimaryActionProps) {
  const canWriteHere = useCanWriteHere();

  // Removed rather than disabled. A greyed-out button invites the reader to
  // work out why it will not press; nothing at all reads as "this screen is for
  // looking at", which is exactly what a read-only account is for.
  if (!canWriteHere) return null;

  return (
    <Button
      variant="primary"
      type={type}
      className={cn(
        "flex items-center gap-2 px-3 py-1.5 text-[13px] whitespace-nowrap disabled:cursor-not-allowed",
        className
      )}
      {...buttonProps}
    >
      {icon}
      <span>{children}</span>
    </Button>
  );
}
