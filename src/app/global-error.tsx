"use client";

import { useEffect } from "react";
import { reportError } from "@/src/lib/reportError";

/**
 * Last-resort boundary for failures in the root layout itself.
 *
 * This replaces the entire document, so none of the app's providers are
 * mounted: no theme, no translations, no design system. Everything here is
 * therefore self-contained and in English by necessity. Per-segment `error.tsx`
 * boundaries handle everything below the root and can use the full UI.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportError(error, { scope: "global-layout" });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "24px",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#0b0b0c",
          color: "#f4f4f5",
        }}
      >
        <main style={{ maxWidth: "480px", textAlign: "center" }}>
          <h1 style={{ fontSize: "20px", fontWeight: 600, margin: "0 0 12px" }}>
            Something went wrong
          </h1>
          <p style={{ fontSize: "14px", lineHeight: 1.6, margin: "0 0 24px", color: "#a1a1aa" }}>
            The application failed to load. This has been logged. You can try again, and if it
            keeps happening please contact your administrator.
          </p>
          {error.digest ? (
            <p style={{ fontSize: "12px", color: "#71717a", margin: "0 0 24px" }}>
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            style={{
              cursor: "pointer",
              borderRadius: "8px",
              border: "1px solid #3f3f46",
              background: "#18181b",
              color: "#f4f4f5",
              padding: "10px 20px",
              fontSize: "14px",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
