// The site's logo from /logo.svg.
import { SITE } from "@aihot/industry/site";

export function Wordmark({ size = 36, className = "" }: { size?: number; className?: string }) {
  return (
    <img
      src="/logo.svg"
      alt={SITE.name}
      width={size}
      height={size}
      className={`rounded-[22%] object-contain shrink-0 shadow-xs ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
    />
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
