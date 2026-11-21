"use client";

import { useQuery } from "@tanstack/react-query";
import { getAddress, type Address } from "viem";
import { multicall } from "viem/actions";
import { usePublicClient } from "wagmi";
import {
  getCuratedProtocolSpenders,
  getTrackedTokensForChain,
} from "@/shared/config/tokens";
import { erc20Abi } from "@/shared/web3/abis";
import { isUnlimitedAllowance } from "@/shared/web3/bigint";

export type AllowanceRiskLevel = "CRITICAL" | "ELEVATED" | "LOW";

export interface SafeAllowanceItem {
  id: string;
  tokenAddress: Address;
  tokenSymbol: string;
  tokenDecimals: number;
  spenderAddress: Address;
  spenderLabel: string | null;
  allowance: bigint;
  isUnlimited: boolean;
  riskLevel: AllowanceRiskLevel;
  source: "ponder" | "curated";
}

interface DiscoveredPair {
  tokenAddress: Address;
  tokenSymbol: string;
  tokenDecimals: number;
  spenderAddress: Address;
  spenderLabel: string | null;
  source: "ponder" | "curated";
}

async function fetchIndexedApprovalPairs(
  safeAddress: Address,
  chainId: number
): Promise<Array<{ token: Address; spender: Address }>> {
  try {
    const res = await fetch(
      `/api/indexer/allowances?safeAddress=${encodeURIComponent(safeAddress)}&chainId=${chainId}`,
      { cache: "no-store" }
    );
    if (!res.ok) {
      return [];
    }
    const data = (await res.json()) as {
      pairs?: Array<{ token: string; spender: string }>;
    };
    return (data.pairs ?? []).map((p) => ({
      token: getAddress(p.token),
      spender: getAddress(p.spender),
    }));
  } catch {
    return [];
  }
}

export function useSafeAllowances(safeAddress: Address, chainId: number) {
  const publicClient = usePublicClient({ chainId });

  return useQuery({
    queryKey: ["safe-allowances", chainId, safeAddress.toLowerCase()],
    enabled: Boolean(publicClient && safeAddress),
    staleTime: 15_000,
    queryFn: async (): Promise<SafeAllowanceItem[]> => {
      if (!publicClient) {
        return [];
      }

      const normalizedSafe = getAddress(safeAddress);
      const trackedErc20s = getTrackedTokensForChain(chainId).filter(
        (t) => !t.isNative
      );
      const curatedSpenders = getCuratedProtocolSpenders(chainId);

      // Merge Ponder-discovered pairs with curated protocol registry
      const pairMap = new Map<string, DiscoveredPair>();

      for (const token of trackedErc20s) {
        for (const spender of curatedSpenders) {
          const key = `${token.address.toLowerCase()}:${spender.address.toLowerCase()}`;
          pairMap.set(key, {
            tokenAddress: token.address,
            tokenSymbol: token.symbol,
            tokenDecimals: token.decimals,
            spenderAddress: spender.address,
            spenderLabel: spender.label,
            source: "curated",
          });
        }
      }

      const indexedPairs = await fetchIndexedApprovalPairs(normalizedSafe, chainId);
      for (const pair of indexedPairs) {
        const key = `${pair.token.toLowerCase()}:${pair.spender.toLowerCase()}`;
        if (!pairMap.has(key)) {
          const knownToken = trackedErc20s.find(
            (t) => t.address.toLowerCase() === pair.token.toLowerCase()
          );
          const knownSpender = curatedSpenders.find(
            (s) => s.address.toLowerCase() === pair.spender.toLowerCase()
          );
          pairMap.set(key, {
            tokenAddress: pair.token,
            tokenSymbol: knownToken?.symbol ?? "ERC20",
            tokenDecimals: knownToken?.decimals ?? 18,
            spenderAddress: pair.spender,
            spenderLabel: knownSpender?.label ?? null,
            source: "ponder",
          });
        }
      }

      const pairs = Array.from(pairMap.values());
      if (pairs.length === 0) {
        return [];
      }

      // Single Multicall batch for all live ERC-20 allowances
      const results = await multicall(publicClient, {
        allowFailure: true,
        contracts: pairs.map((p) => ({
          address: p.tokenAddress,
          abi: erc20Abi,
          functionName: "allowance" as const,
          args: [normalizedSafe, p.spenderAddress] as const,
        })),
      });

      const activeAllowances: SafeAllowanceItem[] = [];

      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        const res = results[i];
        if (!pair || !res || res.status !== "success") {
          continue;
        }
        const allowance = res.result;
        if (allowance <= 0n) {
          continue;
        }

        const unlimited = isUnlimitedAllowance(allowance);
        const riskLevel: AllowanceRiskLevel = unlimited
          ? "CRITICAL"
          : pair.spenderLabel
            ? "LOW"
            : "ELEVATED";

        activeAllowances.push({
          id: `${pair.tokenAddress}:${pair.spenderAddress}`,
          tokenAddress: pair.tokenAddress,
          tokenSymbol: pair.tokenSymbol,
          tokenDecimals: pair.tokenDecimals,
          spenderAddress: pair.spenderAddress,
          spenderLabel: pair.spenderLabel,
          allowance,
          isUnlimited: unlimited,
          riskLevel,
          source: pair.source,
        });
      }

      return activeAllowances.sort((a, b) => {
        if (a.isUnlimited !== b.isUnlimited) {
          return a.isUnlimited ? -1 : 1;
        }
        return b.allowance > a.allowance ? 1 : -1;
      });
    },
  });
}
