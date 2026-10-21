// The site's logo and wordmark (its name from industry/site.ts, with brand icon from /logo.svg).
import { SITE } from "@aihot/industry/site";

export function Wordmark({ size = 22, className = "" }: { size?: number; className?: string }) {
  const iconSize = Math.round(size * 1.3);
  return (
    <span className={`inline-flex items-center gap-2 font-black leading-none tracking-[-0.03em] ${className}`} style={{ fontSize: size }} aria-label={SITE.name} role="img">
      <img
        src="/logo.svg"
        alt=""
        width={iconSize}
        height={iconSize}
        className="rounded-[22%] object-contain shrink-0 shadow-xs"
        style={{ width: `${iconSize}px`, height: `${iconSize}px` }}
      />
      <span aria-hidden="true">{SITE.name}</span>
    </span>
  );
}

/** A ring with a dot; spinning, it is the loader. */
export function RingMark({ className = "", spinning = false }: { className?: string; spinning?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <g style={spinning ? { transformOrigin: "12px 12px", animation: "spin-slow 1.1s linear infinite" } : undefined}>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="42 15" />
      </g>
      <circle cx="12" cy="12" r="2.6" fill="currentColor" />
    </svg>
  );
}
