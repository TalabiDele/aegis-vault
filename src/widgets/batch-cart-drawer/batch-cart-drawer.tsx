"use client";

import { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Layers,
  Loader2,
  Play,
  Send,
  Trash2,
} from "lucide-react";
import { zeroAddress } from "viem";
import { useAccount } from "wagmi";
import { useActiveSafeWorkspace } from "@/entities/safe/workspace.store";
import { AddressDisplay } from "@/entities/token/address-display";
import { buildSafeBatchPayload } from "@/features/tx-proposal/api/safe-client";
import { useSafeTxActions } from "@/features/tx-proposal/hooks/use-safe-actions";
import { useBatchCartStore } from "@/features/tx-proposal/model/batch-cart.store";
import { TxStateBanner } from "@/features/tx-proposal/ui/tx-state-banner";
import { useSimulateSafeTx } from "@/features/tx-simulation/hooks/use-simulate-safe-tx";
import { SimulationPanel } from "@/features/tx-simulation/ui/simulation-panel";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { StatusBadge } from "@/shared/ui/status-badge";

export function BatchCartDrawer() {
  const workspace = useActiveSafeWorkspace();
  const { address: signerAddress } = useAccount();
  const {
    items,
    isOpen,
    setOpen,
    removeItem,
    moveItem,
    clearCart,
  } = useBatchCartStore();

  const [title, setTitle] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [acknowledgedCritical, setAcknowledgedCritical] = useState(false);

  const simulateMutation = useSimulateSafeTx();
  const { lifecycle, resetLifecycle, proposeTransaction } = useSafeTxActions();

  const hasCriticalRisk = Boolean(
    simulateMutation.data?.risks.some((r) => r.severity === "CRITICAL")
  );

  async function handleSimulateBatch() {
    if (items.length === 0) return;
    setAcknowledgedCritical(false);

    const payload = buildSafeBatchPayload(
      workspace.chainId,
      items.map((item) => ({
        to: item.to,
        value: item.value,
        data: item.data,
      }))
    );

    await simulateMutation.mutateAsync({
      chainId: workspace.chainId,
      safeAddress: workspace.address,
      signerAddress: signerAddress ?? zeroAddress,
      to: payload.to,
      value: payload.value,
      data: payload.data,
      operation: payload.operation,
    });
  }

  async function handleProposeBatch() {
    if (items.length === 0) return;
    const result = await proposeTransaction({
      safeAddress: workspace.address,
      chainId: workspace.chainId,
      calls: items.map((item) => ({
        to: item.to,
        value: item.value,
        data: item.data,
      })),
      title:
        title.trim() ||
        (items.length === 1
          ? (items[0]?.title ?? "Treasury Action")
          : `MultiSend Batch (${items.length} calls)`),
      invoiceRef: invoiceRef.trim() || undefined,
      category:
        items.every((i) => i.kind === "revoke")
          ? "REVOKE"
          : items.every((i) => i.kind === "governance")
            ? "GOVERNANCE"
            : "PAYROLL",
    });

    if (result) {
      clearCart();
      setTitle("");
      setInvoiceRef("");
      simulateMutation.reset();
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        className="flex w-full flex-col border-l border-border bg-card p-0 shadow-none sm:max-w-xl"
      >
        <SheetHeader className="border-b border-border px-5 py-4">
          <div className="flex items-center justify-between pr-6">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-foreground" />
              <SheetTitle className="text-sm font-semibold text-foreground">
                MultiSendCallOnly Batch Cart
              </SheetTitle>
              <StatusBadge tone="info" mono>
                {items.length} {items.length === 1 ? "call" : "calls"}
              </StatusBadge>
            </div>
            {items.length > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="xs"
                onClick={() => {
                  clearCart();
                  simulateMutation.reset();
                }}
              >
                Clear All
              </Button>
            ) : null}
          </div>
          <SheetDescription className="text-xs text-muted-foreground">
            Queued payouts, allowance revocations, and governance calls execute atomically
            via Safe v1.4.1 MultiSendCallOnly (onlyCalls: true).
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <TxStateBanner
            lifecycle={lifecycle}
            chainId={workspace.chainId}
            onDismiss={resetLifecycle}
          />

          {items.length === 0 ? (
            <div className="rounded-md border border-dashed border-border bg-muted/40 p-8 text-center">
              <Layers className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-sm font-medium text-foreground">
                Batch Cart is Empty
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add token payouts from Treasury or Batch Builder, queue revocations from
                Allowances, or stage governance actions.
              </p>
            </div>
          ) : (
            <>
              {/* Queued Calls List */}
              <div className="space-y-2">
                {items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="flex items-start justify-between gap-3 rounded-md border border-border bg-background p-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                          #{idx + 1}
                        </span>
                        <StatusBadge
                          tone={
                            item.kind === "revoke"
                              ? "pending"
                              : item.kind === "governance"
                                ? "critical"
                                : "info"
                          }
                          className="uppercase"
                        >
                          {item.kind}
                        </StatusBadge>
                        <span className="truncate text-xs font-semibold text-foreground">
                          {item.title}
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {item.subtitle}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>Target:</span>
                        <AddressDisplay
                          address={item.to}
                          chainId={workspace.chainId}
                          showExplorer={false}
                        />
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => {
                          moveItem(idx, "up");
                          simulateMutation.reset();
                        }}
                        aria-label="Move call up"
                        className="rounded border border-border bg-card p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === items.length - 1}
                        onClick={() => {
                          moveItem(idx, "down");
                          simulateMutation.reset();
                        }}
                        aria-label="Move call down"
                        className="rounded border border-border bg-card p-1 text-muted-foreground hover:text-foreground disabled:opacity-40"
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          removeItem(item.id);
                          simulateMutation.reset();
                        }}
                        aria-label="Remove call from batch"
                        className="rounded border border-border bg-card p-1 text-[#FB7185] hover:bg-[#2D0E14]"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Optional Proposal Metadata */}
              <div className="grid grid-cols-1 gap-3 rounded-md border border-border bg-muted/40 p-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="batch-title" className="text-xs">
                    Proposal Title (Off-Chain Memo)
                  </Label>
                  <Input
                    id="batch-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Nov Vendor Settlement Batch"
                    className="h-8 bg-card text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="batch-invoice" className="text-xs">
                    Invoice / Accounting Ref
                  </Label>
                  <Input
                    id="batch-invoice"
                    value={invoiceRef}
                    onChange={(e) => setInvoiceRef(e.target.value)}
                    placeholder="e.g. INV-2026-114"
                    className="h-8 bg-card font-mono text-xs"
                  />
                </div>
              </div>

              {/* Simulation Error */}
              {simulateMutation.isError ? (
                <div className="rounded-md border border-[#881337] bg-[#2D0E14] p-3 text-xs text-[#FB7185]">
                  {simulateMutation.error instanceof Error
                    ? simulateMutation.error.message
                    : "Simulation failed."}
                </div>
              ) : null}

              {/* Simulation Output */}
              {simulateMutation.data ? (
                <div className="space-y-3">
                  <SimulationPanel
                    result={simulateMutation.data}
                    chainId={workspace.chainId}
                  />
                  {hasCriticalRisk ? (
                    <label className="flex items-start gap-2.5 rounded-md border border-[#881337] bg-[#2D0E14] p-3 text-xs text-[#FB7185]">
                      <Checkbox
                        checked={acknowledgedCritical}
                        onCheckedChange={(checked) =>
                          setAcknowledgedCritical(Boolean(checked))
                        }
                        className="mt-0.5"
                      />
                      <span>
                        I have inspected the CRITICAL risk findings above and accept
                        responsibility for proposing this Safe transaction.
                      </span>
                    </label>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>

        {/* Drawer Footer Actions */}
        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/40 px-5 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={items.length === 0 || simulateMutation.isPending}
            onClick={() => void handleSimulateBatch()}
            className="flex-1 bg-card"
          >
            {simulateMutation.isPending ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="mr-1.5 h-3.5 w-3.5" />
            )}
            {simulateMutation.isPending ? "Simulating…" : "Simulate Batch"}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={
              items.length === 0 ||
              !simulateMutation.data ||
              (hasCriticalRisk && !acknowledgedCritical) ||
              lifecycle.status === "awaiting_wallet_signature"
            }
            onClick={() => void handleProposeBatch()}
            className="flex-1 bg-primary text-primary-foreground hover:bg-[#34D399]"
          >
            <Send className="mr-1.5 h-3.5 w-3.5" />
            Sign & Propose Batch
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
