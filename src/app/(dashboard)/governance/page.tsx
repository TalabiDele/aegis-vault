"use client";

import { Plus, Shield, Trash2, UserMinus, UserPlus } from "lucide-react";
import { useState } from "react";
import { encodeFunctionData, getAddress, isAddress, type Address } from "viem";
import { useSafeInfo } from "@/entities/safe/use-safe-info";
import { useActiveSafeWorkspace } from "@/entities/safe/workspace.store";
import { AddressDisplay } from "@/entities/token/address-display";
import {
  useAddressBook,
  useSpendingPolicies,
} from "@/features/governance-ops/hooks/use-address-book";
import { SiweAuthGate } from "@/features/siwe-auth/ui/siwe-auth-gate";
import { useBatchCartStore } from "@/features/tx-proposal/model/batch-cart.store";
import { getTrackedTokensForChain } from "@/shared/config/tokens";
import { Button } from "@/shared/ui/button";
import { Checkbox } from "@/shared/ui/checkbox";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { StatusBadge } from "@/shared/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/ui/tabs";
import { safeAbi } from "@/shared/web3/abis";
import { formatTokenAmount, parseTokenAmount, truncateAddress } from "@/shared/web3/bigint";

const SENTINEL_OWNERS: Address = "0x0000000000000000000000000000000000000001";

