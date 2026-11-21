"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Download,
  ExternalLink,
  Plus,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import Papa from "papaparse";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useSafeBalances } from "@/entities/safe/use-safe-balances";
import { useSafeInfo } from "@/entities/safe/use-safe-info";
import { useActiveSafeWorkspace } from "@/entities/safe/workspace.store";
import { AddressDisplay } from "@/entities/token/address-display";
import { TokenAmount } from "@/entities/token/token-amount";
import { useAddressBook } from "@/features/governance-ops/hooks/use-address-book";
import {
  useExecutedSafeTransactions,
  usePendingSafeTransactions,
} from "@/features/tx-proposal/hooks/use-safe-transactions";
import { getExplorerTxUrl } from "@/shared/config/chains";
import { Button } from "@/shared/ui/button";
import { Skeleton } from "@/shared/ui/skeleton";
import { StatusBadge } from "@/shared/ui/status-badge";
import {
  formatBpsAsPercent,
  formatTokenAmount,
  formatUsdCents,
} from "@/shared/web3/bigint";

interface CashflowPoint {
  period: string;
  inflowCount: number;
  outflowCount: number;
  executions: number;
}

export default function TreasuryPage() {
  const workspace = useActiveSafeWorkspace();
  const {
    data: safeInfo,
    isLoading: infoLoading,
    refetch: refetchInfo,
  } = useSafeInfo(workspace.address, workspace.chainId);
  const {
    data: balances,
    isLoading: balancesLoading,
    refetch: refetchBalances,
  } = useSafeBalances(workspace.address, workspace.chainId);
  const { data: pendingTxs } = usePendingSafeTransactions(
    workspace.address,
    workspace.chainId,
    safeInfo?.nonce
  );
  const { data: executedTxs, isLoading: executedLoading } =
    useExecutedSafeTransactions(workspace.address, workspace.chainId);
  const { resolveEntry } = useAddressBook(workspace.chainId);

  // Ponder-indexed historical cashflow (with graceful fallback to executed Safe txs)
  const { data: indexedHistory } = useQuery({
    queryKey: ["ponder-cashflow", workspace.chainId, workspace.address.toLowerCase()],
    staleTime: 30_000,
    queryFn: async (): Promise<{
      source: "ponder" | "fallback";
      series: CashflowPoint[];
    }> => {
      try {
        const res = await fetch(
          `/api/indexer/cashflow?safeAddress=${encodeURIComponent(workspace.address)}&chainId=${workspace.chainId}`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const data = (await res.json()) as {
            source?: "ponder" | "fallback";
            series?: CashflowPoint[];
          };
          if (data.series && data.series.length > 0) {
            return {
              source: data.source ?? "ponder",
              series: data.series,
            };
          }
        }
      } catch {
        // Fallback below
      }
      return { source: "fallback", series: [] };
    },
  });

  const chartData = useMemo<CashflowPoint[]>(() => {
    if (indexedHistory?.series && indexedHistory.series.length > 0) {
      return indexedHistory.series;
    }

    // Aggregate executed transactions by YYYY-MM as graceful local fallback
    const buckets = new Map<string, CashflowPoint>();
    for (const tx of executedTxs ?? []) {
      const dateStr = tx.executionDate ?? tx.submissionDate;
      const period = dateStr ? dateStr.slice(0, 7) : "Recent";
      const existing = buckets.get(period) ?? {
        period,
        inflowCount: 0,
        outflowCount: 0,
        executions: 0,
      };
      existing.executions += 1;
      existing.outflowCount += 1;
      buckets.set(period, existing);
    }

    return Array.from(buckets.values()).sort((a, b) =>
      a.period.localeCompare(b.period)
    );
  }, [executedTxs, indexedHistory]);

  function handleExportCsv() {
    const rows = (executedTxs ?? []).map((tx) => ({
      safeTxHash: tx.safeTxHash,
      nonce: tx.nonce,
      action: tx.decoded.summary,
      to: tx.to,
      recipientLabel: resolveEntry(tx.to)?.label ?? "",
      valueWei: tx.value,
      status: tx.isSuccessful === false ? "REVERTED" : "EXECUTED",
      executionDate: tx.executionDate ?? tx.submissionDate,
      transactionHash: tx.transactionHash ?? "",
      invoiceRef: tx.meta?.invoiceRef ?? "",
      title: tx.meta?.title ?? "",
    }));

    const csv = Papa.unparse(rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aegisvault-treasury-${workspace.address.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Header Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>Active Safe:</span>
          <AddressDisplay
            address={workspace.address}
            chainId={workspace.chainId}
            label={workspace.label}
            verified
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              void refetchInfo();
              void refetchBalances();
            }}
            className="h-8 bg-card text-xs"
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Refresh On-Chain
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            className="h-8 bg-card text-xs"
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* KPI Strip (4 Flat Cards) */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Total Liquid Value
          </p>
          {balancesLoading ? (
            <Skeleton className="mt-2 h-7 w-32" />
          ) : (
            <p className="mt-1.5 font-mono text-2xl font-semibold tracking-tight text-foreground tabular-nums">
              {formatUsdCents(balances?.totalUsdCents ?? 0n)}
            </p>
          )}
          <p className="mt-1 text-[11px] text-muted-foreground">
            Aggregated via single Multicall batch
          </p>
        </div>

        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Stablecoin Ratio
          </p>
          {balancesLoading ? (
            <Skeleton className="mt-2 h-7 w-24" />
          ) : (
            <p className="mt-1.5 font-mono text-2xl font-semibold tracking-tight text-foreground tabular-nums">
              {formatBpsAsPercent(balances?.stablecoinRatioBps ?? 0)}
            </p>
          )}
          <p className="mt-1 font-mono text-[11px] text-muted-foreground tabular-nums">
            {formatUsdCents(balances?.stablecoinUsdCents ?? 0n)} in stables
          </p>
        </div>

        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Signer Quorum & Nonce
          </p>
          {infoLoading ? (
            <Skeleton className="mt-2 h-7 w-28" />
          ) : (
            <div className="mt-1.5 flex items-baseline gap-2">
              <p className="font-mono text-2xl font-semibold tracking-tight text-foreground tabular-nums">
                {safeInfo?.threshold ?? 0} / {safeInfo?.owners.length ?? 0}
              </p>
              <StatusBadge tone="info" mono>
                Nonce #{safeInfo?.nonce ?? 0}
              </StatusBadge>
            </div>
          )}
          <p className="mt-1 font-mono text-[11px] text-muted-foreground tabular-nums">
            Safe v{safeInfo?.version ?? "1.4.1"}
          </p>
        </div>

        <div className="rounded-md border border-border bg-card p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Pending Queue
          </p>
          <div className="mt-1.5 flex items-baseline gap-2">
            <p className="font-mono text-2xl font-semibold tracking-tight text-foreground tabular-nums">
              {pendingTxs?.length ?? 0}
            </p>
            <Link
              href="/queue"
              className="text-xs font-medium text-foreground underline underline-offset-4 hover:text-muted-foreground"
            >
              Inspect Queue →
            </Link>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Awaiting co-signatures or execution
          </p>
        </div>
      </section>

      {/* Token Holdings Table */}
      <section className="rounded-md border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Treasury Token Holdings
            </h2>
            <p className="text-xs text-muted-foreground">
              Live on-chain ETH & ERC-20 custody balances
            </p>
          </div>
          <Link href="/batch-builder">
            <Button type="button" size="sm" className="h-8 text-xs">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              New Payout Batch
            </Button>
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Asset</th>
                <th className="px-4 py-2.5 text-right">Balance</th>
                <th className="px-4 py-2.5 text-right">Ref. Price</th>
                <th className="px-4 py-2.5 text-right">Value (USD)</th>
                <th className="px-4 py-2.5 text-right">Allocation</th>
                <th className="px-4 py-2.5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {balancesLoading ? (
                Array.from({ length: 4 }).map((_, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3" colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : (balances?.tokens ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-muted-foreground"
                  >
                    No tracked token balances found on this chain.
                  </td>
                </tr>
              ) : (
                (balances?.tokens ?? []).map((token) => (
                  <tr key={token.address} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {token.symbol}
                        </span>
                        <span className="text-muted-foreground">{token.name}</span>
                        {token.isStablecoin ? (
                          <StatusBadge tone="verified">Stable</StatusBadge>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <TokenAmount
                        amount={token.balance}
                        decimals={token.decimals}
                        symbol={token.symbol}
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground tabular-nums">
                      ${formatTokenAmount(token.priceMicroUsd, 6, 2)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-medium text-foreground tabular-nums">
                      {formatUsdCents(token.valueUsdCents)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-muted-foreground tabular-nums">
                      {formatBpsAsPercent(token.allocationBps)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/batch-builder?token=${encodeURIComponent(token.address)}`}
                      >
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          className="bg-card"
                        >
                          Add to Batch
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Historical Cashflow & Execution Activity Chart (Flat Recharts, Zero Gradients) */}
      <section className="rounded-md border border-border bg-card p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              Historical Treasury Activity
            </h2>
            <p className="text-xs text-muted-foreground">
              Monthly Safe executions & indexed transfer cadence
            </p>
          </div>
          <StatusBadge tone="info" mono>
            Source: {indexedHistory?.source === "ponder" ? "Ponder Indexer" : "Safe History"}
          </StatusBadge>
        </div>

        {chartData.length === 0 ? (
          <div className="flex h-52 items-center justify-center rounded border border-dashed border-border bg-muted/30 text-xs text-muted-foreground">
            No historical execution data indexed for this Safe yet. Run Ponder or
            execute a Safe transaction to populate activity charts.
          </div>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid stroke="#233044" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="period"
                  tick={{ fill: "#94A3B8", fontSize: 11 }}
                  axisLine={{ stroke: "#233044" }}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fill: "#94A3B8", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0F1623",
                    border: "1px solid #233044",
                    borderRadius: "4px",
                    boxShadow: "none",
                    color: "#F1F5F9",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="executions" name="Executions" fill="#10B981" radius={[2, 2, 0, 0]} />
                <Bar dataKey="inflowCount" name="Inflows" fill="#38BDF8" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      {/* Recent Executed Transactions Table */}
      <section className="rounded-md border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">
            Recent Executed Transactions
          </h2>
          <p className="text-xs text-muted-foreground">
            Decoded on-chain Safe executions reconciled with institutional Address Book
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-border bg-muted text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5">Nonce</th>
                <th className="px-4 py-2.5">Action / Memo</th>
                <th className="px-4 py-2.5">Recipient / Target</th>
                <th className="px-4 py-2.5 text-right">Value (ETH)</th>
                <th className="px-4 py-2.5">Executed</th>
                <th className="px-4 py-2.5 text-right">Tx</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {executedLoading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <tr key={idx}>
                    <td className="px-4 py-3" colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))
              ) : (executedTxs ?? []).length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-4 py-6 text-center text-muted-foreground"
                  >
                    No executed transactions returned by the Safe Transaction Service for
                    this Safe.
                  </td>
                </tr>
              ) : (
                (executedTxs ?? []).slice(0, 12).map((tx) => {
                  const bookEntry = resolveEntry(tx.to);
                  return (
                    <tr key={tx.safeTxHash} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-foreground tabular-nums">
                        #{tx.nonce}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/proposals/${tx.safeTxHash}`}
                            className="font-medium text-foreground hover:underline"
                          >
                            {tx.meta?.title ?? tx.decoded.summary}
                          </Link>
                          <StatusBadge
                            tone={tx.isSuccessful === false ? "critical" : "verified"}
                          >
                            {tx.isSuccessful === false ? "Reverted" : "Executed"}
                          </StatusBadge>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <AddressDisplay
                          address={tx.to}
                          chainId={workspace.chainId}
                          label={bookEntry?.label}
                          verified={Boolean(bookEntry)}
                        />
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">
                        {formatTokenAmount(BigInt(tx.value), 18, 4)} ETH
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground tabular-nums">
                        {(tx.executionDate ?? tx.submissionDate).slice(0, 10)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {tx.transactionHash ? (
                          <a
                            href={getExplorerTxUrl(
                              workspace.chainId,
                              tx.transactionHash
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 font-mono text-xs text-foreground underline underline-offset-4"
                          >
                            Explorer
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
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
