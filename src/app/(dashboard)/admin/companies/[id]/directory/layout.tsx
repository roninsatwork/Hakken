import type { ReactNode } from "react";

type CompanyDirectoryLayoutProps = {
  children: ReactNode;
};

export default function CompanyDirectoryLayout({ children }: CompanyDirectoryLayoutProps) {
  return <div className="w-full">{children}</div>;
}
