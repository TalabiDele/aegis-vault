"use client";

import { CheckCircle2, RefreshCw, ShieldAlert, ShieldOff } from "lucide-react";
import { useState } from "react";
import { encodeFunctionData } from "viem";
import { useActiveSafeWorkspace } from "@/entities/safe/workspace.store";
import { AddressDisplay } from "@/entities/token/address-display";
import { TokenAmount } from "@/entities/token/token-amount";
import {
  useSafeAllowances,
  type SafeAllowanceItem,
} from "@/features/allowance-auditor/hooks/use-safe-allowances";
import { useAddressBook } from "@/features/governance-ops/hooks/use-address-book";
import { useBatchCartStore } from "@/features/tx-proposal/model/batch-cart.store";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Skeleton } from "@/shared/ui/skeleton";
import { StatusBadge } from "@/shared/ui/status-badge";
import { erc20Abi } from "@/shared/web3/abis";
import { truncateAddress } from "@/shared/web3/bigint";

export default function AllowancesPage() {
  const workspace = useActiveSafeWorkspace();
  const {
    data: allowances,
    isLoading,
    refetch,
  } = useSafeAllowances(workspace.address, workspace.chainId);
  const { resolveEntry } = useAddressBook(workspace.chainId);
  const { addItem, addItems, setOpen: setCartOpen } = useBatchCartStore();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const list = allowances ?? [];
  const unlimitedCount = list.filter((a) => a.isUnlimited).length;

  function toggleSelection(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  }

  function toggleSelectAll(checked: boolean) {
    if (checked) {
      setSelectedIds(new Set(list.map((a) => a.id)));
    } else {
      setSelectedIds(new Set());
    }
  }

  function buildRevokeCartItem(item: SafeAllowanceItem) {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [item.spenderAddress, 0n],
    });
    const label =
      resolveEntry(item.spenderAddress)?.label ??
      item.spenderLabel ??
      truncateAddress(item.spenderAddress);

    return {
      kind: "revoke" as const,
      title: `Revoke ${item.tokenSymbol} Allowance`,
      subtitle: `Set allowance to 0 for ${label}`,
      to: item.tokenAddress,
      value: "0",
      data,
      tokenSymbol: item.tokenSymbol,
      recipientAddress: item.spenderAddress,
    };
  }

  function handleQueueSingleRevoke(item: SafeAllowanceItem) {
    addItem(buildRevokeCartItem(item));
    setCartOpen(true);
  }

  function handleQueueSelectedRevocations() {
    const selected = list.filter((item) => selectedIds.has(item.id));
    if (selected.length === 0) return;
    addItems(selected.map(buildRevokeCartItem));
    setSelectedIds(new Set());
    setCartOpen(true);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            ERC-20 Token Allowance Auditor & Batch Revoker
          </h2>
          <p className="text-xs text-muted-foreground">
            Live allowances queried via Multicall across Ponder-indexed approvals and
            curated DeFi spenders.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unlimitedCount > 0 ? (
            <StatusBadge tone="critical" mono>
              <ShieldAlert className="h-3.5 w-3.5" />
              {unlimitedCount} Unlimited{" "}
              {unlimitedCount === 1 ? "Approval" : "Approvals"}
            </StatusBadge>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            className="h-8 bg-card text-xs"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Re-Scan Multicall
          </Button>
        </div>
      </div>

      {/* Bulk Revoke Bar */}
      {selectedIds.size > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[#881337] bg-[#2D0E14] px-4 py-2.5 text-xs text-[#FB7185]">
          <span className="font-medium">
            {selectedIds.size} active{" "}
            {selectedIds.size === 1 ? "allowance" : "allowances"} selected for atomic
            MultiSendCallOnly revocation.
          </span>
          <Button
            type="button"
            size="xs"
            onClick={handleQueueSelectedRevocations}
            className="bg-[#E11D48] text-white hover:bg-[#BE123C]"
          >
            <ShieldOff className="mr-1.5 h-3.5 w-3.5" />
            Queue Selected Revocations ({selectedIds.size})
          </Button>
        </div>
      ) : null}

      <section className="rounded-md border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <Checkbox
                    checked={list.length > 0 && selectedIds.size === list.length}
                    onCheckedChange={(checked) => toggleSelectAll(Boolean(checked))}
                    aria-label="Select all allowances"
                  />
                </th>
                <th className="px-4 py-2.5">Token</th>
                <th className="px-4 py-2.5">Spender</th>
                <th className="px-4 py-2.5 text-right">Approved Amount</th>
                <th className="px-4 py-2.5">Risk Level</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3" colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : list.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center">
                    <CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-[#34D399]" />
                    <p className="text-sm font-semibold text-foreground">
                      Zero Active ERC-20 Allowances Detected
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      No non-zero token approvals were found for this Safe across
                      tracked tokens and spenders.
                    </p>
                  </td>
                </tr>
              ) : (
                list.map((item) => {
                  const bookEntry = resolveEntry(item.spenderAddress);
                  const resolvedLabel = bookEntry?.label ?? item.spenderLabel;

                  return (
                    <tr key={item.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={(checked) =>
                            toggleSelection(item.id, Boolean(checked))
                          }
                          aria-label={`Select ${item.tokenSymbol} allowance for ${item.spenderAddress}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-semibold text-foreground">
                            {item.tokenSymbol}
                          </span>
                          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
                            {truncateAddress(item.tokenAddress)}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <AddressDisplay
                          address={item.spenderAddress}
                          chainId={workspace.chainId}
                          label={resolvedLabel}
                          verified={Boolean(bookEntry)}
                        />
                      </td>
                      <td className="px-4 py-3 text-right">
                        {item.isUnlimited ? (
                          <StatusBadge tone="critical" mono>
                            Unlimited (maxUint256)
                          </StatusBadge>
                        ) : (
                          <TokenAmount
                            amount={item.allowance}
                            decimals={item.tokenDecimals}
                            symbol={item.tokenSymbol}
                          />
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge
                          tone={
                            item.riskLevel === "CRITICAL"
                              ? "critical"
                              : item.riskLevel === "ELEVATED"
                                ? "pending"
                                : "info"
                          }
                        >
                          {item.riskLevel}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => handleQueueSingleRevoke(item)}
                          className="border-[#881337] bg-card text-[#FB7185] hover:bg-[#2D0E14]"
                        >
                          Queue Revoke
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
