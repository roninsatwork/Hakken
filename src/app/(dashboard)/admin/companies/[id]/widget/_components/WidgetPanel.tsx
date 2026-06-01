import type { ReactNode } from "react";

type WidgetPanelProps = {
  children: ReactNode;
  description: string;
  title: string;
};

export function WidgetPanel({ children, description, title }: WidgetPanelProps) {
  return (
    <div className="flex flex-col gap-6 p-6 md:p-8 rounded-[20px] bg-sidebar/40 border border-border-dim shadow-sm backdrop-blur-xl">
      <div className="border-b border-border-dim pb-4 mb-2">
        <h2 className="text-[18px] font-bold text-foreground">{title}</h2>
        <p className="text-[13px] text-secondary mt-1">{description}</p>
      </div>
      {children}
    </div>
  );
}
