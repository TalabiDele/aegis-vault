"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSiweMessage } from "viem/siwe";
import { useAccount, useChainId, useSignMessage } from "wagmi";
import {
  SIWE_SESSION_QUERY_KEY,
  type SiweSessionResponse,
} from "./use-siwe-session";

export function useSiweSignIn() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { signMessageAsync } = useSignMessage();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (): Promise<SiweSessionResponse> => {
      if (!address) {
        throw new Error("Connect a signer wallet before authenticating.");
      }

      const nonceRes = await fetch("/api/auth/siwe/nonce", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      });
      if (!nonceRes.ok) {
        throw new Error("Unable to request SIWE nonce from server.");
      }

      const noncePayload = (await nonceRes.json()) as { nonce?: string };
      if (!noncePayload.nonce) {
        throw new Error("Server returned an empty SIWE nonce.");
      }

      const message = createSiweMessage({
        address,
        chainId,
        domain: window.location.host,
        nonce: noncePayload.nonce,
        statement:
          "Sign in to AegisVault Institutional Treasury to authenticate off-chain metadata edits, address book management, and audit comments.",
        uri: window.location.origin,
        version: "1",
      });

      const signature = await signMessageAsync({ message });

      const verifyRes = await fetch("/api/auth/siwe/verify", {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message, signature }),
      });

      const verifyPayload = (await verifyRes.json()) as SiweSessionResponse & {
        error?: string;
      };

      if (!verifyRes.ok || !verifyPayload.authenticated) {
        throw new Error(verifyPayload.error ?? "SIWE verification failed.");
      }

      return verifyPayload;
    },
    onSuccess: (data) => {
      queryClient.setQueryData<SiweSessionResponse>(SIWE_SESSION_QUERY_KEY, data);
    },
  });

  return {
    signIn: mutation.mutateAsync,
    isSigningIn: mutation.isPending,
    error: mutation.error instanceof Error ? mutation.error.message : null,
    resetError: mutation.reset,
  };
}
