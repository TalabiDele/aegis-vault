import * as React from "react";
import { cn } from "@/shared/lib/utils";

export type StatusTone = "verified" | "pending" | "critical" | "info";

const TONE_CLASSES: Record<StatusTone, string> = {
  verified: "bg-[#052E1E] text-[#34D399] border-[#065F46]",
  pending: "bg-[#2A1F08] text-[#FBBF24] border-[#78350F]",
  critical: "bg-[#2D0E14] text-[#FB7185] border-[#881337]",
  info: "bg-[#161F30] text-[#CBD5E1] border-[#334155]",
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  mono?: boolean;
}

export function StatusBadge({
  tone = "info",
  mono = false,
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium leading-4 shadow-none",
        TONE_CLASSES[tone],
        mono && "font-mono tabular-nums",
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
