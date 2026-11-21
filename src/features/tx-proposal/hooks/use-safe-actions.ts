"use client";

import type { Eip1193Provider } from "@safe-global/protocol-kit";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { getAddress, type Address, type Hex } from "viem";
import { useAccount, useChainId } from "wagmi";
import type { TxLifecycleState } from "@/entities/safe/types";
import {
  createSafeApiKit,
  initSafeProtocolKit,
  toProtocolKitTransactions,
  type BatchCallPayload,
} from "../api/safe-client";

function isUserRejectedError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  const msg = err.message.toLowerCase();
  return (
    msg.includes("user rejected") ||
    msg.includes("user denied") ||
    msg.includes("rejected the request") ||
    msg.includes("action_rejected") ||
    msg.includes("4001")
  );
}

async function resolveEip1193Provider(
  connector: ReturnType<typeof useAccount>["connector"]
): Promise<Eip1193Provider> {
  if (connector && typeof connector.getProvider === "function") {
    const provider = await connector.getProvider();
    if (provider) {
      return provider as Eip1193Provider;
    }
  }
  if (typeof window !== "undefined" && "ethereum" in window) {
    return (window as unknown as { ethereum: Eip1193Provider }).ethereum;
  }
  throw new Error("No EIP-1193 wallet provider available.");
}

export interface ProposeSafeTxInput {
  safeAddress: Address;
  chainId: number;
  calls: ReadonlyArray<BatchCallPayload>;
  nonce?: number;
  title?: string;
  description?: string;
  invoiceRef?: string;
  category?: "PAYROLL" | "VENDOR" | "DEFI" | "GOVERNANCE" | "REVOKE" | "OPERATIONS";
}

