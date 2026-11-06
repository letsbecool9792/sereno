/// Sereno's mascot: the night watchman's lantern. Colours come from --l-frame / --l-glass / --l-flame.
export function Lantern({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="lantern" role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path d="M11 7a5 5 0 0 1 10 0" fill="none" stroke="var(--l-frame)" strokeWidth="2.2" strokeLinecap="round" />
      <rect x="8" y="8" width="16" height="3.4" rx="1.7" fill="var(--l-frame)" />
      <rect x="9" y="11" width="14" height="15" rx="5" fill="var(--l-glass)" />
      <ellipse cx="16" cy="19.5" rx="3.2" ry="4.2" fill="var(--l-flame)" />
      <circle cx="13.6" cy="17" r="1.1" fill="var(--l-eye)" />
      <circle cx="18.4" cy="17" r="1.1" fill="var(--l-eye)" />
      <rect x="10" y="26" width="12" height="2.6" rx="1.3" fill="var(--l-frame)" />
    </svg>
  );
}
