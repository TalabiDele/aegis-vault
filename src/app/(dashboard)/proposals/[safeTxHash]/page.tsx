"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Play,
  Send,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { isHex, zeroAddress, type Hex } from "viem";
import { useAccount } from "wagmi";
import { useSafeInfo } from "@/entities/safe/use-safe-info";
import { useActiveSafeWorkspace } from "@/entities/safe/workspace.store";
import { AddressDisplay } from "@/entities/token/address-display";
import { useAddressBook } from "@/features/governance-ops/hooks/use-address-book";
import { SiweAuthGate } from "@/features/siwe-auth/ui/siwe-auth-gate";
import { useSafeTxActions } from "@/features/tx-proposal/hooks/use-safe-actions";
import { useSafeTransactionDetail } from "@/features/tx-proposal/hooks/use-safe-transactions";
import { TxStateBanner } from "@/features/tx-proposal/ui/tx-state-banner";
import { useSimulateSafeTx } from "@/features/tx-simulation/hooks/use-simulate-safe-tx";
import { SimulationPanel } from "@/features/tx-simulation/ui/simulation-panel";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Skeleton } from "@/shared/ui/skeleton";
import { StatusBadge } from "@/shared/ui/status-badge";
import { Textarea } from "@/shared/ui/textarea";
import { formatTokenAmount } from "@/shared/web3/bigint";

