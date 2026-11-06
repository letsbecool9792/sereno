import { useRef } from "react";
import { Mark } from "./Mark";
import { gsap, useMotion } from "./motion";

/// Runs once, on a first visit to the landing page: the wallet assembles. The glass pocket rises, the blue card drops
/// in behind it, the glow blooms, the wordmark rises, the call decodes, then the night lifts like a curtain. About
/// 2.4s; the page starts revealing at BOOT_REVEAL. Never rendered under reduced motion.
export const BOOT_REVEAL = 1.85;

export function Boot({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useMotion(root, () => {
    const tl = gsap.timeline({ onComplete: onDone });
    tl.from(".boot .mark-pocket", { y: 26, autoAlpha: 0, duration: 0.7 }, 0.1)
      .from(".boot .mark-card", { y: -46, autoAlpha: 0, duration: 0.75, ease: "back.out(1.6)" }, 0.35)
      .from(".boot .mark-glyph", { scale: 0.4, autoAlpha: 0, svgOrigin: "60 76", duration: 0.5, ease: "back.out(2)" }, 0.75)
      .from(".boot-glow", { scale: 0.3, autoAlpha: 0, duration: 1 }, 0.55)
      .from(".boot-word span", { yPercent: 115, duration: 0.75, stagger: 0.035 }, 0.75)
      .to(".boot-call", { scrambleText: { text: "¡sereno! all is calm", chars: "AaCcNnZz0123456789+/=", speed: 0.5, revealDelay: 0.15 }, duration: 0.8, ease: "none" }, 0.95)
      .to(".boot-inner", { y: -20, autoAlpha: 0, duration: 0.45, ease: "power2.in" }, 1.7)
      .to(root.current, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.8, ease: "expo.inOut" }, BOOT_REVEAL);
  });
  return (
    <div ref={root} className="boot" aria-hidden="true">
      <div className="boot-inner">
        <div className="boot-mark">
          <div className="boot-glow" />
          <Mark size={112} />
        </div>
        <div className="boot-word">
          {"sereno".split("").map((ch, i) => <span key={i}>{ch}</span>)}
        </div>
        <div className="boot-call mono">&nbsp;</div>
      </div>
    </div>
  );
}
