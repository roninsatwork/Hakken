"use client";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Move, Zap } from "lucide-react";
import { Button } from "@/src/ui/components/screens/Button";
import type { FirstPersonGame } from "./engine/FirstPersonGame";
import styles from "./FirstPersonCanvas.module.css";

export function TouchControls({
  game,
}: {
  game: React.RefObject<FirstPersonGame | null>;
}) {
  const t = useTranslations("arcade.firstPerson");
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);
  const look = useRef<{ x: number; y: number; id: number } | null>(null);
  const [stick, setStick] = useState({ x: 0, y: 0 });
  const release = () => {
    origin.current = null;
    setStick({ x: 0, y: 0 });
    game.current?.moveTouch(0, 0);
  };
  return (
    <div className={styles.touchControls}>
      <div
        className="absolute bottom-28 left-5 flex h-28 w-28 touch-none items-center justify-center rounded-full border border-foreground/30 bg-background/50"
        role="group"
        aria-label={t("touchMove")}
        onPointerDown={(e) => {
          if (origin.current) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          origin.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          const start = origin.current;
          if (!start || start.id !== e.pointerId) return;
          const dx = e.clientX - start.x,
            dy = e.clientY - start.y,
            length = Math.hypot(dx, dy);
          const scale = Math.min(1, 36 / Math.max(1, length));
          setStick({ x: dx * scale, y: dy * scale });
          game.current?.moveTouch((-dy * scale) / 36, (dx * scale) / 36);
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onLostPointerCapture={release}
      >
        <span
          className="flex h-12 w-12 items-center justify-center rounded-full border border-foreground/30 bg-background/80 text-foreground"
          style={{ transform: `translate(${stick.x}px,${stick.y}px)` }}
        >
          <Move className="h-5 w-5" />
        </span>
      </div>
      <div
        className="absolute bottom-28 right-5 h-32 w-36 touch-none rounded-2xl border border-foreground/20 bg-background/25 p-3 text-center text-xs text-foreground/80"
        role="group"
        aria-label={t("touchLook")}
        onPointerDown={(e) => {
          if (look.current) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          look.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerMove={(e) => {
          const previous = look.current;
          if (!previous || previous.id !== e.pointerId) return;
          game.current?.lookTouch(
            e.clientX - previous.x,
            e.clientY - previous.y,
          );
          look.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
        }}
        onPointerUp={() => {
          look.current = null;
        }}
        onPointerCancel={() => {
          look.current = null;
        }}
        onLostPointerCapture={() => {
          look.current = null;
        }}
      >
        {t("touchLook")}
      </div>
      <Button
        variant="quiet"
        aria-label={t("touchDash")}
        onClick={() => game.current?.dashTouch()}
        className="absolute bottom-64 right-14 flex h-14 w-14 touch-manipulation items-center justify-center rounded-full border border-info bg-background/80 text-info"
      >
        <Zap className="h-6 w-6" />
      </Button>
    </div>
  );
}