export default function ProposalDetailPage() {
  const params = useParams<{ safeTxHash: string }>();
  const rawHash = params?.safeTxHash ?? "0x";
  const safeTxHash: Hex = isHex(rawHash) ? rawHash : "0x";

  const workspace = useActiveSafeWorkspace();
  const { address: signerAddress } = useAccount();
  const queryClient = useQueryClient();

  const { data: safeInfo } = useSafeInfo(workspace.address, workspace.chainId);
  const { data: tx, isLoading } = useSafeTransactionDetail(
    safeTxHash,
    workspace.address,
    workspace.chainId
  );
  const { resolveEntry } = useAddressBook(workspace.chainId);

  const simulateMutation = useSimulateSafeTx();
  const { lifecycle, resetLifecycle, confirmTransaction, executeTransaction } =
    useSafeTxActions();

  const [acknowledgedCritical, setAcknowledgedCritical] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!tx) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Link
          href="/queue"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Transaction Queue
        </Link>
        <div className="rounded-md border border-border bg-card p-8 text-center">
          <p className="text-sm font-semibold text-foreground">
            Proposal Not Found
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {safeTxHash}
          </p>
        </div>
      </div>
    );
  }

  const combinedRisks = simulateMutation.data?.risks ?? tx.risks;
  const hasCriticalRisk = combinedRisks.some((r) => r.severity === "CRITICAL");
  const hasSigned = Boolean(
    signerAddress &&
      tx.confirmations.some(
        (c) => c.owner.toLowerCase() === signerAddress.toLowerCase()
      )
  );
  const quorumMet = tx.confirmations.length >= tx.confirmationsRequired;
  const canExecute =
    !tx.isExecuted && quorumMet && tx.nonce === (safeInfo?.nonce ?? -1);

  const confirmedOwnersSet = new Set(
    tx.confirmations.map((c) => c.owner.toLowerCase())
  );
  const awaitingOwners = (safeInfo?.owners ?? []).filter(
    (owner) => !confirmedOwnersSet.has(owner.toLowerCase())
  );

  async function handleRunSimulation() {
    if (!tx) return;
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

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!tx || !commentBody.trim()) return;
    setCommentSubmitting(true);
    setCommentError(null);

    try {
      const res = await fetch(`/api/proposals/${tx.safeTxHash}/comments`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          safeAddress: workspace.address,
          chainId: workspace.chainId,
          nonce: tx.nonce,
          body: commentBody.trim(),
        }),
      });
      const payload = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(payload.error ?? "Failed to post audit comment.");
      }
      setCommentBody("");
      await queryClient.invalidateQueries({ queryKey: ["safe-tx-detail"] });
    } catch (err) {
      setCommentError(
        err instanceof Error ? err.message : "Failed to save comment."
      );
    } finally {
      setCommentSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/queue"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Transaction Queue
        </Link>
        <div className="flex items-center gap-2">
          <StatusBadge tone="info" mono>
            Nonce #{tx.nonce}
          </StatusBadge>
          <StatusBadge
            tone={
              tx.isExecuted
                ? tx.isSuccessful === false
                  ? "critical"
                  : "verified"
                : quorumMet
                  ? "verified"
                  : "pending"
            }
          >
            {tx.isExecuted
              ? tx.isSuccessful === false
                ? "Executed (Reverted)"
                : "Executed"
              : `${tx.confirmations.length} / ${tx.confirmationsRequired} Confirmed`}
          </StatusBadge>
        </div>
      </div>

      <TxStateBanner
        lifecycle={lifecycle}
        chainId={workspace.chainId}
        onDismiss={resetLifecycle}
      />

      {/* Proposal Header Card */}
      <section className="rounded-md border border-border bg-card p-5 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-foreground">
              {tx.meta?.title ?? tx.decoded.summary}
            </h2>
            {tx.meta?.description ? (
              <p className="text-xs text-muted-foreground">
                {tx.meta.description}
              </p>
            ) : null}
            <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
              SafeTxHash: {tx.safeTxHash}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={simulateMutation.isPending}
              onClick={() => void handleRunSimulation()}
              className="bg-card text-xs"
            >
              {simulateMutation.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="mr-1.5 h-3.5 w-3.5" />
              )}
              {simulateMutation.data ? "Re-Simulate" : "Run Simulation"}
            </Button>

            {!tx.isExecuted ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={hasSigned || (hasCriticalRisk && !acknowledgedCritical)}
                  onClick={() =>
                    void confirmTransaction({
                      safeAddress: workspace.address,
                      chainId: workspace.chainId,
                      safeTxHash: tx.safeTxHash,
                    })
                  }
                  className="bg-card text-xs"
                >
                  <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                  {hasSigned ? "Already Signed" : "Co-Sign (EIP-712)"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!canExecute}
                  onClick={() =>
                    void executeTransaction({
                      safeAddress: workspace.address,
                      chainId: workspace.chainId,
                      safeTxHash: tx.safeTxHash,
                    })
                  }
                  className="text-xs"
                >
                  <Send className="mr-1.5 h-3.5 w-3.5" />
                  Execute On-Chain
                </Button>
              </>
            ) : null}
          </div>
        </div>

        {/* Metadata Grid */}
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-3">
          <div>
            <p className="text-[11px] text-muted-foreground">Target Contract / Recipient</p>
            <div className="mt-1">
              <AddressDisplay
                address={tx.to}
                chainId={workspace.chainId}
                label={resolveEntry(tx.to)?.label}
                verified={Boolean(resolveEntry(tx.to))}
              />
            </div>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Value & Operation</p>
            <p className="mt-1 font-mono font-medium text-foreground tabular-nums">
              {formatTokenAmount(BigInt(tx.value), 18, 6)} ETH ·{" "}
              {tx.operation === 1 ? "DELEGATECALL" : "CALL"}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Invoice / Category</p>
            <p className="mt-1 font-mono text-foreground">
              {tx.meta?.invoiceRef ?? "No Invoice Ref"} ·{" "}
              {tx.meta?.category ?? "OPERATIONS"}
            </p>
          </div>
        </div>

        {/* Explicit CRITICAL Risk Acknowledgement Gate */}
        {hasCriticalRisk && !tx.isExecuted && !hasSigned ? (
          <label className="flex items-start gap-2.5 rounded-md border border-[#881337] bg-[#2D0E14] p-3 text-xs text-[#FB7185]">
            <Checkbox
              checked={acknowledgedCritical}
              onCheckedChange={(checked) =>
                setAcknowledgedCritical(Boolean(checked))
              }
              className="mt-0.5"
            />
            <span>
              <strong>CRITICAL Risk Gate:</strong> This transaction triggered one or
              more CRITICAL findings (such as non-canonical DELEGATECALL or unlimited
              allowance). Check this box to explicitly unlock the Co-Sign button.
            </span>
          </label>
        ) : null}
      </section>

      {/* Pre-Execution Simulation & Security Report */}
      <section className="rounded-md border border-border bg-card p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Pre-Execution Simulation & Audit Report
            </h3>
            <p className="text-xs text-muted-foreground">
              Dry-run against live EVM state with Safe storage slot-4 threshold override
            </p>
          </div>
        </div>

        {simulateMutation.data ? (
          <SimulationPanel
            result={simulateMutation.data}
            chainId={workspace.chainId}
          />
        ) : (
          <SimulationPanel
            result={{
              success: tx.isSuccessful ?? true,
              engine: "evm_state_override",
              gasUsed: null,
              revertReason: null,
              assetChanges: [],
              callTrace: null,
              decoded: tx.decoded,
              risks: tx.risks,
            }}
            chainId={workspace.chainId}
          />
        )}
      </section>

      {/* Co-Signer Audit Trail & Discussion */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-md border border-border bg-card p-5 space-y-3">
          <h3 className="border-b border-border pb-2 text-sm font-semibold text-foreground">
            Co-Signer Confirmations ({tx.confirmations.length} /{" "}
            {tx.confirmationsRequired})
          </h3>
          <div className="space-y-2">
            {tx.confirmations.map((conf) => (
              <div
                key={conf.owner}
                className="flex items-center justify-between rounded border border-[#065F46] bg-[#052E1E] px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-[#34D399]" />
                  <AddressDisplay
                    address={conf.owner}
                    chainId={workspace.chainId}
                    label={resolveEntry(conf.owner)?.label}
                  />
                </div>
                <span className="font-mono text-[11px] text-[#34D399] tabular-nums">
                  Signed
                </span>
              </div>
            ))}
            {awaitingOwners.map((owner) => (
              <div
                key={owner}
                className="flex items-center justify-between rounded border border-border bg-muted/40 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <AddressDisplay
                    address={owner}
                    chainId={workspace.chainId}
                    label={resolveEntry(owner)?.label}
                  />
                </div>
                <span className="font-mono text-[11px] text-muted-foreground">
                  Awaiting
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-md border border-border bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 border-b border-border pb-2">
            <MessageSquare className="h-4 w-4 text-foreground" />
            <h3 className="text-sm font-semibold text-foreground">
              Internal Audit Discussion ({tx.meta?.comments.length ?? 0})
            </h3>
          </div>

          <div className="max-h-56 space-y-2 overflow-y-auto">
            {(tx.meta?.comments ?? []).length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No internal co-signer notes recorded for this proposal yet.
              </p>
            ) : (
              (tx.meta?.comments ?? []).map((comment) => (
                <div
                  key={comment.id}
                  className="rounded border border-border bg-background p-2.5 text-xs"
                >
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <AddressDisplay
                      address={comment.author}
                      chainId={workspace.chainId}
                      label={resolveEntry(comment.author)?.label}
                      showCopy={false}
                      showExplorer={false}
                    />
                    <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                      {comment.createdAt.slice(0, 10)}
                    </span>
                  </div>
                  <p className="text-foreground">{comment.body}</p>
                </div>
              ))
            )}
          </div>

          <SiweAuthGate actionDescription="post an authenticated internal audit comment">
            <form onSubmit={(e) => void handleAddComment(e)} className="space-y-2">
              <Textarea
                value={commentBody}
                onChange={(e) => setCommentBody(e.target.value)}
                placeholder="Record verification notes, invoice approval, or simulation sign-off…"
                className="min-h-[72px] text-xs"
              />
              {commentError ? (
                <p className="text-xs text-[#FB7185]">{commentError}</p>
              ) : null}
              <Button
                type="submit"
                size="sm"
                disabled={commentSubmitting || !commentBody.trim()}
                className="w-full text-xs"
              >
                {commentSubmitting ? "Posting…" : "Post Audit Comment"}
              </Button>
            </form>
          </SiweAuthGate>
        </section>
      </div>
    </div>
  );
}
