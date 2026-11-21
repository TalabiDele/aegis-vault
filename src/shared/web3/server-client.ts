import { createPublicClient, http, type PublicClient } from "viem";
import { getChainMetadata } from "@/shared/config/chains";
import { getRpcUrl } from "@/shared/config/env";

const clientCache = new Map<number, PublicClient>();

/**
 * Returns a server-only Viem PublicClient configured with the chain's upstream RPC URL.
 * Never import this module from Client Components.
 */
export function getServerPublicClient(chainId: number): PublicClient {
  const cached = clientCache.get(chainId);
  if (cached) {
    return cached;
  }

  const meta = getChainMetadata(chainId);
  if (!meta) {
    throw new Error(`Unsupported chainId: ${chainId}`);
  }

  const rpcUrl = getRpcUrl(chainId) ?? meta.fallbackRpcUrl;
  const client = createPublicClient({
    chain: meta.chain,
    transport: http(rpcUrl, {
      batch: true,
      retryCount: 2,
      timeout: 15_000,
    }),
  });

  clientCache.set(chainId, client);
  return client;
}
