"use client";

import { useCallback, useState } from "react";

/**
 * An element's width in real pixels, kept up to date: 0 until it's on the page, or where a width can't be read. It's read as the
 * element arrives, before the first paint, so nothing shows at the wrong size for a moment. An element can arrive after the first
 * render, with its figures, so it's watched from whenever it mounts. Hand the first value to the element's `ref`.
 */
export function useElementWidth<Element extends HTMLElement = HTMLDivElement>(): [(node: Element | null) => (() => void) | undefined, number] {
  const [width, setWidth] = useState(0);
  const watch = useCallback((node: Element | null) => {
    if (!node) return undefined;
    setWidth(Math.round(node.getBoundingClientRect().width));
    if (typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver((entries) => setWidth(Math.round(entries[0]?.contentRect.width ?? 0)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [watch, width];
}