export default function GovernancePage() {
  const workspace = useActiveSafeWorkspace();
  const { data: safeInfo } = useSafeInfo(workspace.address, workspace.chainId);
  const {
    entries: addressBook,
    resolveEntry,
    upsertEntry,
    isSaving: isSavingBook,
    deleteEntry,
  } = useAddressBook(workspace.chainId);
  const { policies, upsertPolicy, isSavingPolicy } = useSpendingPolicies(
    workspace.address,
    workspace.chainId
  );
  const { addItem, setOpen: setCartOpen } = useBatchCartStore();

  // Signer management form states
  const [newOwnerAddress, setNewOwnerAddress] = useState("");
  const [addOwnerThreshold, setAddOwnerThreshold] = useState("2");
  const [newThresholdValue, setNewThresholdValue] = useState("2");
  const [govError, setGovError] = useState<string | null>(null);

  // Address Book form states
  const [bookAddress, setBookAddress] = useState("");
  const [bookLabel, setBookLabel] = useState("");
  const [bookType, setBookType] = useState<"VENDOR" | "SIGNER" | "PROTOCOL" | "TREASURY">("VENDOR");
  const [bookNotes, setBookNotes] = useState("");
  const [bookError, setBookError] = useState<string | null>(null);

  // Spending Policy form states
  const trackedTokens = getTrackedTokensForChain(workspace.chainId);
  const [policyToken, setPolicyToken] = useState<string>(
    trackedTokens[1]?.address ?? trackedTokens[0]?.address ?? ""
  );
  const [policyMaxAmount, setPolicyMaxAmount] = useState("50000");
  const [policyRequiresMemo, setPolicyRequiresMemo] = useState(true);
  const [policyError, setPolicyError] = useState<string | null>(null);

  const owners = safeInfo?.owners ?? [];
  const currentThreshold = safeInfo?.threshold ?? 1;

  function handleQueueAddOwner(e: React.FormEvent) {
    e.preventDefault();
    setGovError(null);
    if (!isAddress(newOwnerAddress.trim())) {
      setGovError("Enter a valid Ethereum address for the new signer.");
      return;
    }
    const thresholdNum = Number(addOwnerThreshold);
    if (!Number.isInteger(thresholdNum) || thresholdNum < 1) {
      setGovError("Threshold must be a positive integer.");
      return;
    }
    const owner = getAddress(newOwnerAddress.trim());
    const data = encodeFunctionData({
      abi: safeAbi,
      functionName: "addOwnerWithThreshold",
      args: [owner, BigInt(thresholdNum)],
    });

    addItem({
      kind: "governance",
      title: `Add Signer ${truncateAddress(owner)}`,
      subtitle: `Set quorum threshold to ${thresholdNum}`,
      to: workspace.address,
      value: "0",
      data,
    });
    setNewOwnerAddress("");
    setCartOpen(true);
  }

  function handleQueueRemoveOwner(ownerToRemove: Address, index: number) {
    const prevOwner = index === 0 ? SENTINEL_OWNERS : (owners[index - 1] ?? SENTINEL_OWNERS);
    const nextMaxOwners = Math.max(1, owners.length - 1);
    const nextThreshold = Math.min(currentThreshold, nextMaxOwners);

    const data = encodeFunctionData({
      abi: safeAbi,
      functionName: "removeOwner",
      args: [prevOwner, ownerToRemove, BigInt(nextThreshold)],
    });

    addItem({
      kind: "governance",
      title: `Remove Signer ${truncateAddress(ownerToRemove)}`,
      subtitle: `Resulting quorum threshold: ${nextThreshold}`,
      to: workspace.address,
      value: "0",
      data,
    });
    setCartOpen(true);
  }

  function handleQueueChangeThreshold(e: React.FormEvent) {
    e.preventDefault();
    setGovError(null);
    const thresholdNum = Number(newThresholdValue);
    if (
      !Number.isInteger(thresholdNum) ||
      thresholdNum < 1 ||
      (owners.length > 0 && thresholdNum > owners.length)
    ) {
      setGovError(
        `Threshold must be between 1 and ${Math.max(1, owners.length)}.`
      );
      return;
    }
    const data = encodeFunctionData({
      abi: safeAbi,
      functionName: "changeThreshold",
      args: [BigInt(thresholdNum)],
    });

    addItem({
      kind: "governance",
      title: `Change Quorum Threshold to ${thresholdNum}`,
      subtitle: `Updates Safe signing requirement from ${currentThreshold} to ${thresholdNum}`,
      to: workspace.address,
      value: "0",
      data,
    });
    setCartOpen(true);
  }

  async function handleSaveAddressBook(e: React.FormEvent) {
    e.preventDefault();
    setBookError(null);
    if (!isAddress(bookAddress.trim())) {
      setBookError("Enter a valid EVM counterparty address.");
      return;
    }
    if (bookLabel.trim().length < 2) {
      setBookError("Label must be at least 2 characters.");
      return;
    }

    try {
      await upsertEntry({
        safeAddress: workspace.address,
        safeChainId: workspace.chainId,
        address: getAddress(bookAddress.trim()),
        chainId: null,
        label: bookLabel.trim(),
        entityType: bookType,
        notes: bookNotes.trim() || undefined,
      });
      setBookAddress("");
      setBookLabel("");
      setBookNotes("");
    } catch (err) {
      setBookError(
        err instanceof Error ? err.message : "Failed to save address book entry."
      );
    }
  }

  async function handleSavePolicy(e: React.FormEvent) {
    e.preventDefault();
    setPolicyError(null);
    const token = trackedTokens.find(
      (t) => t.address.toLowerCase() === policyToken.toLowerCase()
    );
    if (!token) {
      setPolicyError("Select a valid token.");
      return;
    }

    let maxWei: bigint;
    try {
      maxWei = parseTokenAmount(policyMaxAmount, token.decimals);
    } catch {
      setPolicyError("Enter a valid positive decimal limit.");
      return;
    }

    try {
      await upsertPolicy({
        safeAddress: workspace.address,
        chainId: workspace.chainId,
        tokenAddress: token.address,
        maxSingleTxWei: maxWei.toString(),
        requiresMemo: policyRequiresMemo,
      });
    } catch (err) {
      setPolicyError(
        err instanceof Error ? err.message : "Failed to save spending policy."
      );
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      {/* Safe Security Posture Card */}
      <section className="rounded-md border border-border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-foreground" />
            <h2 className="text-sm font-semibold text-foreground">
              Safe Smart Account Security Posture
            </h2>
          </div>
          <StatusBadge tone="verified" mono>
            Safe v{safeInfo?.version ?? "1.4.1"}
          </StatusBadge>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded border border-border bg-background p-3">
            <p className="text-[11px] text-muted-foreground">Signing Threshold</p>
            <p className="mt-1 font-mono text-lg font-semibold text-foreground tabular-nums">
              {currentThreshold} of {owners.length}
            </p>
          </div>
          <div className="rounded border border-border bg-background p-3">
            <p className="text-[11px] text-muted-foreground">On-Chain Nonce</p>
            <p className="mt-1 font-mono text-lg font-semibold text-foreground tabular-nums">
              #{safeInfo?.nonce ?? 0}
            </p>
          </div>
          <div className="rounded border border-border bg-background p-3">
            <p className="text-[11px] text-muted-foreground">Fallback Handler</p>
            <div className="mt-1">
              {safeInfo?.fallbackHandler ? (
                <AddressDisplay
                  address={safeInfo.fallbackHandler}
                  chainId={workspace.chainId}
                />
              ) : (
                <span className="font-mono text-xs text-muted-foreground">None</span>
              )}
            </div>
          </div>
          <div className="rounded border border-border bg-background p-3">
            <p className="text-[11px] text-muted-foreground">Transaction Guard</p>
            <div className="mt-1">
              {safeInfo?.guardAddress ? (
                <AddressDisplay
                  address={safeInfo.guardAddress}
                  chainId={workspace.chainId}
                />
              ) : (
                <StatusBadge tone="info">No Guard Attached</StatusBadge>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Governance Operations Tabs */}
      <Tabs defaultValue="signers" className="space-y-4">
        <TabsList className="border border-border bg-card">
          <TabsTrigger value="signers" className="text-xs">
            Signers & Threshold
          </TabsTrigger>
          <TabsTrigger value="address-book" className="text-xs">
            Institutional Address Book ({addressBook.length})
          </TabsTrigger>
          <TabsTrigger value="policies" className="text-xs">
            Spending Policy Warnings ({policies.length})
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Signers & Threshold */}
        <TabsContent value="signers" className="space-y-4">
          {govError ? (
            <div className="rounded-md border border-[#881337] bg-[#2D0E14] p-3 text-xs text-[#FB7185]">
              {govError}
            </div>
          ) : null}

          <div className="rounded-md border border-border bg-card">
            <div className="border-b border-border px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground">
                Authorized Safe Signers ({owners.length})
              </h3>
            </div>
            <div className="divide-y divide-border">
              {owners.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  No on-chain owners loaded for this Safe yet. Verify RPC connectivity
                  or Safe address.
                </div>
              ) : (
                owners.map((owner, idx) => {
                  const book = resolveEntry(owner);
                  return (
                    <div
                      key={owner}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-mono text-xs text-muted-foreground tabular-nums">
                          #{idx + 1}
                        </span>
                        <AddressDisplay
                          address={owner}
                          chainId={workspace.chainId}
                          label={book?.label}
                          verified={Boolean(book)}
                          full
                        />
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="xs"
                        disabled={owners.length <= 1}
                        onClick={() => handleQueueRemoveOwner(owner, idx)}
                        className="border-[#881337] bg-card text-[#FB7185] hover:bg-[#2D0E14]"
                      >
                        <UserMinus className="mr-1 h-3 w-3" />
                        Queue Remove
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Add Owner Form */}
            <form
              onSubmit={handleQueueAddOwner}
              className="space-y-3 rounded-md border border-border bg-card p-4"
            >
              <h3 className="text-sm font-semibold text-foreground">
                Queue Add Owner (`addOwnerWithThreshold`)
              </h3>
              <div className="space-y-1">
                <Label htmlFor="new-owner" className="text-xs">
                  New Signer Address
                </Label>
                <Input
                  id="new-owner"
                  value={newOwnerAddress}
                  onChange={(e) => setNewOwnerAddress(e.target.value)}
                  placeholder="0x..."
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="add-threshold" className="text-xs">
                  Resulting Threshold
                </Label>
                <Input
                  id="add-threshold"
                  type="number"
                  min={1}
                  value={addOwnerThreshold}
                  onChange={(e) => setAddOwnerThreshold(e.target.value)}
                  className="h-8 font-mono text-xs tabular-nums"
                />
              </div>
              <Button type="submit" size="sm" className="w-full text-xs">
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                Queue Add Owner Proposal
              </Button>
            </form>

            {/* Change Threshold Form */}
            <form
              onSubmit={handleQueueChangeThreshold}
              className="space-y-3 rounded-md border border-border bg-card p-4"
            >
              <h3 className="text-sm font-semibold text-foreground">
                Queue Quorum Change (`changeThreshold`)
              </h3>
              <div className="space-y-1">
                <Label htmlFor="change-threshold" className="text-xs">
                  New Required Confirmations (1 – {Math.max(1, owners.length)})
                </Label>
                <Input
                  id="change-threshold"
                  type="number"
                  min={1}
                  max={Math.max(1, owners.length)}
                  value={newThresholdValue}
                  onChange={(e) => setNewThresholdValue(e.target.value)}
                  className="h-8 font-mono text-xs tabular-nums"
                />
              </div>
              <Button type="submit" size="sm" className="w-full text-xs">
                Queue Threshold Change
              </Button>
            </form>
          </div>
        </TabsContent>

        {/* Tab 2: Institutional Address Book (SIWE Protected) */}
        <TabsContent value="address-book" className="space-y-4">
          <SiweAuthGate actionDescription="add or remove verified counterparties in the Institutional Address Book">
            <form
              onSubmit={(e) => void handleSaveAddressBook(e)}
              className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-5"
            >
              <div className="space-y-1 md:col-span-2">
                <Label htmlFor="ab-address" className="text-xs">
                  Counterparty Address
                </Label>
                <Input
                  id="ab-address"
                  value={bookAddress}
                  onChange={(e) => setBookAddress(e.target.value)}
                  placeholder="0x..."
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ab-label" className="text-xs">
                  Verified Label
                </Label>
                <Input
                  id="ab-label"
                  value={bookLabel}
                  onChange={(e) => setBookLabel(e.target.value)}
                  placeholder="e.g. AWS Settlement"
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="ab-type" className="text-xs">
                  Entity Type
                </Label>
                <select
                  id="ab-type"
                  value={bookType}
                  onChange={(e) =>
                    setBookType(
                      e.target.value as "VENDOR" | "SIGNER" | "PROTOCOL" | "TREASURY"
                    )
                  }
                  className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs"
                >
                  <option value="VENDOR">VENDOR</option>
                  <option value="SIGNER">SIGNER</option>
                  <option value="PROTOCOL">PROTOCOL</option>
                  <option value="TREASURY">TREASURY</option>
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSavingBook}
                  className="h-8 w-full text-xs"
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Save Entry
                </Button>
              </div>
              {bookError ? (
                <p className="text-xs text-[#FB7185] md:col-span-5">{bookError}</p>
              ) : null}
            </form>
          </SiweAuthGate>

          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Label</th>
                  <th className="px-4 py-2.5">Type</th>
                  <th className="px-4 py-2.5">Address</th>
                  <th className="px-4 py-2.5">Notes</th>
                  <th className="px-4 py-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {addressBook.length === 0 ? (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      No verified Address Book entries yet. Seed PostgreSQL or add an
                      entry above.
                    </td>
                  </tr>
                ) : (
                  addressBook.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-2.5 font-medium text-foreground">
                        {entry.label}
                      </td>
                      <td className="px-4 py-2.5">
                        <StatusBadge tone="info" mono>
                          {entry.entityType}
                        </StatusBadge>
                      </td>
                      <td className="px-4 py-2.5">
                        <AddressDisplay
                          address={entry.address}
                          chainId={workspace.chainId}
                        />
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {entry.notes ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() =>
                            void deleteEntry({
                              id: entry.id,
                              safeAddress: workspace.address,
                              safeChainId: workspace.chainId,
                            })
                          }
                          className="text-[#FB7185] hover:bg-[#2D0E14]"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Tab 3: Spending Policy Warnings (SIWE Protected) */}
        <TabsContent value="policies" className="space-y-4">
          <SiweAuthGate actionDescription="configure institutional spending policy soft-warning limits">
            <form
              onSubmit={(e) => void handleSavePolicy(e)}
              className="grid grid-cols-1 gap-3 rounded-md border border-border bg-card p-4 md:grid-cols-4"
            >
              <div className="space-y-1">
                <Label htmlFor="pol-token" className="text-xs">
                  Token
                </Label>
                <select
                  id="pol-token"
                  value={policyToken}
                  onChange={(e) => setPolicyToken(e.target.value)}
                  className="h-8 w-full rounded-md border border-input bg-card px-2 text-xs"
                >
                  {trackedTokens.map((t) => (
                    <option key={t.address} value={t.address}>
                      {t.symbol} ({t.name})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="pol-max" className="text-xs">
                  Max Single-Tx Warning Limit
                </Label>
                <Input
                  id="pol-max"
                  value={policyMaxAmount}
                  onChange={(e) => setPolicyMaxAmount(e.target.value)}
                  className="h-8 font-mono text-xs tabular-nums"
                />
              </div>
              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2 text-xs text-foreground">
                  <Checkbox
                    checked={policyRequiresMemo}
                    onCheckedChange={(c) => setPolicyRequiresMemo(Boolean(c))}
                  />
                  Require invoice/memo
                </label>
              </div>
              <div className="flex items-end">
                <Button
                  type="submit"
                  size="sm"
                  disabled={isSavingPolicy}
                  className="h-8 w-full text-xs"
                >
                  Save Policy Rule
                </Button>
              </div>
              {policyError ? (
                <p className="text-xs text-[#FB7185] md:col-span-4">{policyError}</p>
              ) : null}
            </form>
          </SiweAuthGate>

          <div className="overflow-x-auto rounded-md border border-border bg-card">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-muted text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5">Token</th>
                  <th className="px-4 py-2.5 text-right">Max Single-Tx Threshold</th>
                  <th className="px-4 py-2.5">Invoice / Memo Required</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {policies.length === 0 ? (
                  <tr>
                    <td
                      colSpan={3}
                      className="px-4 py-6 text-center text-muted-foreground"
                    >
                      No spending policy rules configured for this Safe yet.
                    </td>
                  </tr>
                ) : (
                  policies.map((pol) => {
                    const token = trackedTokens.find(
                      (t) =>
                        t.address.toLowerCase() === pol.tokenAddress.toLowerCase()
                    );
                    return (
                      <tr key={pol.id}>
                        <td className="px-4 py-2.5 font-medium text-foreground">
                          {token?.symbol ?? truncateAddress(pol.tokenAddress)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {formatTokenAmount(
                            BigInt(pol.maxSingleTxWei),
                            token?.decimals ?? 18,
                            2
                          )}{" "}
                          {token?.symbol ?? ""}
                        </td>
                        <td className="px-4 py-2.5">
                          <StatusBadge tone={pol.requiresMemo ? "verified" : "info"}>
                            {pol.requiresMemo ? "Required" : "Optional"}
                          </StatusBadge>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
