import type { ReactNode } from "react";

type GlobalAiLayoutProps = {
  children: ReactNode;
};

export default function GlobalAiLayout({ children }: GlobalAiLayoutProps) {
  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      {children}
    </div>
  );
}
