import { useRef } from "react";
import { Lantern } from "./Lantern";
import { gsap, useMotion } from "./motion";

/// Runs once, on a first visit to the landing page: the watchman lights his lantern. The mark draws itself, the
/// keyhole flame catches, the wordmark rises, then the night lifts away like a curtain. About 2.6s; the page itself
/// starts revealing at BOOT_REVEAL. Never rendered under reduced motion.
export const BOOT_REVEAL = 1.95;

export function Boot({ onDone }: { onDone: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  useMotion(root, () => {
    const tl = gsap.timeline({ onComplete: onDone });
    tl.from(".boot .lantern-line", { drawSVG: "0%", duration: 0.8, stagger: 0.06, ease: "power2.inOut" }, 0.1)
      .from(".boot .flame", { scale: 0, svgOrigin: "16 17", duration: 0.55, ease: "back.out(2.2)" }, 0.7)
      .from(".boot-glow", { scale: 0.3, autoAlpha: 0, duration: 1 }, 0.7)
      .from(".boot-word span", { yPercent: 115, duration: 0.75, stagger: 0.035 }, 0.8)
      .to(".boot-call", { scrambleText: { text: "¡sereno! all is calm", chars: "AaCcNnZz0123456789+/=", speed: 0.5, revealDelay: 0.15 }, duration: 0.8, ease: "none" }, 1.0)
      .to(".boot-inner", { y: -20, autoAlpha: 0, duration: 0.45, ease: "power2.in" }, 1.8)
      .to(root.current, { clipPath: "inset(0% 0% 100% 0%)", duration: 0.8, ease: "expo.inOut" }, BOOT_REVEAL);
  });
  return (
    <div ref={root} className="boot" aria-hidden="true">
      <div className="boot-inner">
        <div className="boot-mark">
          <div className="boot-glow" />
          <Lantern size={88} />
        </div>
        <div className="boot-word">
          {"sereno".split("").map((ch, i) => <span key={i}>{ch}</span>)}
        </div>
        <div className="boot-call mono">&nbsp;</div>
      </div>
    </div>
  );
}
