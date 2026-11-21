"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Layers,
  Plus,
  Upload,
} from "lucide-react";
import Papa from "papaparse";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { encodeFunctionData, getAddress, isAddress, zeroAddress, type Address } from "viem";
import { z } from "zod";
import { useSafeBalances } from "@/entities/safe/use-safe-balances";
import { useActiveSafeWorkspace } from "@/entities/safe/workspace.store";
import {
  useAddressBook,
  useSpendingPolicies,
} from "@/features/governance-ops/hooks/use-address-book";
import { useBatchCartStore } from "@/features/tx-proposal/model/batch-cart.store";
import { getTrackedTokensForChain } from "@/shared/config/tokens";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { StatusBadge } from "@/shared/ui/status-badge";
import { erc20Abi } from "@/shared/web3/abis";
import { formatTokenAmount, parseTokenAmount, truncateAddress } from "@/shared/web3/bigint";

const singlePayoutSchema = z.object({
  tokenAddress: z
    .string()
    .refine((v) => Boolean(isAddress(v)), "Select a valid token"),
  recipient: z
    .string()
    .trim()
    .refine((v) => Boolean(isAddress(v)), "Enter a valid EIP-55 recipient address"),
  amount: z
    .string()
    .trim()
    .regex(/^\d+(?:\.\d+)?$/, "Enter a valid positive decimal amount")
    .refine((v) => Number(v) > 0, "Amount must be greater than zero"),
  memo: z.string().trim().max(160).optional(),
  invoiceRef: z.string().trim().max(80).optional(),
});

type SinglePayoutFormValues = z.infer<typeof singlePayoutSchema>;

interface CsvPreviewRow {
  rowNumber: number;
  recipient: string;
  tokenSymbol: string;
  tokenAddress: Address | null;
  decimals: number;
  amountStr: string;
  amountWei: bigint | null;
  memo: string;
  error: string | null;
}

