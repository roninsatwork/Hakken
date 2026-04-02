"use client";

import React from "react";
import { motion } from "framer-motion";
import { useUI } from "@/src/context/UIContext";

export default function FluidWorkspace({ children, className }: { children: React.ReactNode, className?: string }) {
  const { isSidebarOpen } = useUI();

  return (
    <motion.main
      initial={false}
      animate={{ 
        paddingLeft: isSidebarOpen ? "275px" : "0px",
      }}
      transition={{ type: "spring", stiffness: 300, damping: 30, mass: 1 }}
      className="h-screen overflow-y-auto flex flex-col w-full bg-transparent text-foreground relative z-0"
    >
      <div className={`flex flex-col flex-1 w-full p-8 relative min-h-0 ${className || ''}`}>
        {children}
      </div>
    </motion.main>
  );
}
