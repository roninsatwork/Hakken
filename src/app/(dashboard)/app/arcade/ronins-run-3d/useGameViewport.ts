"use client";
import { useEffect, useRef } from "react";
import { useUI } from "@/src/context/UIContext";

/** Give this game room on small screens without changing the user's desktop layout. */
export function useGameViewport() {
  const { isSidebarOpen, setIsSidebarOpen } = useUI();
  const sidebar = useRef(isSidebarOpen);
  useEffect(() => {
    sidebar.current = isSidebarOpen;
  }, [isSidebarOpen]);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 640px)");
    const originallyOpen = sidebar.current;
    let collapsed = false;
    const fit = () => {
      if (query.matches) {
        if (sidebar.current) {
          collapsed = true;
          setIsSidebarOpen(false);
        }
      } else if (collapsed) {
        collapsed = false;
        setIsSidebarOpen(originallyOpen);
      }
    };
    fit();
    query.addEventListener("change", fit);
    return () => {
      query.removeEventListener("change", fit);
      if (collapsed) setIsSidebarOpen(originallyOpen);
    };
  }, [setIsSidebarOpen]);
}
