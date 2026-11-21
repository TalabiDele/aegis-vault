"use client";

import {
  AlertTriangle,
  ArrowUpRight,
  Ban,
  CheckCircle2,
  Loader2,
  Play,
  Send,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { zeroAddress } from "viem";
import { useAccount } from "wagmi";
import type { SafeMultisigTransaction } from "@/entities/safe/types";
import { useSafeInfo } from "@/entities/safe/use-safe-info";
import { useActiveSafeWorkspace } from "@/entities/safe/workspace.store";
import { AddressDisplay } from "@/entities/token/address-display";
import { useAddressBook } from "@/features/governance-ops/hooks/use-address-book";
import { useSafeTxActions } from "@/features/tx-proposal/hooks/use-safe-actions";
import { usePendingSafeTransactions } from "@/features/tx-proposal/hooks/use-safe-transactions";
import { groupProposalsByNonce } from "@/features/tx-proposal/model/nonce-grouping";
import { TxStateBanner } from "@/features/tx-proposal/ui/tx-state-banner";
import { useSimulateSafeTx } from "@/features/tx-simulation/hooks/use-simulate-safe-tx";
import { SimulationPanel } from "@/features/tx-simulation/ui/simulation-panel";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Skeleton } from "@/shared/ui/skeleton";
import { StatusBadge } from "@/shared/ui/status-badge";
import { formatTokenAmount } from "@/shared/web3/bigint";

