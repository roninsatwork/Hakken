import { Loader2 } from "lucide-react";
import { Suspense, type ReactNode } from "react";
import "@/src/ui/components/public/rain.css";

/**
 * The Allow page wears the sign-in page's look (`src/app/login/layout.tsx`):
 * a person comes to it straight from ChatGPT or Claude, often signing in on the
 * way, so the two read as one step (ask-hakken-from-ai-chat-apps-plan-2026-11-21.md,
 * board 1).
 */
export default function OAuthLayout({ children }: { children: ReactNode }) {
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
