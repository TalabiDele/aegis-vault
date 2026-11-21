"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import {
  AlertTriangle,
  ArrowRightLeft,
  ChevronDown,
  FileStack,
  Landmark,
  Layers,
  Menu,
  Plus,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { getAddress, isAddress } from "viem";
import { useAccount, useChainId, useSwitchChain } from "wagmi";
import { useSafeInfo } from "@/entities/safe/use-safe-info";
import {
  useActiveSafeWorkspace,
  useSafeWorkspaceStore,
} from "@/entities/safe/workspace.store";
import { useSafeAllowances } from "@/features/allowance-auditor/hooks/use-safe-allowances";
import { SiweStatusBadge } from "@/features/siwe-auth/ui/siwe-status-badge";
import { usePendingSafeTransactions } from "@/features/tx-proposal/hooks/use-safe-transactions";
import { useBatchCartStore } from "@/features/tx-proposal/model/batch-cart.store";
import { getChainMetadata, SUPPORTED_CHAINS } from "@/shared/config/chains";
import { cn } from "@/shared/lib/utils";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { Label } from "@/shared/ui/label";
import { Sheet, SheetContent } from "@/shared/ui/sheet";
import { StatusBadge } from "@/shared/ui/status-badge";
import { truncateAddress } from "@/shared/web3/bigint";
import { BatchCartDrawer } from "@/widgets/batch-cart-drawer/batch-cart-drawer";

interface NavItem {
  href: string;
  label: string;
  icon: typeof Landmark;
  badgeCount?: number;
  badgeTone?: "info" | "pending" | "critical";
}

const ROUTE_TITLES: Record<string, string> = {
  "/treasury": "Treasury Overview",
  "/queue": "Multi-Sig Transaction Queue",
  "/batch-builder": "Multi-Payout & CSV Batch Builder",
  "/allowances": "ERC-20 Allowance Auditor",
  "/governance": "Signers, Policies & Address Book",
};

