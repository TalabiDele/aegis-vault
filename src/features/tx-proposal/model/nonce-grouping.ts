import type { SafeMultisigTransaction } from "@/entities/safe/types";

export interface NonceGroup {
  nonce: number;
  isNextExecutable: boolean;
  isStale: boolean;
  hasConflict: boolean;
  proposals: SafeMultisigTransaction[];
}

/**
 * Groups pending Safe transactions by ascending nonce, tagging:
 * - `isNextExecutable`: matches current on-chain `safe.nonce()`
 * - `hasConflict`: 2 or more competing proposals share this nonce
 * - `isStale`: nonce is lower than current on-chain `safe.nonce()`
 */
export function groupProposalsByNonce(
  proposals: ReadonlyArray<SafeMultisigTransaction>,
  currentOnChainNonce: number
): NonceGroup[] {
  const map = new Map<number, SafeMultisigTransaction[]>();

  for (const tx of proposals) {
    if (tx.isExecuted) {
      continue;
    }
    const existing = map.get(tx.nonce) ?? [];
    existing.push(tx);
    map.set(tx.nonce, existing);
  }

  const sortedNonces = Array.from(map.keys()).sort((a, b) => a - b);

  return sortedNonces.map((nonce) => {
    const groupItems = (map.get(nonce) ?? []).sort(
      (a, b) => b.confirmations.length - a.confirmations.length
    );

    return {
      nonce,
      isNextExecutable: nonce === currentOnChainNonce,
      isStale: nonce < currentOnChainNonce,
      hasConflict: groupItems.length > 1,
      proposals: groupItems,
    };
  });
}
