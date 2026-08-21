import React from "react";
import { vi } from "vitest";

/**
 * The mocks every screen test sets up, said once.
 *
 * Thirty list screens need their first test, and each was opening with the same
 * twenty-five lines: inert Convex hooks, translations that echo their key, a
 * link that renders an anchor, a router that does nothing. Repeating that per
 * file is where the time went, and a mock missing one export fails the whole
 * file with an error about hoisting rather than about the screen.
 *
 * `vi.mock` factories are hoisted above imports, so a test file reaches these
 * through a lazy import inside the factory:
 *
 *     vi.mock("convex/react", async () => (await import("@/src/test/screenMocks")).convexReact());
 *
 * Each returns a plain module shape, so a test that needs one hook to answer
 * differently still calls `vi.mocked(useQuery).mockReturnValue(...)` as usual.
 */

/** Every Convex hook a screen might reach for, all inert. */
export function convexReact() {
  return {
    useQuery: vi.fn(() => undefined),
    usePaginatedQuery: vi.fn(() => ({ results: [], status: "Exhausted", isLoading: false, loadMore: vi.fn() })),
    useMutation: vi.fn(() => vi.fn()),
    useAction: vi.fn(() => vi.fn()),
    useConvex: vi.fn(() => ({ query: vi.fn(), mutation: vi.fn(), action: vi.fn() })),
  };
}

/**
 * Translations that echo `namespace.key`.
 *
 * Deliberately not the real copy: a screen test that asserts wording breaks
 * every time the wording improves, and the wording has its own tests.
 */
export function nextIntl() {
  return {
    useTranslations: (namespace: string) => Object.assign(
      (key: string) => `${namespace}.${key}`,
      { rich: (key: string) => `${namespace}.${key}` },
    ),
    useLocale: () => "en",
    useFormatter: () => ({
      dateTime: (value: Date) => value.toISOString(),
      number: (value: number) => String(value),
      relativeTime: () => "",
    }),
    // renderWithProviders wraps every screen in the provider, so the mocked
    // module has to export it too — as a pass-through.
    NextIntlClientProvider: ({ children }: { children?: React.ReactNode }) => children,
  };
}

/** A router that goes nowhere, with route params a caller can set. */
export function nextNavigation(params: Record<string, string> = {}, search = "") {
  return {
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), prefetch: vi.fn() }),
    usePathname: () => "/",
    useSearchParams: () => new URLSearchParams(search),
    useParams: () => params,
    redirect: vi.fn(),
    notFound: vi.fn(),
  };
}

/** `next/link` as a plain anchor. */
export function nextLink() {
  return {
    default: ({ children, href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { children: React.ReactNode; href: string }) => (
      <a href={href} {...props}>
        {children}
      </a>
    ),
  };
}

/**
 * What `usePaginatedQuery` returns for a given set of rows.
 *
 * `undefined` is the query still out, `[]` is an answer of nothing — the two
 * states `withRows` has to be able to tell apart.
 */
export function pagedResult(rows: unknown[] | undefined) {
  return {
    results: rows ?? [],
    status: rows === undefined ? "LoadingFirstPage" : "Exhausted",
    isLoading: rows === undefined,
    loadMore: vi.fn(),
  };
}
