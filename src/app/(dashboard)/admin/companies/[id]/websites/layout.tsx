import type { ReactNode } from "react";

type CompanyWebsitesLayoutProps = {
  children: ReactNode;
};

export default function CompanyWebsitesLayout({ children }: CompanyWebsitesLayoutProps) {
  return <div className="w-full">{children}</div>;
}
