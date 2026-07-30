"use client";

import { useEffect } from "react";
import { ensureGsap, prefersReducedMotion } from "./motion";

/**
 * Page-wide motion behaviours, mounted once per public page:
 *
 * - `[data-reveal]` elements rise and fade in as they enter the viewport.
 *   Siblings sharing a parent stagger automatically.
 * - `[data-speed]` elements parallax against scroll. Speed is a multiplier on
 *   scroll distance: 1 is normal flow, 0.8 lags (feels far away), 1.2 leads
 *   (feels near). This is the "parallax information" layer — stats, chips and
 *   decorative shapes float at different depths.
 *
 * With reduced motion, everything renders in its final state.
 */
export function PublicMotion() {
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const { gsap, ScrollTrigger } = ensureGsap();

    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) => {
        gsap.fromTo(
          el,
          { autoAlpha: 0, y: 30 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.9,
            ease: "power3.out",
            delay: Number(el.dataset.revealDelay ?? 0),
            scrollTrigger: { trigger: el, start: "top 82%" },
          }
        );
      });

      gsap.utils.toArray<HTMLElement>("[data-speed]").forEach((el) => {
        const speed = Number(el.dataset.speed ?? 1);
        const trigger = el.parentElement ?? el;
        // Over the trigger's full pass through the viewport, an element at
        // speed 1 travels that distance with the page; other speeds lag or
        // lead by the difference.
        gsap.fromTo(
          el,
          { y: () => (speed - 1) * (window.innerHeight + trigger.offsetHeight) * 0.5 },
          {
            y: () => (1 - speed) * (window.innerHeight + trigger.offsetHeight) * 0.5,
            ease: "none",
            scrollTrigger: {
              trigger,
              start: "top bottom",
              end: "bottom top",
              scrub: 0.6,
              invalidateOnRefresh: true,
            },
          }
        );
      });
    });

    return () => ctx.revert();
  }, []);

  return null;
}