function resolvePageTitle(pathname: string): string {
  if (pathname.startsWith("/proposals/")) {
    return "Proposal Audit & Simulation";
  }
  return ROUTE_TITLES[pathname] ?? "Institutional Treasury";
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [addSafeOpen, setAddSafeOpen] = useState(false);
  const [newSafeLabel, setNewSafeLabel] = useState("");
  const [newSafeAddress, setNewSafeAddress] = useState("");
  const [newSafeChainId, setNewSafeChainId] = useState<number>(8453);
  const [addSafeError, setAddSafeError] = useState<string | null>(null);

  const workspace = useActiveSafeWorkspace();
  const { workspaces, setActiveWorkspace, addWorkspace } = useSafeWorkspaceStore();
  const { items: batchItems, setOpen: setBatchCartOpen } = useBatchCartStore();

  const { address: connectedAddress, isConnected } = useAccount();
  const walletChainId = useChainId();
  const { switchChain, isPending: isSwitchingChain } = useSwitchChain();

  const { data: safeInfo } = useSafeInfo(workspace.address, workspace.chainId);
  const { data: pendingTxs } = usePendingSafeTransactions(
    workspace.address,
    workspace.chainId,
    safeInfo?.nonce
  );
  const { data: allowances } = useSafeAllowances(
    workspace.address,
    workspace.chainId
  );

  const pendingCount = pendingTxs?.length ?? 0;
  const unlimitedCount =
    allowances?.filter((a) => a.isUnlimited).length ?? 0;

  const isWrongNetwork = isConnected && walletChainId !== workspace.chainId;
  const isOwner = Boolean(
    connectedAddress &&
      safeInfo?.owners.some(
        (o) => o.toLowerCase() === connectedAddress.toLowerCase()
      )
  );
  const isReadOnlySigner =
    isConnected &&
    !isWrongNetwork &&
    safeInfo !== undefined &&
    safeInfo.owners.length > 0 &&
    !isOwner;

  const chainMeta = getChainMetadata(workspace.chainId);

  const navItems: NavItem[] = [
    { href: "/treasury", label: "Treasury", icon: Landmark },
    {
      href: "/queue",
      label: "Queue",
      icon: FileStack,
      badgeCount: pendingCount > 0 ? pendingCount : undefined,
      badgeTone: "pending",
    },
    { href: "/batch-builder", label: "Batch Builder", icon: Layers },
    {
      href: "/allowances",
      label: "Allowances",
      icon: ShieldAlert,
      badgeCount: unlimitedCount > 0 ? unlimitedCount : undefined,
      badgeTone: "critical",
    },
    { href: "/governance", label: "Governance", icon: SlidersHorizontal },
  ];

  function handleAddCustomSafe(e: React.FormEvent) {
    e.preventDefault();
    setAddSafeError(null);
    const trimmedAddr = newSafeAddress.trim();
    if (!isAddress(trimmedAddr)) {
      setAddSafeError("Enter a valid Ethereum Safe address.");
      return;
    }
    const checksummed = getAddress(trimmedAddr);
    addWorkspace({
      id: `custom-${newSafeChainId}-${checksummed.toLowerCase()}`,
      label: newSafeLabel.trim() || `Safe ${truncateAddress(checksummed)}`,
      address: checksummed,
      chainId: newSafeChainId,
    });
    setNewSafeLabel("");
    setNewSafeAddress("");
    setAddSafeOpen(false);
    setSwitcherOpen(false);
  }

  const sidebarContent = (
    <div className="flex h-full flex-col bg-card">
      {/* Brand Header */}
      <div className="flex h-14 items-center gap-2.5 border-b border-border px-4">
        <div className="flex h-7 w-7 items-center justify-center rounded border border-primary bg-primary text-primary-foreground">
          <Shield className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <p className="text-sm font-semibold tracking-tight text-foreground">
            AegisVault
          </p>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Institutional Safe
          </p>
        </div>
      </div>

      {/* Safe Workspace Switcher */}
      <div className="border-b border-border p-3">
        <button
          type="button"
          onClick={() => setSwitcherOpen((prev) => !prev)}
          className="flex w-full items-center justify-between rounded-md border border-border bg-background px-2.5 py-2 text-left transition-colors hover:border-border-active"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-xs font-semibold text-foreground">
                {workspace.label}
              </span>
              {safeInfo && safeInfo.owners.length > 0 ? (
                <span className="shrink-0 rounded border border-border bg-card px-1.5 py-0.2 font-mono text-[10px] font-medium text-foreground tabular-nums">
                  {safeInfo.threshold} / {safeInfo.owners.length}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-muted-foreground tabular-nums">
              {truncateAddress(workspace.address)}
            </p>
          </div>
          <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>

        {switcherOpen ? (
          <div className="mt-2 space-y-1 rounded-md border border-border bg-card p-1.5">
            {workspaces.map((ws) => {
              const meta = getChainMetadata(ws.chainId);
              const active = ws.id === workspace.id;
              return (
                <button
                  key={ws.id}
                  type="button"
                  onClick={() => {
                    setActiveWorkspace(ws.id);
                    setSwitcherOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-xs transition-colors",
                    active
                      ? "bg-muted font-medium text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs text-foreground">{ws.label}</p>
                    <p className="font-mono text-[10px] text-muted-foreground tabular-nums">
                      {truncateAddress(ws.address)}
                    </p>
                  </div>
                  <StatusBadge tone="info" className="ml-2 text-[10px]">
                    {meta?.shortName ?? ws.chainId}
                  </StatusBadge>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setAddSafeOpen(true)}
              className="flex w-full items-center gap-1.5 rounded border-t border-border px-2 pt-2 pb-1 text-xs font-medium text-foreground hover:bg-muted/60"
            >
              <Plus className="h-3.5 w-3.5" />
              Watch Custom Safe…
            </button>
          </div>
        ) : null}
      </div>

      {/* Primary Navigation */}
      <nav className="flex-1 space-y-1 p-3" aria-label="Primary Navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href === "/queue" && pathname.startsWith("/proposals/"));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileNavOpen(false)}
              className={cn(
                "flex items-center justify-between rounded-md border px-3 py-2 text-xs font-medium transition-colors",
                active
                  ? "border-border bg-muted text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </span>
              {item.badgeCount !== undefined ? (
                <StatusBadge tone={item.badgeTone ?? "info"} mono>
                  {item.badgeCount}
                </StatusBadge>
              ) : null}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Active Network Status */}
      <div className="border-t border-border p-3">
        <div className="flex items-center justify-between rounded-md border border-border bg-background px-2.5 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                chainMeta?.isLocal
                  ? "bg-[#D97706]"
                  : "bg-[#10B981]"
              )}
            />
            <span className="font-medium text-foreground">
              {chainMeta?.shortName ?? `Chain ${workspace.chainId}`}
            </span>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
            #{workspace.chainId}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop Fixed Left Sidebar (240px) */}
      <aside className="hidden w-[240px] shrink-0 border-r border-border md:block">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Mobile Slide-Over Sidebar */}
      <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
        <SheetContent side="left" className="w-[260px] p-0 shadow-none">
          {sidebarContent}
        </SheetContent>
      </Sheet>

      {/* Main Content Area */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar (56px, 1px bottom border) */}
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-3 border-b border-border bg-card px-4 lg:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="rounded border border-border p-1.5 text-foreground md:hidden"
            >
              <Menu className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span>AegisVault</span>
                <span>/</span>
                <span className="truncate">{workspace.label}</span>
              </div>
              <h1 className="truncate text-sm font-semibold text-foreground">
                {resolvePageTitle(pathname)}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Batch Cart Drawer Trigger */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setBatchCartOpen(true)}
              className="h-8 border-border bg-card text-xs font-medium"
            >
              <Layers className="mr-1.5 h-3.5 w-3.5" />
              <span className="hidden sm:inline">Batch Cart</span>
              <span className="ml-1.5 rounded border border-border bg-muted px-1.5 py-0.2 font-mono text-[11px] font-semibold text-foreground tabular-nums">
                {batchItems.length}
              </span>
            </Button>

            {/* SIWE Session Status Badge */}
            <SiweStatusBadge />

            {/* RainbowKit Compact Connect Button */}
            <ConnectButton
              accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
              chainStatus="icon"
              showBalance={false}
            />
          </div>
        </header>

        {/* Global Network / Read-Only Guard Banner */}
        {isWrongNetwork ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#78350F] bg-[#2A1F08] px-4 py-2 text-xs text-[#FBBF24] lg:px-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>
                <strong>Wrong Network:</strong> Connected wallet is on chain{" "}
                <span className="font-mono tabular-nums">{walletChainId}</span>,
                but the active Safe is deployed on{" "}
                <strong>{chainMeta?.shortName ?? workspace.chainId}</strong> (
                <span className="font-mono tabular-nums">{workspace.chainId}</span>).
              </span>
            </div>
            <Button
              type="button"
              size="xs"
              disabled={isSwitchingChain}
              onClick={() => switchChain({ chainId: workspace.chainId })}
              className="border border-[#78350F] bg-[#D97706] text-white hover:bg-[#B45309]"
            >
              <ArrowRightLeft className="mr-1 h-3 w-3" />
              {isSwitchingChain ? "Switching…" : "Switch Network"}
            </Button>
          </div>
        ) : null}

        {isReadOnlySigner ? (
          <div className="flex items-center gap-2 border-b border-[#334155] bg-[#161F30] px-4 py-2 text-xs text-[#CBD5E1] lg:px-6">
            <Shield className="h-4 w-4 shrink-0" />
            <span>
              <strong>Read-Only Mode:</strong> Connected wallet{" "}
              <span className="font-mono tabular-nums">
                {connectedAddress ? truncateAddress(connectedAddress) : ""}
              </span>{" "}
              is not an on-chain owner of this Safe. Simulations and audit views remain
              available.
            </span>
          </div>
        ) : null}

        {/* Page Viewport */}
        <main className="flex-1 p-4 lg:p-6">{children}</main>
      </div>

      {/* Persistent Right Batch Cart Drawer */}
      <BatchCartDrawer />

      {/* Watch Custom Safe Dialog */}
      <Dialog open={addSafeOpen} onOpenChange={setAddSafeOpen}>
        <DialogContent className="border-border bg-card shadow-none sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold">
              Watch Custom Safe Smart Account
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Load any Safe v1.4.1 address on Mainnet, Base, Arbitrum, Sepolia, or your
              local Anvil fork.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddCustomSafe} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="safe-label" className="text-xs">
                Workspace Label
              </Label>
              <Input
                id="safe-label"
                value={newSafeLabel}
                onChange={(e) => setNewSafeLabel(e.target.value)}
                placeholder="e.g. Ops Treasury Vault"
                className="h-8 text-xs"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="safe-address" className="text-xs">
                Safe Address (EIP-55)
              </Label>
              <Input
                id="safe-address"
                value={newSafeAddress}
                onChange={(e) => setNewSafeAddress(e.target.value)}
                placeholder="0x..."
                className="h-8 font-mono text-xs"
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="safe-chain" className="text-xs">
                Network
              </Label>
              <select
                id="safe-chain"
                value={newSafeChainId}
                onChange={(e) => setNewSafeChainId(Number(e.target.value))}
                className="h-8 w-full rounded-md border border-input bg-card px-2.5 text-xs text-foreground"
              >
                {SUPPORTED_CHAINS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.id})
                  </option>
                ))}
              </select>
            </div>
            {addSafeError ? (
              <p className="text-xs font-medium text-[#FB7185]">{addSafeError}</p>
            ) : null}
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setAddSafeOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Load Safe
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
