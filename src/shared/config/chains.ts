import { arbitrum, base, foundry, mainnet, sepolia } from "wagmi/chains";
import type { Chain } from "viem";

export const ANVIL_CHAIN: Chain = {
  ...foundry,
  id: 31337,
  name: "Anvil Local Fork",
  nativeCurrency: {
    name: "Ether",
    symbol: "ETH",
    decimals: 18,
  },
  blockExplorers: {
    default: {
      name: "Etherscan",
      url: "https://etherscan.io",
    },
  },
};

export const SUPPORTED_CHAINS = [
  mainnet,
  base,
  arbitrum,
  sepolia,
  ANVIL_CHAIN,
] as const;

export type SupportedChainId = (typeof SUPPORTED_CHAINS)[number]["id"];

export interface ChainMetadata {
  chain: Chain;
  chainId: SupportedChainId;
  shortName: string;
  explorerUrl: string;
  safeTxServiceUrl: string | null;
  isTestnet: boolean;
  isLocal: boolean;
  fallbackRpcUrl: string;
}

export const CHAIN_METADATA: Record<SupportedChainId, ChainMetadata> = {
  1: {
    chain: mainnet,
    chainId: 1,
    shortName: "Ethereum",
    explorerUrl: "https://etherscan.io",
    safeTxServiceUrl: "https://safe-transaction-mainnet.safe.global/api",
    isTestnet: false,
    isLocal: false,
    fallbackRpcUrl: "https://ethereum-rpc.publicnode.com",
  },
  8453: {
    chain: base,
    chainId: 8453,
    shortName: "Base",
    explorerUrl: "https://basescan.org",
    safeTxServiceUrl: "https://safe-transaction-base.safe.global/api",
    isTestnet: false,
    isLocal: false,
    fallbackRpcUrl: "https://mainnet.base.org",
  },
  42161: {
    chain: arbitrum,
    chainId: 42161,
    shortName: "Arbitrum",
    explorerUrl: "https://arbiscan.io",
    safeTxServiceUrl: "https://safe-transaction-arbitrum.safe.global/api",
    isTestnet: false,
    isLocal: false,
    fallbackRpcUrl: "https://arb1.arbitrum.io/rpc",
  },
  11155111: {
    chain: sepolia,
    chainId: 11155111,
    shortName: "Sepolia",
    explorerUrl: "https://sepolia.etherscan.io",
    safeTxServiceUrl: "https://safe-transaction-sepolia.safe.global/api",
    isTestnet: true,
    isLocal: false,
    fallbackRpcUrl: "https://ethereum-sepolia-rpc.publicnode.com",
  },
  31337: {
    chain: ANVIL_CHAIN,
    chainId: 31337,
    shortName: "Anvil Fork",
    explorerUrl: "https://etherscan.io",
    safeTxServiceUrl: null,
    isTestnet: true,
    isLocal: true,
    fallbackRpcUrl: "http://127.0.0.1:8545",
  },
};

export function isSupportedChainId(chainId: number): chainId is SupportedChainId {
  return Object.prototype.hasOwnProperty.call(CHAIN_METADATA, chainId);
}

export function getChainMetadata(chainId: number): ChainMetadata | null {
  if (!isSupportedChainId(chainId)) {
    return null;
  }
  return CHAIN_METADATA[chainId] ?? null;
}

export function getExplorerAddressUrl(chainId: number, address: string): string {
  const meta = getChainMetadata(chainId);
  const baseUrl = meta?.explorerUrl ?? "https://etherscan.io";
  return `${baseUrl}/address/${address}`;
}

export function getExplorerTxUrl(chainId: number, txHash: string): string {
  const meta = getChainMetadata(chainId);
  const baseUrl = meta?.explorerUrl ?? "https://etherscan.io";
  return `${baseUrl}/tx/${txHash}`;
}
