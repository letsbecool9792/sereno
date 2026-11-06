/// sereno's mark. A sereno walked the night with two things: a lantern and the keys to every street door. Here the
/// lantern's flame is a keyhole. Strokes use --l-frame and the keyhole --l-flame, so the mark works on any surface.
export function Lantern({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" className="lantern" role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title && <title>{title}</title>}
      <path className="lantern-line" d="M13.4 6.2a2.6 2.6 0 0 1 5.2 0" />
      <path className="lantern-line" d="M10.5 9.2h11l-1.6-3h-7.8z" />
      <path className="lantern-line" d="M10 9.2h12v13.3a3.5 3.5 0 0 1-3.5 3.5h-5a3.5 3.5 0 0 1-3.5-3.5z" />
      <path className="lantern-line" d="M12.5 28.5h7" />
      <path className="flame" d="M16 12.8a2.4 2.4 0 0 1 1.2 4.48L17.8 21.5h-3.6l.6-4.22A2.4 2.4 0 0 1 16 12.8z" />
    </svg>
  );
}
