"use client";

import React, { useRef } from "react";
import { Download } from "lucide-react";
import html2canvas from "html2canvas";
import { useTheme } from "next-themes";

interface ChartExportWrapperProps {
  children: React.ReactNode;
  exportName: string;
  className?: string;
}

export default function ChartExportWrapper({ children, exportName, className = "" }: ChartExportWrapperProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const { resolvedTheme } = useTheme();

  const handleExport = async () => {
    if (!chartRef.current) return;
    
    // Determine the exact physical background color to render against to prevent transparent PNGs washing out text
    const bgColor = resolvedTheme === "dark" ? "#0d0d0d" : "#ffffff";

    const canvas = await html2canvas(chartRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: bgColor,
    });
    
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.download = `${exportName}-${new Date().toISOString().split("T")[0]}.png`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, "image/png");
  };

  return (
    <div ref={chartRef} className={`group relative ${className}`}>
      {children}
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleExport();
        }}
        className="absolute top-4 right-4 z-50 p-2.5 rounded-xl bg-[#0000000d] dark:bg-[#ffffff0d] backdrop-blur-md border border-[#0000001a] dark:border-[#ffffff1a] shadow-lg opacity-0 outline-none hover:bg-[#0000001a] dark:hover:bg-[#ffffff1a] hover:text-brand transition-all duration-300 group-hover:opacity-100 flex items-center justify-center cursor-pointer text-muted"
      >
        <Download className="w-4 h-4" />
      </button>
    </div>
  );
}
