import { Loader2 } from "lucide-react";
import { Suspense, type ReactNode } from "react";

/** The page an email's unsubscribe link opens: one card, centred, as the sign-in link's page is (`verify`). */
export default function UnsubscribeLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-[16px] border border-border-dim bg-background p-8">
        <Suspense
          fallback={
            <div className="flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-secondary" />
            </div>
          }
        >
          {children}
        </Suspense>
      </div>
    </main>
  );
}
