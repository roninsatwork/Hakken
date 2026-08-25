import { Loader2 } from "lucide-react";
import { Suspense, type ReactNode } from "react";

export default function VerifyLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
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
