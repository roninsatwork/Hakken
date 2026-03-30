"use client";

import { motion, useMotionValue, useSpring, useMotionTemplate } from "framer-motion";
import { useEffect } from "react";

export function FluidBackground() {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  // Springs create that heavy, cinematic drag effect behind the cursor
  const springX = useSpring(mouseX, { stiffness: 40, damping: 15, mass: 0.8 });
  const springY = useSpring(mouseY, { stiffness: 40, damping: 15, mass: 0.8 });

  // Handle global mouse movement
  useEffect(() => {
    const updateMousePosition = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
    };
    
    // Set initial center position before tracking kicks in
    if (typeof window !== "undefined") {
      mouseX.set(window.innerWidth / 2);
      mouseY.set(window.innerHeight / 2);
    }

    window.addEventListener("mousemove", updateMousePosition, { passive: true });
    return () => window.removeEventListener("mousemove", updateMousePosition);
  }, [mouseX, mouseY]);

  // Construct a brilliant, multi-layered colorful gradient mesh tracking the springs
  const auraTemplate = useMotionTemplate`
    radial-gradient(80vw circle at ${springX}px ${springY}px, rgba(239, 68, 68, 0.25), transparent 50%),
    radial-gradient(100vw circle at calc(${springX}px - 200px) calc(${springY}px + 150px), rgba(245, 158, 11, 0.15), transparent 50%),
    radial-gradient(90vw circle at calc(${springX}px + 300px) calc(${springY}px - 100px), rgba(220, 38, 38, 0.15), transparent 50%)
  `;

  return (
    <>
      <motion.div 
        className="absolute inset-0 pointer-events-none z-0"
        style={{ background: auraTemplate }}
      />
      {/* Adding a sophisticated noise/grain overlay so the gradient feels physical, not digital */}
      <div 
        className="absolute inset-0 z-0 pointer-events-none opacity-[0.4] mix-blend-overlay"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.65%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")' }}
      />
    </>
  );
}
