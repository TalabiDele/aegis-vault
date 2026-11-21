"use client";

import "@rainbow-me/rainbowkit/styles.css";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider, type State } from "wagmi";
import { createClientWagmiConfig } from "@/shared/config/wagmi";
import { TooltipProvider } from "@/shared/ui/tooltip";

interface ProvidersProps {
  children: ReactNode;
  initialState?: State;
}

const institutionalRainbowTheme = darkTheme({
  accentColor: "#10B981",
  accentColorForeground: "#041510",
  borderRadius: "small",
  fontStack: "system",
  overlayBlur: "none",
});

export function Providers({ children, initialState }: ProvidersProps) {
  const [wagmiConfig] = useState(() => createClientWagmiConfig());
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: false,
            retry: 1,
          },
        },
      })
  );

  return (
    <WagmiProvider config={wagmiConfig} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={institutionalRainbowTheme}
          modalSize="compact"
        >
          <TooltipProvider>{children}</TooltipProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
