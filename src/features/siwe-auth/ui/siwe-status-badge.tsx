"use client";

import { KeyRound, LogOut, ShieldCheck } from "lucide-react";
import { useAccount } from "wagmi";
import { Button } from "@/shared/ui/button";
import { StatusBadge } from "@/shared/ui/status-badge";
import { useSiweSession } from "../hooks/use-siwe-session";
import { useSiweSignIn } from "../hooks/use-siwe-sign-in";

export function SiweStatusBadge() {
  const { isConnected } = useAccount();
  const { isAuthenticated, isLoading, logout, isLoggingOut } = useSiweSession();
  const { signIn, isSigningIn } = useSiweSignIn();

  if (!isConnected) {
    return (
      <StatusBadge tone="info" className="hidden sm:inline-flex">
        Wallet Disconnected
      </StatusBadge>
    );
  }

  if (isLoading) {
    return (
      <StatusBadge tone="info" className="hidden sm:inline-flex">
        Checking Session…
      </StatusBadge>
    );
  }

  if (isAuthenticated) {
    return (
      <div className="inline-flex items-center gap-1.5">
        <StatusBadge tone="verified">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Session Verified</span>
        </StatusBadge>
        <Button
          type="button"
          variant="outline"
          size="xs"
          onClick={() => void logout()}
          disabled={isLoggingOut}
          aria-label="Sign out of SIWE session"
          className="h-6 border-border bg-card px-1.5 text-muted-foreground hover:text-foreground"
        >
          <LogOut className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={isSigningIn}
      onClick={() => {
        void signIn().catch(() => {
          // User rejection handled gracefully without clearing app state
        });
      }}
      className="h-8 border-[#FDE68A] bg-[#FFFBEB] text-xs font-medium text-[#92400E] hover:bg-[#FEF3C7]"
    >
      <KeyRound className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
      {isSigningIn ? "Awaiting Signature…" : "Sign In to Edit Metadata"}
    </Button>
  );
}