export function useSafeTxActions() {
  const { address: signerAddress, connector } = useAccount();
  const walletChainId = useChainId();
  const queryClient = useQueryClient();

  const [lifecycle, setLifecycle] = useState<TxLifecycleState>({
    status: "idle",
    message: null,
  });

  const resetLifecycle = useCallback(() => {
    setLifecycle({ status: "idle", message: null });
  }, []);

  const proposeTransaction = useCallback(
    async (input: ProposeSafeTxInput): Promise<{ safeTxHash: Hex } | null> => {
      if (!signerAddress) {
        setLifecycle({
          status: "reverted",
          message: "Connect an owner wallet before proposing a Safe transaction.",
        });
        return null;
      }

      if (walletChainId !== input.chainId) {
        setLifecycle({
          status: "wrong_network",
          message: `Switch your wallet network to chain ${input.chainId} before signing.`,
        });
        return null;
      }

      try {
        setLifecycle({
          status: "awaiting_wallet_signature",
          message: "Awaiting EIP-712 Safe transaction signature in your wallet…",
        });

        const provider = await resolveEip1193Provider(connector);
        const protocolKit = await initSafeProtocolKit({
          provider,
          signer: signerAddress,
          safeAddress: input.safeAddress,
        });

        const safeTransaction = await protocolKit.createTransaction({
          transactions: toProtocolKitTransactions(input.calls),
          onlyCalls: true, // Enforce MultiSendCallOnly (DELEGATECALL firewall)
          options: input.nonce !== undefined ? { nonce: input.nonce } : undefined,
        });

        const safeTxHash = (await protocolKit.getTransactionHash(
          safeTransaction
        )) as Hex;
        const senderSignature = await protocolKit.signHash(safeTxHash);

        const apiKit = createSafeApiKit(input.chainId);
        if (apiKit) {
          await apiKit.proposeTransaction({
            safeAddress: getAddress(input.safeAddress),
            safeTransactionData: safeTransaction.data,
            safeTxHash,
            senderAddress: getAddress(signerAddress),
            senderSignature: senderSignature.data,
          });
        }

        // Persist optional off-chain metadata if user has an active SIWE session
        if (input.title) {
          await fetch("/api/proposals", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              safeTxHash,
              safeAddress: getAddress(input.safeAddress),
              chainId: input.chainId,
              nonce: Number(safeTransaction.data.nonce),
              title: input.title,
              description: input.description,
              invoiceRef: input.invoiceRef,
              category: input.category ?? "OPERATIONS",
            }),
          }).catch(() => {
            // Non-blocking: on-chain/Safe proposal already succeeded
          });
        }

        setLifecycle({
          status: "proposed_offchain",
          message: "Proposal signed and queued in the Safe Transaction Service.",
          safeTxHash,
        });

        await queryClient.invalidateQueries({ queryKey: ["safe-pending-txs"] });
        return { safeTxHash };
      } catch (err) {
        if (isUserRejectedError(err)) {
          setLifecycle({
            status: "user_rejected",
            message:
              "Wallet signature was cancelled. Your form inputs and Batch Cart have been preserved.",
          });
          return null;
        }
        setLifecycle({
          status: "reverted",
          message:
            err instanceof Error
              ? err.message
              : "Failed to propose Safe transaction.",
        });
        return null;
      }
    },
    [connector, queryClient, signerAddress, walletChainId]
  );

  const confirmTransaction = useCallback(
    async (params: {
      safeAddress: Address;
      chainId: number;
      safeTxHash: Hex;
    }): Promise<boolean> => {
      if (!signerAddress) {
        setLifecycle({
          status: "reverted",
          message: "Connect an owner wallet to co-sign this proposal.",
        });
        return false;
      }

      if (walletChainId !== params.chainId) {
        setLifecycle({
          status: "wrong_network",
          message: `Switch wallet network to chain ${params.chainId} to co-sign.`,
        });
        return false;
      }

      try {
        setLifecycle({
          status: "awaiting_wallet_signature",
          message: "Awaiting EIP-712 co-signer confirmation…",
          safeTxHash: params.safeTxHash,
        });

        const provider = await resolveEip1193Provider(connector);
        const protocolKit = await initSafeProtocolKit({
          provider,
          signer: signerAddress,
          safeAddress: params.safeAddress,
        });

        const signature = await protocolKit.signHash(params.safeTxHash);
        const apiKit = createSafeApiKit(params.chainId);
        if (apiKit) {
          await apiKit.confirmTransaction(params.safeTxHash, signature.data);
        }

        setLifecycle({
          status: "proposed_offchain",
          message: "Co-signature recorded in Safe Transaction Service.",
          safeTxHash: params.safeTxHash,
        });

        await queryClient.invalidateQueries({ queryKey: ["safe-pending-txs"] });
        await queryClient.invalidateQueries({ queryKey: ["safe-tx-detail"] });
        return true;
      } catch (err) {
        if (isUserRejectedError(err)) {
          setLifecycle({
            status: "user_rejected",
            message: "Co-signature cancelled by user.",
            safeTxHash: params.safeTxHash,
          });
          return false;
        }
        setLifecycle({
          status: "reverted",
          message:
            err instanceof Error ? err.message : "Failed to confirm Safe transaction.",
        });
        return false;
      }
    },
    [connector, queryClient, signerAddress, walletChainId]
  );

  const executeTransaction = useCallback(
    async (params: {
      safeAddress: Address;
      chainId: number;
      safeTxHash: Hex;
    }): Promise<{ txHash: Hex } | null> => {
      if (!signerAddress) {
        setLifecycle({
          status: "reverted",
          message: "Connect a wallet to execute this Safe transaction on-chain.",
        });
        return null;
      }

      if (walletChainId !== params.chainId) {
        setLifecycle({
          status: "wrong_network",
          message: `Switch wallet network to chain ${params.chainId} to execute.`,
        });
        return null;
      }

      try {
        setLifecycle({
          status: "awaiting_wallet_signature",
          message: "Confirm on-chain execution transaction in your wallet…",
          safeTxHash: params.safeTxHash,
        });

        const apiKit = createSafeApiKit(params.chainId);
        if (!apiKit) {
          throw new Error(
            "Safe Transaction Service is unavailable for this chain; execute directly via local Anvil script."
          );
        }

        const safeTxResponse = await apiKit.getTransaction(params.safeTxHash);
        const provider = await resolveEip1193Provider(connector);
        const protocolKit = await initSafeProtocolKit({
          provider,
          signer: signerAddress,
          safeAddress: params.safeAddress,
        });

        const txResponse = await protocolKit.executeTransaction(safeTxResponse);
        const txHash = txResponse.hash as Hex;

        setLifecycle({
          status: "pending_onchain",
          message: "Transaction broadcast to network. Waiting for block confirmation…",
          safeTxHash: params.safeTxHash,
          txHash,
        });

        const receiptPromise = (
          txResponse.transactionResponse as { wait?: () => Promise<unknown> } | undefined
        )?.wait;
        if (typeof receiptPromise === "function") {
          await receiptPromise();
        }

        setLifecycle({
          status: "confirmed",
          message: "Safe transaction executed and confirmed on-chain.",
          safeTxHash: params.safeTxHash,
          txHash,
        });

        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["safe-pending-txs"] }),
          queryClient.invalidateQueries({ queryKey: ["safe-executed-txs"] }),
          queryClient.invalidateQueries({ queryKey: ["safe-info"] }),
          queryClient.invalidateQueries({ queryKey: ["safe-balances"] }),
        ]);

        return { txHash };
      } catch (err) {
        if (isUserRejectedError(err)) {
          setLifecycle({
            status: "user_rejected",
            message: "On-chain execution cancelled by user.",
            safeTxHash: params.safeTxHash,
          });
          return null;
        }
        setLifecycle({
          status: "reverted",
          message:
            err instanceof Error ? err.message : "On-chain Safe execution reverted.",
        });
        return null;
      }
    },
    [connector, queryClient, signerAddress, walletChainId]
  );

  return {
    lifecycle,
    resetLifecycle,
    proposeTransaction,
    confirmTransaction,
    executeTransaction,
  };
}
