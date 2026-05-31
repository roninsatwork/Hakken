"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Sun, Moon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

function useMounted() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) return (
    <div className="w-8 h-8 rounded-full bg-foreground/5 border border-border-dim" />
  );

  return (
    <button
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="relative w-11 h-11 flex items-center justify-center rounded-[14px] bg-sidebar/40 backdrop-blur-3xl border border-border-dim hover:text-foreground hover:bg-foreground/5 transition-all group overflow-visible"
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={theme}
          initial={{ y: 20, opacity: 0, scale: 0.5 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -20, opacity: 0, scale: 0.5 }}
          transition={{ duration: 0.2, ease: "easeInOut" }}
          className="text-secondary group-hover:text-foreground z-10"
        >
          {theme === "dark" ? (
            <Sun className="w-5 h-5" />
          ) : (
            <Moon className="w-5 h-5" />
          )}
        </motion.div>
      </AnimatePresence>
      
      {/* Tactical Glow Effect */}
      <div className="absolute inset-0 bg-radial-at-tl from-white/10 to-transparent pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity rounded-[14px] overflow-hidden" />

      {/* Tooltip */}
      <div className="absolute top-full mt-2 opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 translate-y-2 group-hover:translate-y-0">
        <div className="bg-card dark:bg-[#1a1a1c] border border-border-dim text-[11px] font-medium text-foreground px-3 py-1.5 rounded-[8px] whitespace-nowrap shadow-xl">
          Toggle Theme
        </div>
      </div>
    </button>
  );
}
