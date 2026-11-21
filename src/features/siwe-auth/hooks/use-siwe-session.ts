"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Address } from "viem";
import { useAccount } from "wagmi";

export interface SiweSessionResponse {
  authenticated: boolean;
  address?: Address;
  chainId?: number;
  issuedAt?: string;
}

export const SIWE_SESSION_QUERY_KEY = ["siwe-session"] as const;

async function fetchSiweSession(): Promise<SiweSessionResponse> {
  const res = await fetch("/api/auth/siwe/session", {
    method: "GET",
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) {
    return { authenticated: false };
  }
  return (await res.json()) as SiweSessionResponse;
}

export function useSiweSession() {
  const { address: connectedAddress } = useAccount();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: SIWE_SESSION_QUERY_KEY,
    queryFn: fetchSiweSession,
    staleTime: 30_000,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await fetch("/api/auth/siwe/logout", {
        method: "POST",
        credentials: "include",
      });
    },
    onSuccess: () => {
      queryClient.setQueryData<SiweSessionResponse>(SIWE_SESSION_QUERY_KEY, {
        authenticated: false,
      });
    },
  });

  const sessionAddress = query.data?.address;
  const isAuthenticated =
    Boolean(query.data?.authenticated && sessionAddress) &&
    (!connectedAddress ||
      sessionAddress?.toLowerCase() === connectedAddress.toLowerCase());

  return {
    session: query.data ?? { authenticated: false },
    isAuthenticated,
    isLoading: query.isLoading,
    logout: logoutMutation.mutateAsync,
    isLoggingOut: logoutMutation.isPending,
  };
}
