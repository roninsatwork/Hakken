"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type AdminPageHeaderProps = {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
};

export function AdminPageHeader({ icon, title, description, action }: AdminPageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
          {icon}
          {title}
        </h1>
        {description ? <p className="text-[13px] text-secondary mt-1">{description}</p> : null}
      </div>

      {action}
    </div>
  );
}

type AdminPagePrimaryActionProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: ReactNode;
  children: ReactNode;
};

export function AdminPagePrimaryAction({
  icon,
  children,
  className = "",
  type = "button",
  ...buttonProps
}: AdminPagePrimaryActionProps) {
  return (
    <button
      type={type}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      {...buttonProps}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
