"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { getExplorerAddressUrl } from "@/shared/config/chains";
import { cn } from "@/shared/lib/utils";
import { toChecksumAddress, truncateAddress } from "@/shared/web3/bigint";

export interface AddressDisplayProps {
  address: string;
  chainId?: number;
  label?: string | null;
  verified?: boolean;
  showCopy?: boolean;
  showExplorer?: boolean;
  full?: boolean;
  className?: string;
}

export function AddressDisplay({
  address,
  chainId = 1,
  label,
  verified = false,
  showCopy = true,
  showExplorer = true,
  full = false,
  className,
}: AddressDisplayProps) {
  const [copied, setCopied] = useState(false);
  const checksummed = toChecksumAddress(address) ?? address;
  const displayAddr = full ? checksummed : truncateAddress(checksummed);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(checksummed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable in non-secure context
    }
  }

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {label ? (
        <span className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-xs font-medium text-foreground">
          {verified ? (
            <ShieldCheck className="h-3 w-3 text-[#34D399]" aria-hidden="true" />
          ) : null}
          <span className="max-w-[140px] truncate">{label}</span>
        </span>
      ) : null}
      <span
        className="font-mono text-xs text-foreground tabular-nums"
        title={checksummed}
      >
        {displayAddr}
      </span>
      {showCopy ? (
        <button
          type="button"
          onClick={handleCopy}
          aria-label={`Copy address ${checksummed}`}
          className="inline-flex h-5 w-5 items-center justify-center rounded border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3 w-3 text-[#34D399]" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </button>
      ) : null}
      {showExplorer ? (
        <a
          href={getExplorerAddressUrl(chainId, checksummed)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`View ${checksummed} on block explorer`}
          className="inline-flex h-5 w-5 items-center justify-center rounded border border-transparent text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground"
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </span>
  );
}
