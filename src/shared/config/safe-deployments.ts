import {
  getCompatibilityFallbackHandlerDeployment,
  getMultiSendCallOnlyDeployment,
  getMultiSendDeployment,
  getSafeL2SingletonDeployment,
  getSafeSingletonDeployment,
} from "@safe-global/safe-deployments";
import { getAddress, type Address } from "viem";

const SAFE_VERSION = "1.4.1";

function resolveNetworkKey(chainId: number): string {
  // Local Anvil fork defaults to Ethereum Mainnet canonical Safe v1.4.1 addresses
  return chainId === 31337 ? "1" : String(chainId);
}

function extractDeploymentAddress(
  deployment: ReturnType<typeof getMultiSendCallOnlyDeployment>,
  networkKey: string
): Address | null {
  if (!deployment) {
    return null;
  }

  const networkEntry = deployment.networkAddresses[networkKey];
  const rawAddress = Array.isArray(networkEntry)
    ? networkEntry[0]
    : (networkEntry ?? deployment.defaultAddress);

  if (!rawAddress) {
    return null;
  }

  try {
    return getAddress(rawAddress);
  } catch {
    return null;
  }
}

export function getCanonicalMultiSendCallOnlyAddress(chainId: number): Address | null {
  const network = resolveNetworkKey(chainId);
  const deployment = getMultiSendCallOnlyDeployment({
    version: SAFE_VERSION,
    network,
  });
  return extractDeploymentAddress(deployment, network);
}

export function getCanonicalMultiSendAddress(chainId: number): Address | null {
  const network = resolveNetworkKey(chainId);
  const deployment = getMultiSendDeployment({
    version: SAFE_VERSION,
    network,
  });
  return extractDeploymentAddress(deployment, network);
}

export function getCanonicalSafeSingletonAddress(chainId: number): Address | null {
  const network = resolveNetworkKey(chainId);
  const l2Deployment = getSafeL2SingletonDeployment({
    version: SAFE_VERSION,
    network,
  });
  const l2Address = extractDeploymentAddress(l2Deployment, network);
  if (l2Address) {
    return l2Address;
  }

  const l1Deployment = getSafeSingletonDeployment({
    version: SAFE_VERSION,
    network,
  });
  return extractDeploymentAddress(l1Deployment, network);
}

export function getCanonicalFallbackHandlerAddress(chainId: number): Address | null {
  const network = resolveNetworkKey(chainId);
  const deployment = getCompatibilityFallbackHandlerDeployment({
    version: SAFE_VERSION,
    network,
  });
  return extractDeploymentAddress(deployment, network);
}

/**
 * Returns true if `target` is a canonical Safe MultiSendCallOnly or MultiSend
 * contract for the given chainId. Used by the DELEGATECALL security firewall.
 */
export function isCanonicalDelegateCallTarget(
  chainId: number,
  target: string
): boolean {
  let normalized: Address;
  try {
    normalized = getAddress(target);
  } catch {
    return false;
  }

  const multiSendCallOnly = getCanonicalMultiSendCallOnlyAddress(chainId);
  const multiSend = getCanonicalMultiSendAddress(chainId);

  return (
    (multiSendCallOnly !== null && multiSendCallOnly === normalized) ||
    (multiSend !== null && multiSend === normalized)
  );
}
