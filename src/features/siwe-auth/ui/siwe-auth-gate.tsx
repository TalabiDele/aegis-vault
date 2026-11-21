"use client";

import type { ReactNode } from "react";
import { KeyRound, ShieldAlert } from "lucide-react";
import { useAccount } from "wagmi";
import { Button } from "@/shared/ui/button";
import { useSiweSession } from "../hooks/use-siwe-session";
import { useSiweSignIn } from "../hooks/use-siwe-sign-in";

export interface SiweAuthGateProps {
  children: ReactNode;
  actionDescription?: string;
}

export function SiweAuthGate({
  children,
  actionDescription = "modify institutional metadata, address book entries, or audit comments",
}: SiweAuthGateProps) {
  const { isConnected } = useAccount();
  const { isAuthenticated, isLoading } = useSiweSession();
  const { signIn, isSigningIn, error } = useSiweSignIn();

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="rounded-md border border-border bg-muted/60 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2.5">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-[#FBBF24]" />
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-foreground">
              SIWE Session Required
            </p>
            <p className="text-xs text-muted-foreground">
              Verify wallet ownership with a gasless EIP-4361 signature to{" "}
              {actionDescription}.
            </p>
            {error ? (
              <p className="text-xs font-medium text-[#FB7185]">{error}</p>
            ) : null}
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={!isConnected || isLoading || isSigningIn}
          onClick={() => {
            void signIn().catch(() => {
              // Error already captured in mutation state
            });
          }}
          className="shrink-0 bg-primary text-primary-foreground hover:bg-[#34D399]"
        >
          <KeyRound className="mr-1.5 h-3.5 w-3.5" />
          {!isConnected
            ? "Connect Wallet First"
            : isSigningIn
              ? "Awaiting Signature…"
              : "Sign In with Ethereum"}
        </Button>
      </div>
    </div>
  );
}
