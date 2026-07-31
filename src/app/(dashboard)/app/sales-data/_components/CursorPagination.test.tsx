import { act, fireEvent, render, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useCursorPagination } from "./CursorPagination";

describe("useCursorPagination", () => {
  it("walks forward and back over a stack of cursors", () => {
    const { result } = renderHook(() => useCursorPagination("sales"));

    expect(result.current.cursor).toBeNull();
    expect(result.current.pageIndex).toBe(0);

    act(() => result.current.next("cursor-page-2"));
    expect(result.current.cursor).toBe("cursor-page-2");
    expect(result.current.pageIndex).toBe(1);

    act(() => result.current.next("cursor-page-3"));
    expect(result.current.cursor).toBe("cursor-page-3");

    // Back replays a cursor already seen rather than refetching from the start.
    act(() => result.current.previous());
    expect(result.current.cursor).toBe("cursor-page-2");
    act(() => result.current.previous());
    expect(result.current.cursor).toBeNull();
    expect(result.current.pageIndex).toBe(0);
  });

  it("drops the position when the key changes", () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) => useCursorPagination(key),
      { initialProps: { key: "sales" } }
    );

    act(() => result.current.next("cursor-page-2"));
    expect(result.current.cursor).toBe("cursor-page-2");

    rerender({ key: "categories" });
    expect(result.current.cursor).toBeNull();
    expect(result.current.pageIndex).toBe(0);
  });

  /**
   * The regression: the position used to be cleared from an effect, which runs
   * after the render that changed the key. That render had already handed the
   * previous table's cursor to `useQuery`, and Convex rejects a cursor offered
   * to a query it did not come from — `InvalidCursor`, with the screen down.
   * So it is not enough that the cursor settles; no render may ever pair a new
   * key with an old key's cursor.
   */
  it("never renders a new key alongside the previous key's cursor", () => {
    const seen: Array<{ key: string; cursor: string | null }> = [];

    function Probe({ paginationKey }: { paginationKey: string }) {
      const pagination = useCursorPagination(paginationKey);
      seen.push({ key: paginationKey, cursor: pagination.cursor });
      return (
        <button type="button" onClick={() => pagination.next("sales-cursor-page-2")}>
          next
        </button>
      );
    }

    const { rerender, getByRole } = render(<Probe paginationKey="sales" />);

    fireEvent.click(getByRole("button", { name: "next" }));
    expect(seen.at(-1)).toEqual({ key: "sales", cursor: "sales-cursor-page-2" });

    seen.length = 0;
    rerender(<Probe paginationKey="categories" />);

    expect(seen.length).toBeGreaterThan(0);
    for (const render of seen) {
      expect(render).toEqual({ key: "categories", cursor: null });
    }
  });

  it("keeps the key when reset is called explicitly", () => {
    const { result } = renderHook(() => useCursorPagination("sales"));

    act(() => result.current.next("cursor-page-2"));
    act(() => result.current.reset());

    expect(result.current.cursor).toBeNull();
    expect(result.current.pageIndex).toBe(0);

    // Still the same query, so it can page forward again from the start.
    act(() => result.current.next("cursor-page-2"));
    expect(result.current.cursor).toBe("cursor-page-2");
  });
});
