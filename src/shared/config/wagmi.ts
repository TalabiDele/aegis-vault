import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  safeWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { cookieStorage, createConfig, createStorage, http } from "wagmi";
import { SUPPORTED_CHAINS } from "@/shared/config/chains";
import { getPublicEnv } from "@/shared/config/env";

function buildRpcTransports() {
  return {
    [SUPPORTED_CHAINS[0].id]: http(`/api/rpc/${SUPPORTED_CHAINS[0].id}`, { batch: true }),
    [SUPPORTED_CHAINS[1].id]: http(`/api/rpc/${SUPPORTED_CHAINS[1].id}`, { batch: true }),
    [SUPPORTED_CHAINS[2].id]: http(`/api/rpc/${SUPPORTED_CHAINS[2].id}`, { batch: true }),
    [SUPPORTED_CHAINS[3].id]: http(`/api/rpc/${SUPPORTED_CHAINS[3].id}`, { batch: true }),
    [SUPPORTED_CHAINS[4].id]: http(`/api/rpc/${SUPPORTED_CHAINS[4].id}`, { batch: true }),
  };
}

/**
 * Lightweight SSR-safe Wagmi config used solely on the server inside RootLayout
 * to hydrate `cookieToInitialState` without touching browser-only APIs.
 */
export function getServerWagmiConfig() {
  return createConfig({
    chains: SUPPORTED_CHAINS,
    ssr: true,
    storage: createStorage({
      storage: cookieStorage,
    }),
    transports: buildRpcTransports(),
  });
}

/**
 * Client-side Wagmi + RainbowKit config instantiated once inside `useState` in Providers.
 * Uses EIP-6963 multi-injected provider discovery + explicit injectedWallet first so
 * installed browser extensions (MetaMask, Rabby, Phantom, Brave, Coinbase) prompt
 * directly even without a WalletConnect Cloud projectId.
 */
export function createClientWagmiConfig() {
  const publicEnv = getPublicEnv();
  const rawProjectId = publicEnv.NEXT_PUBLIC_WC_PROJECT_ID.trim();
  const hasRealWcProjectId = rawProjectId.length >= 16;
  const projectId = hasRealWcProjectId
    ? rawProjectId
    : "00000000000000000000000000000000";

  const walletGroups = [
    {
      groupName: "Browser Wallets",
      wallets: [
        injectedWallet,
        metaMaskWallet,
        rabbyWallet,
        coinbaseWallet,
        safeWallet,
      ],
    },
    ...(hasRealWcProjectId
      ? [
          {
            groupName: "Mobile & QR",
            wallets: [walletConnectWallet],
          },
        ]
      : []),
  ];

  const connectors = connectorsForWallets(walletGroups, {
    appName: "AegisVault Institutional Treasury",
    projectId,
  });

  return createConfig({
    chains: SUPPORTED_CHAINS,
    connectors,
    multiInjectedProviderDiscovery: true,
    ssr: true,
    storage: createStorage({
      storage: cookieStorage,
    }),
    transports: buildRpcTransports(),
  });
}
