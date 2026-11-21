"use client";

import { useQuery } from "@tanstack/react-query";
import { getAddress, zeroAddress, type Address, type Hex } from "viem";
import { multicall } from "viem/actions";
import { usePublicClient } from "wagmi";
import { safeAbi } from "@/shared/web3/abis";
import type { SafeInfo } from "./types";

// EIP-1967 / Safe v1.4.1 canonical storage slots for FallbackHandler and Guard
const FALLBACK_HANDLER_SLOT =
  0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5n;
const GUARD_STORAGE_SLOT =
  0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8n;

function extractAddressFromStorageWord(raw: Hex | undefined): Address | null {
  if (!raw || raw.length < 42) {
    return null;
  }
  const tail = `0x${raw.slice(-40)}`;
  try {
    const parsed = getAddress(tail);
    return parsed === zeroAddress ? null : parsed;
  } catch {
    return null;
  }
}

export function useSafeInfo(safeAddress: Address, chainId: number) {
  const publicClient = usePublicClient({ chainId });

  return useQuery({
    queryKey: ["safe-info", chainId, safeAddress.toLowerCase()],
    enabled: Boolean(publicClient && safeAddress),
    staleTime: 15_000,
    queryFn: async (): Promise<SafeInfo> => {
      if (!publicClient) {
        throw new Error("RPC client unavailable for active chain");
      }

      const normalized = getAddress(safeAddress);

      const results = await multicall(publicClient, {
        allowFailure: true,
        contracts: [
          {
            address: normalized,
            abi: safeAbi,
            functionName: "getOwners",
          },
          {
            address: normalized,
            abi: safeAbi,
            functionName: "getThreshold",
          },
          {
            address: normalized,
            abi: safeAbi,
            functionName: "nonce",
          },
          {
            address: normalized,
            abi: safeAbi,
            functionName: "VERSION",
          },
          {
            address: normalized,
            abi: safeAbi,
            functionName: "getStorageAt",
            args: [FALLBACK_HANDLER_SLOT, 1n],
          },
          {
            address: normalized,
            abi: safeAbi,
            functionName: "getStorageAt",
            args: [GUARD_STORAGE_SLOT, 1n],
          },
        ],
      });

      const ownersResult = results[0];
      const thresholdResult = results[1];
      const nonceResult = results[2];
      const versionResult = results[3];
      const fallbackResult = results[4];
      const guardResult = results[5];

      const owners =
        ownersResult?.status === "success"
          ? ownersResult.result.map((o) => getAddress(o))
          : [];
      const threshold =
        thresholdResult?.status === "success" ? Number(thresholdResult.result) : 0;
      const nonce =
        nonceResult?.status === "success" ? Number(nonceResult.result) : 0;
      const version =
        versionResult?.status === "success" ? versionResult.result : "1.4.1";

      const fallbackHandler =
        fallbackResult?.status === "success"
          ? extractAddressFromStorageWord(fallbackResult.result)
          : null;
      const guardAddress =
        guardResult?.status === "success"
          ? extractAddressFromStorageWord(guardResult.result)
          : null;

      return {
        address: normalized,
        chainId,
        version,
        owners,
        threshold,
        nonce,
        fallbackHandler,
        guardAddress,
      };
    },
  });
}