export default function QueuePage() {
  const workspace = useActiveSafeWorkspace();
  const { address: signerAddress } = useAccount();
  const { data: safeInfo } = useSafeInfo(workspace.address, workspace.chainId);
  const { data: pendingTxs, isLoading } = usePendingSafeTransactions(
    workspace.address,
    workspace.chainId,
    safeInfo?.nonce
  );
  const { resolveEntry } = useAddressBook(workspace.chainId);

  const {
    lifecycle,
    resetLifecycle,
    proposeTransaction,
    confirmTransaction,
    executeTransaction,
  } = useSafeTxActions();

  const simulateMutation = useSimulateSafeTx();
  const [simulatingTx, setSimulatingTx] =
    useState<SafeMultisigTransaction | null>(null);

  const currentOnChainNonce = safeInfo?.nonce ?? 0;

  const nonceGroups = useMemo(
    () => groupProposalsByNonce(pendingTxs ?? [], currentOnChainNonce),
    [pendingTxs, currentOnChainNonce]
  );

  async function handleSimulateProposal(tx: SafeMultisigTransaction) {
    setSimulatingTx(tx);
    simulateMutation.reset();
    await simulateMutation.mutateAsync({
      chainId: workspace.chainId,
      safeAddress: workspace.address,
      signerAddress: signerAddress ?? safeInfo?.owners[0] ?? zeroAddress,
      to: tx.to,
      value: tx.value,
      data: tx.data,
      operation: tx.operation,
    });
  }

  async function handleCreateRejectionTx(nonce: number) {
    await proposeTransaction({
      safeAddress: workspace.address,
      chainId: workspace.chainId,
      nonce,
      calls: [
        {
          to: workspace.address,
          value: "0",
          data: "0x",
        },
      ],
      title: `On-Chain Rejection (Nonce #${nonce})`,
      description: `0 ETH self-transfer to cancel competing proposals at nonce #${nonce}.`,
      category: "OPERATIONS",
    });
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Pending Multi-Sig Queue & Nonce Manager
          </h2>
          <p className="text-xs text-muted-foreground">
            Proposals grouped by ascending nonce. Current on-chain Safe nonce:{" "}
            <span className="font-mono font-semibold text-foreground tabular-nums">
              #{currentOnChainNonce}
            </span>
          </p>
        </div>
        <Link href="/batch-builder">
          <Button type="button" size="sm" className="h-8 text-xs">
            Create New Proposal
          </Button>
        </Link>
      </div>

      <TxStateBanner
        lifecycle={lifecycle}
        chainId={workspace.chainId}
        onDismiss={resetLifecycle}
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <Skeleton key={idx} className="h-28 w-full rounded-md" />
          ))}
        </div>
      ) : nonceGroups.length === 0 ? (
        <div className="rounded-md border border-border bg-card p-10 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-[#34D399]" />
          <p className="text-sm font-semibold text-foreground">
            Queue is Clear
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            No pending multi-sig proposals are awaiting signatures for{" "}
            <span className="font-mono">{workspace.address}</span>.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {nonceGroups.map((group) => (
            <section
              key={group.nonce}
              className={cn(
                "rounded-md border bg-card",
                group.hasConflict
                  ? "border-[#78350F]"
                  : group.isNextExecutable
                    ? "border-border-active"
                    : "border-border"
              )}
            >
              {/* Nonce Group Header */}
              <div
                className={cn(
                  "flex flex-wrap items-center justify-between gap-2 border-b px-4 py-2.5 text-xs",
                  group.hasConflict
                    ? "border-[#78350F] bg-[#2A1F08] text-[#FBBF24]"
                    : "border-border bg-muted/60 text-foreground"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-semibold tabular-nums">
                    Nonce #{group.nonce}
                  </span>
                  {group.isNextExecutable ? (
                    <StatusBadge tone="verified">Next Executable</StatusBadge>
                  ) : group.isStale ? (
                    <StatusBadge tone="critical">Stale Nonce</StatusBadge>
                  ) : (
                    <StatusBadge tone="info">Queued Ahead</StatusBadge>
                  )}
                  {group.hasConflict ? (
                    <span className="inline-flex items-center gap-1 font-medium">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Nonce Conflict ({group.proposals.length} competing proposals — executing
                      one invalidates all others)
                    </span>
                  ) : null}
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => void handleCreateRejectionTx(group.nonce)}
                  className="bg-card text-xs"
                >
                  <Ban className="mr-1 h-3 w-3" />
                  Create Rejection / Replacement Tx
                </Button>
              </div>

              {/* Proposals in this Nonce Group */}
              <div className="divide-y divide-border">
                {group.proposals.map((tx) => {
                  const hasSigned = Boolean(
                    signerAddress &&
                      tx.confirmations.some(
                        (c) =>
                          c.owner.toLowerCase() === signerAddress.toLowerCase()
                      )
                  );
                  const quorumMet =
                    tx.confirmations.length >= tx.confirmationsRequired;
                  const canExecute = quorumMet && group.isNextExecutable;
                  const hasCritical = tx.risks.some(
                    (r) => r.severity === "CRITICAL"
                  );
                  const bookEntry = resolveEntry(tx.to);

                  return (
                    <div
                      key={tx.safeTxHash}
                      className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/proposals/${tx.safeTxHash}`}
                            className="text-sm font-semibold text-foreground hover:underline"
                          >
                            {tx.meta?.title ?? tx.decoded.summary}
                          </Link>
                          <StatusBadge
                            tone={quorumMet ? "verified" : "pending"}
                            mono
                          >
                            {tx.confirmations.length} / {tx.confirmationsRequired} signed
                          </StatusBadge>
                          {hasCritical ? (
                            <StatusBadge tone="critical">
                              CRITICAL RISK
                            </StatusBadge>
                          ) : null}
                          {tx.meta?.invoiceRef ? (
                            <StatusBadge tone="info" mono>
                              {tx.meta.invoiceRef}
                            </StatusBadge>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            Target:
                            <AddressDisplay
                              address={tx.to}
                              chainId={workspace.chainId}
                              label={bookEntry?.label}
                              verified={Boolean(bookEntry)}
                            />
                          </span>
                          <span className="font-mono tabular-nums">
                            Value: {formatTokenAmount(BigInt(tx.value), 18, 4)} ETH
                          </span>
                          <span className="font-mono text-[11px] tabular-nums">
                            Op: {tx.operation === 1 ? "DELEGATECALL" : "CALL"}
                          </span>
                        </div>
                      </div>

                      {/* Row Actions */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => void handleSimulateProposal(tx)}
                          className="bg-card"
                        >
                          <Play className="mr-1 h-3 w-3" />
                          Simulate
                        </Button>

                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          disabled={hasSigned || hasCritical}
                          title={
                            hasCritical
                              ? "Open full Audit Report to acknowledge CRITICAL risk before co-signing"
                              : undefined
                          }
                          onClick={() =>
                            void confirmTransaction({
                              safeAddress: workspace.address,
                              chainId: workspace.chainId,
                              safeTxHash: tx.safeTxHash,
                            })
                          }
                          className="bg-card"
                        >
                          <ShieldCheck className="mr-1 h-3 w-3" />
                          {hasSigned ? "Signed" : "Co-Sign (EIP-712)"}
                        </Button>

                        <Button
                          type="button"
                          size="xs"
                          disabled={!canExecute}
                          onClick={() =>
                            void executeTransaction({
                              safeAddress: workspace.address,
                              chainId: workspace.chainId,
                              safeTxHash: tx.safeTxHash,
                            })
                          }
                        >
                          <Send className="mr-1 h-3 w-3" />
                          Execute On-Chain
                        </Button>

                        <Link href={`/proposals/${tx.safeTxHash}`}>
                          <Button
                            type="button"
                            variant="outline"
                            size="xs"
                            className="bg-card"
                          >
                            Audit
                            <ArrowUpRight className="ml-1 h-3 w-3" />
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Inline Simulation Modal */}
      <Dialog
        open={simulatingTx !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSimulatingTx(null);
            simulateMutation.reset();
          }
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto border-border bg-card shadow-none sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Pre-Execution Simulation — Nonce #{simulatingTx?.nonce}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {simulatingTx?.meta?.title ?? simulatingTx?.decoded.summary}
            </DialogDescription>
          </DialogHeader>

          {simulateMutation.isPending ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Running Safe storage slot-4 state-override simulation…
            </div>
          ) : simulateMutation.isError ? (
            <div className="rounded-md border border-[#881337] bg-[#2D0E14] p-3 text-xs text-[#FB7185]">
              {simulateMutation.error instanceof Error
                ? simulateMutation.error.message
                : "Simulation failed."}
            </div>
          ) : simulateMutation.data ? (
            <SimulationPanel
              result={simulateMutation.data}
              chainId={workspace.chainId}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
