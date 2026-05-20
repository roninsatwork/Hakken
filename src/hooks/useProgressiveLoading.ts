"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";

export function useProgressiveLoading(isActive: boolean) {
  const t = useTranslations('ai.assistant.loadingStages');
  const [currentText, setCurrentText] = useState("");

  useEffect(() => {
    if (!isActive) {
      setCurrentText("");
      return;
    }

    // Pick a random sentence index (0, 1, or 2) for each of the 4 stages
    const r1 = Math.floor(Math.random() * 3);
    const r2 = Math.floor(Math.random() * 3);
    const r3 = Math.floor(Math.random() * 3);
    const r4 = Math.floor(Math.random() * 3);

    const chosenSequence = [
      t(`stage1.${r1}`),
      t(`stage2.${r2}`),
      t(`stage3.${r3}`),
      t(`stage4.${r4}`)
    ];

    // Set the first stage sentence immediately
    setCurrentText(chosenSequence[0]);

    let step = 0;
    const interval = setInterval(() => {
      if (step < chosenSequence.length - 1) {
        step += 1;
        setCurrentText(chosenSequence[step]);
      }
    }, 1200); // Shift stage every 1.2 seconds

    return () => clearInterval(interval);
  }, [isActive, t]);

  return currentText;
}
