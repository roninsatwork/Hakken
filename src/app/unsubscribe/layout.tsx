import { Loader2 } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import "@/src/ui/components/public/rain.css";

/** The page an email's unsubscribe link opens wears the sign-in screen's look (docs/plans/active/before-sign-in-plan.md). */
export default function UnsubscribeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="dark public-home flex min-h-screen w-full flex-col bg-background text-foreground">
      <Suspense
        fallback={
          <div className="flex min-h-screen items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-secondary" />
          </div>
        }
      >
        {children}
      </Suspense>
    </div>
  );
}
