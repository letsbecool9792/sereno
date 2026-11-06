import { useId } from "react";

/// sereno's mark (web/DESIGN.md, "The logo"): an electric-blue card tucked behind a frosted lime wallet, the card
/// glowing through the glass, the GitHub mark in the pocket. Colors are fixed: it's a logo, not a themed icon.
/// public/mark.svg and extension/icons/*.png are exported from the same geometry; change all three together.
export const POCKET =
  "M32 44H46.5C49.6 44 50.9 46 52 48.3C53.8 52 56.6 54.5 60 54.5C63.4 54.5 66.2 52 68 48.3C69.1 46 70.4 44 73.5 44H88C96.3 44 102 49.7 102 58V90C102 98.3 96.3 104 88 104H32C23.7 104 18 98.3 18 90V58C18 49.7 23.7 44 32 44Z";
export const GITHUB =
  "M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.9 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.65 0 0 .84-.27 2.75 1.02a9.6 9.6 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.38.2 2.4.1 2.65.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10 10 0 0 0 12 2Z";

export function Mark({ size = 30, title }: { size?: number; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg width={size} height={size} viewBox="10 14 100 100" className="mark" role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <defs>
        <clipPath id={`p${id}`}><path d={POCKET} /></clipPath>
        <filter id={`b${id}`} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="7" /></filter>
        <linearGradient id={`e${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".75" />
          <stop offset="1" stopColor="#fff" stopOpacity=".15" />
        </linearGradient>
      </defs>
      <rect className="mark-card" x="34" y="27" width="58" height="40" rx="9" fill="#2b59ff" transform="rotate(10 63 47)" />
      <g className="mark-pocket">
        <path d={POCKET} fill="#e0f98e" />
        <g clipPath={`url(#p${id})`}>
          <rect x="34" y="27" width="58" height="40" rx="9" fill="#2b59ff" transform="rotate(10 63 47)" filter={`url(#b${id})`} opacity=".95" />
        </g>
        <path d={POCKET} fill="none" stroke={`url(#e${id})`} strokeWidth="1.2" />
        <path className="mark-glyph" transform="translate(45 61) scale(1.25)" fill="#0a1030" d={GITHUB} />
      </g>
    </svg>
  );
}
