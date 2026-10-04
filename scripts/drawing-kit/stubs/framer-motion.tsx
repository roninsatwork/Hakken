// The drawing kit draws the resting state: motion elements are plain elements.
import { createElement, forwardRef, type ReactNode } from "react";
const MOTION_PROPS = new Set(["layout", "layoutId", "initial", "animate", "exit", "transition", "variants", "whileHover", "whileTap", "whileFocus", "whileInView", "viewport", "onAnimationComplete", "custom", "drag", "dragConstraints"]);
const cache = new Map<string, unknown>();
export const motion = new Proxy({}, {
  get(_target, tag: string) {
    if (!cache.has(tag)) {
      cache.set(tag, forwardRef<unknown, Record<string, unknown>>(function MotionElement(props, ref) {
        const clean = Object.fromEntries(Object.entries(props).filter(([key]) => !MOTION_PROPS.has(key)));
        // A shared layoutId is one element in the app: framer shows only the
        // last one mounted. The kit marks them, and keeps only the last.
        const shared = typeof props.layoutId === "string" ? { "data-kit-layout-id": props.layoutId } : {};
        return createElement(tag, { ...clean, ...shared, ref });
      }));
    }
    return cache.get(tag);
  },
}) as Record<string, React.ComponentType<Record<string, unknown>>>;
export const AnimatePresence = ({ children }: { children?: ReactNode }) => children ?? null;
export const LayoutGroup = ({ children }: { children?: ReactNode }) => children ?? null;
export const useReducedMotion = () => true;
export const useAnimation = () => ({ start() {}, stop() {} });
