import { Loader2 } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import "@/src/ui/components/public/rain.css";

/**
 * Sign-in is the home page's sibling: the same dark look, the same rain
 * (docs/plans/active/before-sign-in-plan.md, 2026-10-29), so a visitor who
 * presses Sign in does not change world. The `dark` tokens are worn whatever
 * the device prefers, as the home page's are.
 */
export default function LoginLayout({ children }: { children: ReactNode }) {
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
