import { cn } from "@platform/ui";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={cn("h-7 w-7", className)} aria-hidden>
      <rect width="512" height="512" rx="112" fill="#0b6b4f" />
      <path d="M128 352l80-88 64 56 112-128" fill="none" stroke="#fff" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M312 192h72v72" fill="none" stroke="#6ee7b7" strokeWidth="40" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 font-semibold tracking-tight", className)}>
      <LogoMark />
      <span>Growth OS</span>
    </span>
  );
}
