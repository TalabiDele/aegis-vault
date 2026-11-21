"use client";

import { useQuery } from "@tanstack/react-query";
import { getAddress, type Address } from "viem";
import { getBalance, multicall } from "viem/actions";
import { usePublicClient } from "wagmi";
import { getTrackedTokensForChain } from "@/shared/config/tokens";
import { erc20Abi } from "@/shared/web3/abis";
import { calculateShareBps, tokenAmountToUsdCents } from "@/shared/web3/bigint";
import type { SafeTokenBalance } from "./types";

export interface SafeBalancesSummary {
  tokens: SafeTokenBalance[];
  totalUsdCents: bigint;
  stablecoinUsdCents: bigint;
  stablecoinRatioBps: number;
}

export function useSafeBalances(safeAddress: Address, chainId: number) {
  const publicClient = usePublicClient({ chainId });

  return useQuery({
    queryKey: ["safe-balances", chainId, safeAddress.toLowerCase()],
    enabled: Boolean(publicClient && safeAddress),
    staleTime: 15_000,
    queryFn: async (): Promise<SafeBalancesSummary> => {
      if (!publicClient) {
        throw new Error("RPC client unavailable for active chain");
      }

      const normalizedSafe = getAddress(safeAddress);
      const tracked = getTrackedTokensForChain(chainId);
      const erc20Tokens = tracked.filter((t) => !t.isNative);
      const nativeConfig = tracked.find((t) => t.isNative);

      // Single multicall batch for all ERC-20 balanceOf, decimals, symbol + parallel native ETH getBalance
      const [nativeBalance, erc20Results] = await Promise.all([
        getBalance(publicClient, { address: normalizedSafe }).catch(() => 0n),
        erc20Tokens.length > 0
          ? multicall(publicClient, {
              allowFailure: true,
              contracts: erc20Tokens.flatMap((token) => [
                {
                  address: token.address,
                  abi: erc20Abi,
                  functionName: "balanceOf" as const,
                  args: [normalizedSafe] as const,
                },
                {
                  address: token.address,
                  abi: erc20Abi,
                  functionName: "decimals" as const,
                },
                {
                  address: token.address,
                  abi: erc20Abi,
                  functionName: "symbol" as const,
                },
              ]),
            })
          : Promise.resolve([]),
      ]);

      const rawList: Array<Omit<SafeTokenBalance, "allocationBps">> = [];

      if (nativeConfig) {
        const valueUsdCents = tokenAmountToUsdCents(
          nativeBalance,
          nativeConfig.decimals,
          nativeConfig.referencePriceMicroUsd
        );
        rawList.push({
          address: nativeConfig.address,
          symbol: nativeConfig.symbol,
          name: nativeConfig.name,
          decimals: nativeConfig.decimals,
          isNative: true,
          isStablecoin: false,
          balance: nativeBalance,
          priceMicroUsd: nativeConfig.referencePriceMicroUsd,
          valueUsdCents,
        });
      }

      for (let i = 0; i < erc20Tokens.length; i++) {
        const token = erc20Tokens[i];
        if (!token) continue;

        const balRes = erc20Results[i * 3];
        const decRes = erc20Results[i * 3 + 1];
        const symRes = erc20Results[i * 3 + 2];

        const balance =
          balRes?.status === "success" && typeof balRes.result === "bigint"
            ? balRes.result
            : 0n;
        const decimals =
          decRes?.status === "success" && typeof decRes.result === "number"
            ? decRes.result
            : token.decimals;
        const symbol =
          symRes?.status === "success" && typeof symRes.result === "string"
            ? symRes.result
            : token.symbol;

        const valueUsdCents = tokenAmountToUsdCents(
          balance,
          decimals,
          token.referencePriceMicroUsd
        );

        rawList.push({
          address: token.address,
          symbol,
          name: token.name,
          decimals,
          isNative: false,
          isStablecoin: token.isStablecoin,
          balance,
          priceMicroUsd: token.referencePriceMicroUsd,
          valueUsdCents,
        });
      }

      const totalUsdCents = rawList.reduce(
        (acc, item) => acc + item.valueUsdCents,
        0n
      );
      const stablecoinUsdCents = rawList
        .filter((item) => item.isStablecoin)
        .reduce((acc, item) => acc + item.valueUsdCents, 0n);

      const tokens: SafeTokenBalance[] = rawList
        .map((item) => ({
          ...item,
          allocationBps: calculateShareBps(item.valueUsdCents, totalUsdCents),
        }))
        .sort((a, b) =>
          b.valueUsdCents > a.valueUsdCents
            ? 1
            : b.valueUsdCents < a.valueUsdCents
              ? -1
              : 0
        );

      return {
        tokens,
        totalUsdCents,
        stablecoinUsdCents,
        stablecoinRatioBps: calculateShareBps(stablecoinUsdCents, totalUsdCents),
      };
    },
  });
}
