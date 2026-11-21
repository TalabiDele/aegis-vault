import SafeApiKit from "@safe-global/api-kit";
import Safe, { type Eip1193Provider } from "@safe-global/protocol-kit";
import type { MetaTransactionData as SafeMetaTx } from "@safe-global/types-kit";
import { getAddress, type Address, type Hex } from "viem";
import { getChainMetadata } from "@/shared/config/chains";
import { getCanonicalMultiSendCallOnlyAddress } from "@/shared/config/safe-deployments";
import { encodeMultiSendCallData } from "@/shared/web3/multisend";

export function createSafeApiKit(chainId: number): SafeApiKit | null {
  const meta = getChainMetadata(chainId);
  if (!meta || !meta.safeTxServiceUrl) {
    return null;
  }

  return new SafeApiKit({
    chainId: BigInt(chainId),
    txServiceUrl: meta.safeTxServiceUrl,
  });
}

export async function initSafeProtocolKit(params: {
  provider: Eip1193Provider;
  signer: Address;
  safeAddress: Address;
}): Promise<Safe> {
  return Safe.init({
    provider: params.provider,
    signer: getAddress(params.signer),
    safeAddress: getAddress(params.safeAddress),
  });
}

export interface BatchCallPayload {
  to: Address;
  value: string;
  data: Hex;
}

/**
 * Builds the canonical simulation/Safe target payload for 1 or N calls.
 * - For 1 call: direct CALL (`operation: 0`)
 * - For 2+ calls: `MultiSendCallOnly` (`operation: 1`, strictly `onlyCalls: true`)
 */
export function buildSafeBatchPayload(
  chainId: number,
  calls: ReadonlyArray<BatchCallPayload>
): {
  to: Address;
  value: string;
  data: Hex;
  operation: 0 | 1;
} {
  if (calls.length === 0) {
    throw new Error("Cannot build Safe transaction from an empty batch.");
  }

  if (calls.length === 1) {
    const single = calls[0]!;
    return {
      to: getAddress(single.to),
      value: single.value,
      data: single.data,
      operation: 0,
    };
  }

  const multiSendCallOnly = getCanonicalMultiSendCallOnlyAddress(chainId);
  if (!multiSendCallOnly) {
    throw new Error(
      `Canonical Safe v1.4.1 MultiSendCallOnly deployment not found for chain ${chainId}.`
    );
  }

  const encoded = encodeMultiSendCallData(
    calls.map((c) => ({
      to: getAddress(c.to),
      value: BigInt(c.value),
      data: c.data,
    }))
  );

  return {
    to: multiSendCallOnly,
    value: "0",
    data: encoded,
    operation: 1,
  };
}

/**
 * Converts batch items into Protocol Kit MetaTransactionData array with `operation: 0` (CALL).
 */
export function toProtocolKitTransactions(
  calls: ReadonlyArray<BatchCallPayload>
): SafeMetaTx[] {
  return calls.map((c) => ({
    to: getAddress(c.to),
    value: c.value,
    data: c.data,
    operation: 0,
  }));
}
