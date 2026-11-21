"use client";

import { useQuery } from "@tanstack/react-query";
import { getAddress, isHex, type Address, type Hex } from "viem";
import type {
  ProposalMetaItem,
  SafeMultisigTransaction,
} from "@/entities/safe/types";
import { analyzeTransactionRisk } from "@/shared/web3/security";
import { createSafeApiKit } from "../api/safe-client";

interface RawSafeServiceTx {
  safeTxHash: string;
  safe: string;
  to: string;
  value: string;
  data?: string | null;
  operation: number;
  nonce: number | string;
  confirmationsRequired: number;
  confirmations?: Array<{
    owner: string;
    submissionDate: string;
    signature: string;
  }>;
  isExecuted: boolean;
  isSuccessful?: boolean | null;
  transactionHash?: string | null;
  submissionDate: string;
  executionDate?: string | null;
}

async function fetchProposalMetadataMap(
  safeAddress: Address,
  chainId: number
): Promise<Map<string, ProposalMetaItem>> {
  const map = new Map<string, ProposalMetaItem>();
  try {
    const res = await fetch(
      `/api/proposals?safeAddress=${encodeURIComponent(safeAddress)}&chainId=${chainId}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      return map;
    }
    const payload = (await res.json()) as { proposals?: ProposalMetaItem[] };
    for (const item of payload.proposals ?? []) {
      map.set(item.safeTxHash.toLowerCase(), item);
    }
  } catch {
    // Graceful degradation if DB is offline
  }
  return map;
}

function normalizeSafeTx(
  raw: RawSafeServiceTx,
  chainId: number,
  metaMap: Map<string, ProposalMetaItem>
): SafeMultisigTransaction {
  const safe = getAddress(raw.safe);
  const to = getAddress(raw.to);
  const data: Hex = raw.data && isHex(raw.data) ? raw.data : "0x";
  const operation: 0 | 1 = raw.operation === 1 ? 1 : 0;
  const valueStr = raw.value || "0";

  const { decoded, risks } = analyzeTransactionRisk({
    chainId,
    safeAddress: safe,
    to,
    value: BigInt(valueStr),
    data,
    operation,
  });

  const safeTxHash = raw.safeTxHash as Hex;

  return {
    safeTxHash,
    safe,
    to,
    value: valueStr,
    data,
    operation,
    nonce: Number(raw.nonce),
    confirmationsRequired: raw.confirmationsRequired,
    confirmations: (raw.confirmations ?? []).map((c) => ({
      owner: getAddress(c.owner),
      submissionDate: c.submissionDate,
      signature: (isHex(c.signature) ? c.signature : "0x") as Hex,
    })),
    isExecuted: Boolean(raw.isExecuted),
    isSuccessful: raw.isSuccessful ?? null,
    transactionHash:
      raw.transactionHash && isHex(raw.transactionHash)
        ? (raw.transactionHash as Hex)
        : null,
    submissionDate: raw.submissionDate,
    executionDate: raw.executionDate ?? null,
    decoded,
    risks,
    meta: metaMap.get(safeTxHash.toLowerCase()) ?? null,
  };
}

export function usePendingSafeTransactions(
  safeAddress: Address,
  chainId: number,
  currentNonce?: number
) {
  return useQuery({
    queryKey: ["safe-pending-txs", chainId, safeAddress.toLowerCase(), currentNonce ?? "any"],
    staleTime: 15_000,
    queryFn: async (): Promise<SafeMultisigTransaction[]> => {
      const normalized = getAddress(safeAddress);
      const apiKit = createSafeApiKit(chainId);
      const metaMap = await fetchProposalMetadataMap(normalized, chainId);

      if (!apiKit) {
        return [];
      }

      try {
        const response = await apiKit.getPendingTransactions(
          normalized,
          currentNonce !== undefined ? { currentNonce } : undefined
        );
        const results = (response.results ?? []) as unknown as RawSafeServiceTx[];
        return results.map((raw) => normalizeSafeTx(raw, chainId, metaMap));
      } catch {
        return [];
      }
    },
  });
}

export function useExecutedSafeTransactions(safeAddress: Address, chainId: number) {
  return useQuery({
    queryKey: ["safe-executed-txs", chainId, safeAddress.toLowerCase()],
    staleTime: 15_000,
    queryFn: async (): Promise<SafeMultisigTransaction[]> => {
      const normalized = getAddress(safeAddress);
      const apiKit = createSafeApiKit(chainId);
      const metaMap = await fetchProposalMetadataMap(normalized, chainId);

      if (!apiKit) {
        return [];
      }

      try {
        const response = await apiKit.getMultisigTransactions(normalized, {
          executed: true,
          limit: 25,
        });
        const results = (response.results ?? []) as unknown as RawSafeServiceTx[];
        return results.map((raw) => normalizeSafeTx(raw, chainId, metaMap));
      } catch {
        return [];
      }
    },
  });
}

export function useSafeTransactionDetail(
  safeTxHash: Hex,
  safeAddress: Address,
  chainId: number
) {
  return useQuery({
    queryKey: ["safe-tx-detail", chainId, safeTxHash.toLowerCase()],
    enabled: Boolean(safeTxHash),
    staleTime: 15_000,
    queryFn: async (): Promise<SafeMultisigTransaction | null> => {
      const normalized = getAddress(safeAddress);
      const apiKit = createSafeApiKit(chainId);
      const metaMap = await fetchProposalMetadataMap(normalized, chainId);

      if (!apiKit) {
        return null;
      }

      try {
        const raw = (await apiKit.getTransaction(
          safeTxHash
        )) as unknown as RawSafeServiceTx;
        return normalizeSafeTx(raw, chainId, metaMap);
      } catch {
        return null;
      }
    },
  });
}