export default function BatchBuilderPage() {
  const workspace = useActiveSafeWorkspace();
  const { data: balances } = useSafeBalances(workspace.address, workspace.chainId);
  const { entries: addressBook } = useAddressBook(workspace.chainId);
  const { policies } = useSpendingPolicies(workspace.address, workspace.chainId);
  const { items: cartItems, addItem, addItems, setOpen: setCartOpen } =
    useBatchCartStore();

  const trackedTokens = getTrackedTokensForChain(workspace.chainId);
  const [policyWarning, setPolicyWarning] = useState<string | null>(null);
  const [csvRows, setCsvRows] = useState<CsvPreviewRow[]>([]);

  const form = useForm<SinglePayoutFormValues>({
    resolver: zodResolver(singlePayoutSchema),
    defaultValues: {
      tokenAddress: trackedTokens[0]?.address ?? zeroAddress,
      recipient: "",
      amount: "",
      memo: "",
      invoiceRef: "",
    },
  });

  function onSubmitSingle(values: SinglePayoutFormValues) {
    setPolicyWarning(null);
    const token = trackedTokens.find(
      (t) => t.address.toLowerCase() === values.tokenAddress.toLowerCase()
    );
    if (!token) return;

    const recipient = getAddress(values.recipient);
    const rawAmount = parseTokenAmount(values.amount, token.decimals);

    // Soft Spending Policy Check
    const policy = policies.find(
      (p) => p.tokenAddress.toLowerCase() === token.address.toLowerCase()
    );
    if (policy) {
      if (rawAmount > BigInt(policy.maxSingleTxWei)) {
        setPolicyWarning(
          `Policy Notice: ${values.amount} ${token.symbol} exceeds the configured single-tx limit of ${formatTokenAmount(BigInt(policy.maxSingleTxWei), token.decimals, 2)} ${token.symbol}.`
        );
      } else if (policy.requiresMemo && !values.memo && !values.invoiceRef) {
        setPolicyWarning(
          `Policy Notice: Spending policy for ${token.symbol} recommends attaching a memo or invoice reference.`
        );
      }
    }

    if (token.isNative) {
      addItem({
        kind: "payout",
        title: `Send ${values.amount} ${token.symbol}`,
        subtitle: values.memo || `To ${truncateAddress(recipient)}`,
        to: recipient,
        value: rawAmount.toString(),
        data: "0x",
        memo: values.memo,
        invoiceRef: values.invoiceRef,
        tokenSymbol: token.symbol,
        formattedAmount: values.amount,
        recipientAddress: recipient,
      });
    } else {
      const data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [recipient, rawAmount],
      });
      addItem({
        kind: "payout",
        title: `Send ${values.amount} ${token.symbol}`,
        subtitle: values.memo || `To ${truncateAddress(recipient)}`,
        to: token.address,
        value: "0",
        data,
        memo: values.memo,
        invoiceRef: values.invoiceRef,
        tokenSymbol: token.symbol,
        formattedAmount: values.amount,
        recipientAddress: recipient,
      });
    }

    form.reset({
      tokenAddress: values.tokenAddress,
      recipient: "",
      amount: "",
      memo: "",
      invoiceRef: "",
    });
  }

  function handleCsvFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const preview: CsvPreviewRow[] = result.data.map((row, idx) => {
          const recipientRaw = (row.recipient ?? "").trim();
          const tokenRaw = (row.token ?? "ETH").trim();
          const amountRaw = (row.amount ?? "").trim();
          const memo = (row.memo ?? "").trim();

          if (!isAddress(recipientRaw)) {
            return {
              rowNumber: idx + 1,
              recipient: recipientRaw || "(empty)",
              tokenSymbol: tokenRaw,
              tokenAddress: null,
              decimals: 18,
              amountStr: amountRaw,
              amountWei: null,
              memo,
              error: "Invalid EVM recipient address",
            };
          }

          const token = trackedTokens.find(
            (t) =>
              t.symbol.toLowerCase() === tokenRaw.toLowerCase() ||
              t.address.toLowerCase() === tokenRaw.toLowerCase()
          );

          if (!token) {
            return {
              rowNumber: idx + 1,
              recipient: getAddress(recipientRaw),
              tokenSymbol: tokenRaw,
              tokenAddress: null,
              decimals: 18,
              amountStr: amountRaw,
              amountWei: null,
              memo,
              error: `Unsupported token "${tokenRaw}" on active chain`,
            };
          }

          let amountWei: bigint;
          try {
            amountWei = parseTokenAmount(amountRaw, token.decimals);
            if (amountWei <= 0n) {
              throw new Error("Amount must be > 0");
            }
          } catch {
            return {
              rowNumber: idx + 1,
              recipient: getAddress(recipientRaw),
              tokenSymbol: token.symbol,
              tokenAddress: token.address,
              decimals: token.decimals,
              amountStr: amountRaw,
              amountWei: null,
              memo,
              error: "Invalid numeric amount",
            };
          }

          const balanceEntry = balances?.tokens.find(
            (b) => b.address.toLowerCase() === token.address.toLowerCase()
          );
          const insufficient =
            balanceEntry !== undefined && amountWei > balanceEntry.balance;

          return {
            rowNumber: idx + 1,
            recipient: getAddress(recipientRaw),
            tokenSymbol: token.symbol,
            tokenAddress: token.address,
            decimals: token.decimals,
            amountStr: amountRaw,
            amountWei,
            memo,
            error: insufficient
              ? `Exceeds current Safe ${token.symbol} balance`
              : null,
          };
        });

        setCsvRows(preview);
      },
    });
  }

  function handleImportValidCsvRows() {
    const validRows = csvRows.filter(
      (r) => !r.error && r.tokenAddress && r.amountWei !== null
    );
    if (validRows.length === 0) return;

    addItems(
      validRows.map((row) => {
        const recipient = getAddress(row.recipient);
        const isNative = row.tokenAddress === zeroAddress;
        const rawAmount = row.amountWei!;

        if (isNative) {
          return {
            kind: "payout" as const,
            title: `Send ${row.amountStr} ${row.tokenSymbol}`,
            subtitle: row.memo || `CSV Row #${row.rowNumber}`,
            to: recipient,
            value: rawAmount.toString(),
            data: "0x" as const,
            memo: row.memo,
            tokenSymbol: row.tokenSymbol,
            formattedAmount: row.amountStr,
            recipientAddress: recipient,
          };
        }

        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [recipient, rawAmount],
        });

        return {
          kind: "payout" as const,
          title: `Send ${row.amountStr} ${row.tokenSymbol}`,
          subtitle: row.memo || `CSV Row #${row.rowNumber}`,
          to: row.tokenAddress!,
          value: "0",
          data,
          memo: row.memo,
          tokenSymbol: row.tokenSymbol,
          formattedAmount: row.amountStr,
          recipientAddress: recipient,
        };
      })
    );

    setCsvRows([]);
    setCartOpen(true);
  }

  const validCsvCount = csvRows.filter((r) => !r.error).length;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-foreground">
            Multi-Payout & CSV Batch Builder
          </h2>
          <p className="text-xs text-muted-foreground">
            Construct atomic MultiSendCallOnly payouts with pure BigInt unit parsing
            and pre-execution simulation.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => setCartOpen(true)}
          className="h-8 text-xs"
        >
          <Layers className="mr-1.5 h-3.5 w-3.5" />
          Simulate & Propose Batch ({cartItems.length})
        </Button>
      </div>

      {policyWarning ? (
        <div className="flex items-start gap-2 rounded-md border border-[#78350F] bg-[#2A1F08] p-3 text-xs text-[#FBBF24]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{policyWarning}</span>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Single Payout Entry Form */}
        <section className="rounded-md border border-border bg-card p-5">
          <div className="mb-4 border-b border-border pb-3">
            <h3 className="text-sm font-semibold text-foreground">
              Add Single Payout Call
            </h3>
            <p className="text-xs text-muted-foreground">
              Validated with EIP-55 checksum and viem parseUnits (zero floating-point math)
            </p>
          </div>

          <form
            onSubmit={form.handleSubmit(onSubmitSingle)}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="tokenAddress" className="text-xs">
                Asset
              </Label>
              <select
                id="tokenAddress"
                {...form.register("tokenAddress")}
                className="h-9 w-full rounded-md border border-input bg-card px-2.5 text-xs text-foreground"
              >
                {trackedTokens.map((token) => {
                  const bal = balances?.tokens.find(
                    (b) => b.address.toLowerCase() === token.address.toLowerCase()
                  );
                  return (
                    <option key={token.address} value={token.address}>
                      {token.symbol} — {token.name} (Bal:{" "}
                      {bal ? formatTokenAmount(bal.balance, token.decimals, 4) : "0"})
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="recipient" className="text-xs">
                  Recipient Address
                </Label>
                {addressBook.length > 0 ? (
                  <select
                    aria-label="Fill from Address Book"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        form.setValue("recipient", e.target.value, {
                          shouldValidate: true,
                        });
                      }
                    }}
                    className="h-6 rounded border border-border bg-muted px-1.5 text-[11px] text-foreground"
                  >
                    <option value="">Address Book Quick-Fill…</option>
                    {addressBook.map((entry) => (
                      <option key={entry.id} value={entry.address}>
                        {entry.label} ({truncateAddress(entry.address)})
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
              <Input
                id="recipient"
                {...form.register("recipient")}
                placeholder="0x..."
                className="h-9 font-mono text-xs"
              />
              {form.formState.errors.recipient ? (
                <p className="text-xs text-[#FB7185]">
                  {form.formState.errors.recipient.message}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="amount" className="text-xs">
                  Amount
                </Label>
                <Input
                  id="amount"
                  {...form.register("amount")}
                  placeholder="0.00"
                  className="h-9 font-mono text-xs tabular-nums"
                />
                {form.formState.errors.amount ? (
                  <p className="text-xs text-[#FB7185]">
                    {form.formState.errors.amount.message}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="invoiceRef" className="text-xs">
                  Invoice Ref (Optional)
                </Label>
                <Input
                  id="invoiceRef"
                  {...form.register("invoiceRef")}
                  placeholder="INV-2026-042"
                  className="h-9 font-mono text-xs"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="memo" className="text-xs">
                Internal Memo (Optional)
              </Label>
              <Input
                id="memo"
                {...form.register("memo")}
                placeholder="e.g. Q4 Infrastructure Retainer"
                className="h-9 text-xs"
              />
            </div>

            <Button type="submit" size="sm" className="w-full">
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Add Payout to Batch Cart
            </Button>
          </form>
        </section>

        {/* CSV Bulk Import */}
        <section className="rounded-md border border-border bg-card p-5">
          <div className="mb-4 border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 text-foreground" />
              <h3 className="text-sm font-semibold text-foreground">
                CSV Bulk Payroll / Vendor Import
              </h3>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Expected columns:{" "}
              <span className="font-mono text-foreground">
                recipient,token,amount,memo
              </span>
            </p>
          </div>

          <label className="flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/30 px-4 py-8 text-center transition-colors hover:border-border-active">
            <Upload className="mb-2 h-5 w-5 text-muted-foreground" />
            <span className="text-xs font-medium text-foreground">
              Click to select a .csv payout schedule
            </span>
            <span className="mt-1 text-[11px] text-muted-foreground">
              Parsed locally in browser via PapaParse with row-by-row validation
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFileUpload}
              className="hidden"
            />
          </label>

          {csvRows.length > 0 ? (
            <div className="mt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-foreground">
                  Validation Preview ({validCsvCount} / {csvRows.length} valid)
                </span>
                <Button
                  type="button"
                  size="xs"
                  disabled={validCsvCount === 0}
                  onClick={handleImportValidCsvRows}
                >
                  Queue {validCsvCount} Valid Rows
                </Button>
              </div>

              <div className="max-h-60 overflow-y-auto rounded border border-border">
                <table className="w-full text-left text-[11px]">
                  <thead className="border-b border-border bg-muted text-muted-foreground">
                    <tr>
                      <th className="px-2.5 py-1.5">#</th>
                      <th className="px-2.5 py-1.5">Recipient</th>
                      <th className="px-2.5 py-1.5 text-right">Amount</th>
                      <th className="px-2.5 py-1.5">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {csvRows.map((row) => (
                      <tr key={row.rowNumber}>
                        <td className="px-2.5 py-1.5 font-mono tabular-nums">
                          {row.rowNumber}
                        </td>
                        <td className="px-2.5 py-1.5 font-mono tabular-nums">
                          {truncateAddress(row.recipient)}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-mono tabular-nums">
                          {row.amountStr} {row.tokenSymbol}
                        </td>
                        <td className="px-2.5 py-1.5">
                          {row.error ? (
                            <StatusBadge tone="critical">{row.error}</StatusBadge>
                          ) : (
                            <StatusBadge tone="verified">
                              <CheckCircle2 className="h-3 w-3" />
                              Valid
                            </StatusBadge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
