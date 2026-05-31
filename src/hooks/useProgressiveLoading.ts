"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type LoadingSequence = {
  messages: string[];
};

export function useProgressiveLoading(isActive: boolean) {
  const t = useTranslations('ai.assistant.loadingStages');
  const [step, setStep] = useState(0);
  const [sequence, setSequence] = useState<LoadingSequence | null>(null);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    const setupSequence = window.setTimeout(() => {
      setStep(0);
      setSequence({
        messages: [
          t(`stage1.${Math.floor(Math.random() * 3)}`),
          t(`stage2.${Math.floor(Math.random() * 3)}`),
          t(`stage3.${Math.floor(Math.random() * 3)}`),
          t(`stage4.${Math.floor(Math.random() * 3)}`)
        ]
      });
    }, 0);

    const interval = setInterval(() => {
      setStep((currentStep) => currentStep + 1);
    }, 1200); // Shift stage every 1.2 seconds

    return () => {
      window.clearTimeout(setupSequence);
      clearInterval(interval);
    };
  }, [isActive, t]);

  if (!isActive || !sequence) return "";

  return sequence.messages[Math.min(step, sequence.messages.length - 1)];
}
