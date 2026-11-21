import { getAddress, zeroAddress, type Address } from "viem";

export interface TrackedTokenConfig {
  address: Address; // zeroAddress represents native ETH
  symbol: string;
  name: string;
  decimals: number;
  isNative: boolean;
  isStablecoin: boolean;
  /** Indicative reference price in integer micro-USD (1_000_000n = $1.00) */
  referencePriceMicroUsd: bigint;
}

export interface KnownProtocolSpender {
  address: Address;
  label: string;
  protocol: string;
}

export const NATIVE_ETH_TOKEN: TrackedTokenConfig = {
  address: zeroAddress,
  symbol: "ETH",
  name: "Ether",
  decimals: 18,
  isNative: true,
  isStablecoin: false,
  referencePriceMicroUsd: 3_200_000_000n, // $3,200.00
};

const MAINNET_TOKENS: TrackedTokenConfig[] = [
  NATIVE_ETH_TOKEN,
  {
    address: getAddress("0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    isNative: false,
    isStablecoin: true,
    referencePriceMicroUsd: 1_000_000n,
  },
  {
    address: getAddress("0xdAC17F958D2ee523a2206206994597C13D831ec7"),
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    isNative: false,
    isStablecoin: true,
    referencePriceMicroUsd: 1_000_000n,
  },
  {
    address: getAddress("0x6B175474E89094C44Da98b954EedeAC495271d0F"),
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    isNative: false,
    isStablecoin: true,
    referencePriceMicroUsd: 1_000_000n,
  },
  {
    address: getAddress("0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2"),
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    isNative: false,
    isStablecoin: false,
    referencePriceMicroUsd: 3_200_000_000n,
  },
  {
    address: getAddress("0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599"),
    symbol: "WBTC",
    name: "Wrapped BTC",
    decimals: 8,
    isNative: false,
    isStablecoin: false,
    referencePriceMicroUsd: 92_000_000_000n,
  },
];

const BASE_TOKENS: TrackedTokenConfig[] = [
  NATIVE_ETH_TOKEN,
  {
    address: getAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    isNative: false,
    isStablecoin: true,
    referencePriceMicroUsd: 1_000_000n,
  },
  {
    address: getAddress("0x50c5725949A6F0c72E6C4a641F24049A917DB0Cb"),
    symbol: "DAI",
    name: "Dai Stablecoin",
    decimals: 18,
    isNative: false,
    isStablecoin: true,
    referencePriceMicroUsd: 1_000_000n,
  },
  {
    address: getAddress("0x4200000000000000000000000000000000000006"),
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    isNative: false,
    isStablecoin: false,
    referencePriceMicroUsd: 3_200_000_000n,
  },
  {
    address: getAddress("0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf"),
    symbol: "cbBTC",
    name: "Coinbase Wrapped BTC",
    decimals: 8,
    isNative: false,
    isStablecoin: false,
    referencePriceMicroUsd: 92_000_000_000n,
  },
];

const ARBITRUM_TOKENS: TrackedTokenConfig[] = [
  NATIVE_ETH_TOKEN,
  {
    address: getAddress("0xaf88d065e77c8cC2239327C5EDb3A432268e5831"),
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    isNative: false,
    isStablecoin: true,
    referencePriceMicroUsd: 1_000_000n,
  },
  {
    address: getAddress("0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"),
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    isNative: false,
    isStablecoin: true,
    referencePriceMicroUsd: 1_000_000n,
  },
  {
    address: getAddress("0x82aF49447D8a07e3bd95BD0d56f35241523fBab1"),
    symbol: "WETH",
    name: "Wrapped Ether",
    decimals: 18,
    isNative: false,
    isStablecoin: false,
    referencePriceMicroUsd: 3_200_000_000n,
  },
  {
    address: getAddress("0x912CE59144191C1204E64559FE8253a0e49E6548"),
    symbol: "ARB",
    name: "Arbitrum",
    decimals: 18,
    isNative: false,
    isStablecoin: false,
    referencePriceMicroUsd: 1_100_000n,
  },
];

const SEPOLIA_TOKENS: TrackedTokenConfig[] = [
  NATIVE_ETH_TOKEN,
  {
    address: getAddress("0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238"),
    symbol: "USDC",
    name: "USD Coin (Sepolia)",
    decimals: 6,
    isNative: false,
    isStablecoin: true,
    referencePriceMicroUsd: 1_000_000n,
  },
  {
    address: getAddress("0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"),
    symbol: "WETH",
    name: "Wrapped Ether (Sepolia)",
    decimals: 18,
    isNative: false,
    isStablecoin: false,
    referencePriceMicroUsd: 3_200_000_000n,
  },
];

export function getTrackedTokensForChain(chainId: number): TrackedTokenConfig[] {
  switch (chainId) {
    case 1:
    case 31337:
      return MAINNET_TOKENS;
    case 8453:
      return BASE_TOKENS;
    case 42161:
      return ARBITRUM_TOKENS;
    case 11155111:
      return SEPOLIA_TOKENS;
    default:
      return BASE_TOKENS;
  }
}

export function getCuratedProtocolSpenders(chainId: number): KnownProtocolSpender[] {
  const permit2: KnownProtocolSpender = {
    address: getAddress("0x000000000022D473030F116dDEE9F6B43aC78BA3"),
    label: "Uniswap Permit2",
    protocol: "Uniswap",
  };

  switch (chainId) {
    case 1:
    case 31337:
      return [
        permit2,
        {
          address: getAddress("0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"),
          label: "Uniswap V3 SwapRouter02",
          protocol: "Uniswap",
        },
        {
          address: getAddress("0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2"),
          label: "Aave V3 Pool",
          protocol: "Aave",
        },
        {
          address: getAddress("0x111111125421cA6dc452d289314280a0f8842A65"),
          label: "1inch Aggregation Router v6",
          protocol: "1inch",
        },
        {
          address: getAddress("0xC92E8bdf79f0507f65a392b0ab4667716BFE0110"),
          label: "CoW Protocol VaultRelayer",
          protocol: "CoW Swap",
        },
      ];
    case 8453:
      return [
        permit2,
        {
          address: getAddress("0x2626664c2603336E57B271c5C0b26F421741e481"),
          label: "Uniswap V3 SwapRouter02 (Base)",
          protocol: "Uniswap",
        },
        {
          address: getAddress("0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"),
          label: "Aave V3 Pool (Base)",
          protocol: "Aave",
        },
        {
          address: getAddress("0x111111125421cA6dc452d289314280a0f8842A65"),
          label: "1inch Aggregation Router v6",
          protocol: "1inch",
        },
      ];
    case 42161:
      return [
        permit2,
        {
          address: getAddress("0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45"),
          label: "Uniswap V3 SwapRouter02 (Arbitrum)",
          protocol: "Uniswap",
        },
        {
          address: getAddress("0x794a61358D6845594F94dc1DB02A252b5b4814aD"),
          label: "Aave V3 Pool (Arbitrum)",
          protocol: "Aave",
        },
      ];
    default:
      return [permit2];
  }
}
