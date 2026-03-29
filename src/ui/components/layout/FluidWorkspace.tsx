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
      className="min-h-screen flex flex-col w-full bg-transparent text-foreground relative z-0"
    >
      <div className={`flex-1 w-full p-8 relative ${className || ''}`}>
        {children}
      </div>
    </motion.main>
  );
}
