"use client";

import { ShieldAlert } from "lucide-react";

export default function LocalTestAuthError({ message }: { message: string }) {
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
      <div
        data-testid="local-test-auth-error"
        className="max-w-md rounded-[24px] border border-border-dim bg-card/60 p-8 shadow-xl flex flex-col gap-4"
      >
        <ShieldAlert className="w-8 h-8 text-[#f43f5e]" />
        <h1 className="text-xl font-semibold tracking-wide">Local test auth unavailable</h1>
        <p className="text-[14px] text-secondary leading-relaxed">{message}</p>
      </div>
    </main>
  );
}
