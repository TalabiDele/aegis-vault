"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Loader2,
  X,
  XCircle,
} from "lucide-react";
import type { TxLifecycleState } from "@/entities/safe/types";
import { getExplorerTxUrl } from "@/shared/config/chains";
import { cn } from "@/shared/lib/utils";

export interface TxStateBannerProps {
  lifecycle: TxLifecycleState;
  chainId: number;
  onDismiss?: () => void;
  className?: string;
}

export function TxStateBanner({
  lifecycle,
  chainId,
  onDismiss,
  className,
}: TxStateBannerProps) {
  if (lifecycle.status === "idle") {
    return null;
  }

  const isLoading =
    lifecycle.status === "simulating" ||
    lifecycle.status === "awaiting_wallet_signature" ||
    lifecycle.status === "pending_onchain";

  const isSuccess =
    lifecycle.status === "proposed_offchain" || lifecycle.status === "confirmed";

  const isWarning =
    lifecycle.status === "user_rejected" || lifecycle.status === "wrong_network";

  const toneClasses = isSuccess
    ? "border-[#065F46] bg-[#052E1E] text-[#34D399]"
    : isWarning
      ? "border-[#78350F] bg-[#2A1F08] text-[#FBBF24]"
      : isLoading
        ? "border-[#334155] bg-[#161F30] text-[#CBD5E1]"
        : "border-[#881337] bg-[#2D0E14] text-[#FB7185]";

  return (
    <div
      role="status"
      className={cn(
        "flex items-start justify-between gap-3 rounded-md border px-3.5 py-2.5 text-xs",
        toneClasses,
        className
      )}
    >
      <div className="flex items-start gap-2">
        {isLoading ? (
          <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
        ) : isSuccess ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        ) : isWarning ? (
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        ) : (
          <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
        )}
        <div className="space-y-1">
          <p className="font-medium leading-4">
            {lifecycle.message ?? lifecycle.status.replaceAll("_", " ")}
          </p>
          {lifecycle.safeTxHash ? (
            <p className="font-mono text-[11px] opacity-90 tabular-nums">
              SafeTxHash: {lifecycle.safeTxHash}
            </p>
          ) : null}
          {lifecycle.txHash ? (
            <a
              href={getExplorerTxUrl(chainId, lifecycle.txHash)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-mono text-[11px] underline tabular-nums"
            >
              View on Explorer
              <ExternalLink className="h-3 w-3" />
            </a>
          ) : null}
        </div>
      </div>
      {onDismiss && !isLoading ? (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss status notice"
          className="rounded p-0.5 opacity-75 transition-opacity hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
