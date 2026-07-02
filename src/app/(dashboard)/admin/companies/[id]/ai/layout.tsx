import type { ReactNode } from "react";

type CompanyAiLayoutProps = {
  children: ReactNode;
};

export default function CompanyAiLayout({ children }: CompanyAiLayoutProps) {
  return <>{children}</>;
}
