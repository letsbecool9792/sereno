// GSAP set-up. Motion verb: things glow in and settle, like a lantern being raised. One ease family (expo.out), short
// staggers, and nothing at all under prefers-reduced-motion: content is visible by default and only animated from.
import { useLayoutEffect, type RefObject } from "react";
import { gsap } from "gsap";
import { DrawSVGPlugin } from "gsap/DrawSVGPlugin";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(DrawSVGPlugin, ScrambleTextPlugin, ScrollTrigger, SplitText);
gsap.defaults({ ease: "expo.out", duration: 0.8 });
// Finish on schedule even when frames drop (a busy laptop on stage): skip ahead instead of stretching time, so no
// headline is ever left half-revealed.
gsap.ticker.lagSmoothing(0);

export { gsap, ScrollTrigger, SplitText };

export const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/// Runs `setup` in a GSAP context scoped to `scope` when the visitor hasn't asked for reduced motion. Everything it
/// creates is reverted on unmount and whenever `deps` change.
export function useMotion(scope: RefObject<HTMLElement | null>, setup: () => void | (() => void), deps: unknown[] = []) {
  useLayoutEffect(() => {
    if (!scope.current) return;
    const mm = gsap.matchMedia(scope.current);
    mm.add("(prefers-reduced-motion: no-preference)", () => setup());
    return () => mm.revert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/// Reveals `targets` once they scroll into view (set first, so nothing flashes before it animates).
export function revealOnScroll(targets: string, opts: { y?: number; stagger?: number } = {}) {
  const els = gsap.utils.toArray<HTMLElement>(targets);
  if (!els.length) return;
  gsap.set(els, { y: opts.y ?? 28, autoAlpha: 0 });
  ScrollTrigger.batch(els, {
    start: "top 88%",
    once: true,
    onEnter: (batch) => gsap.to(batch, { y: 0, autoAlpha: 1, duration: 0.9, stagger: opts.stagger ?? 0.08 }),
  });
}

/// A pointer-following highlight inside `el` (the "spotlight" on cards): sets --sx/--sy in pixels.
export function spotlight(e: React.PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--sx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--sy", `${e.clientY - r.top}px`);
}
