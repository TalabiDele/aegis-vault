"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import type { Address } from "viem";

export interface AddressBookItem {
  id: string;
  address: Address;
  chainId: number | null;
  label: string;
  entityType: "VENDOR" | "SIGNER" | "PROTOCOL" | "TREASURY";
  notes: string | null;
  verifiedBy: Address;
  createdAt: string;
}

export interface SpendingPolicyItem {
  id: string;
  safeId: string;
  tokenAddress: Address;
  maxSingleTxWei: string;
  requiresMemo: boolean;
}

export interface WorkspaceRecord {
  id: string;
  label: string;
  address: Address;
  chainId: number;
  isDefault: boolean;
  spendingPolicies: SpendingPolicyItem[];
}

export function useAddressBook(chainId?: number) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["address-book", chainId ?? "all"],
    staleTime: 30_000,
    queryFn: async (): Promise<AddressBookItem[]> => {
      const url = chainId
        ? `/api/address-book?chainId=${chainId}`
        : "/api/address-book";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { entries?: AddressBookItem[] };
      return data.entries ?? [];
    },
  });

  const labelMap = useMemo(() => {
    const map = new Map<string, AddressBookItem>();
    for (const entry of query.data ?? []) {
      map.set(entry.address.toLowerCase(), entry);
    }
    return map;
  }, [query.data]);

  const upsertMutation = useMutation({
    mutationFn: async (payload: {
      safeAddress: Address;
      safeChainId: number;
      address: Address;
      chainId: number | null;
      label: string;
      entityType: "VENDOR" | "SIGNER" | "PROTOCOL" | "TREASURY";
      notes?: string;
    }) => {
      const res = await fetch("/api/address-book", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { entry?: AddressBookItem; error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save address book entry.");
      }
      return data.entry;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["address-book"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      safeAddress: Address;
      safeChainId: number;
    }) => {
      const res = await fetch("/api/address-book", {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to delete address book entry.");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["address-book"] });
    },
  });

  return {
    entries: query.data ?? [],
    labelMap,
    resolveEntry: (address: string) => labelMap.get(address.toLowerCase()) ?? null,
    isLoading: query.isLoading,
    upsertEntry: upsertMutation.mutateAsync,
    isSaving: upsertMutation.isPending,
    deleteEntry: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
  };
}

export function useSpendingPolicies(safeAddress: Address, chainId: number) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["workspaces-policies"],
    staleTime: 30_000,
    queryFn: async (): Promise<WorkspaceRecord[]> => {
      const res = await fetch("/api/workspaces", { cache: "no-store" });
      if (!res.ok) {
        return [];
      }
      const data = (await res.json()) as { workspaces?: WorkspaceRecord[] };
      return data.workspaces ?? [];
    },
  });

  const policies = useMemo(() => {
    const match = (query.data ?? []).find(
      (w) =>
        w.address.toLowerCase() === safeAddress.toLowerCase() &&
        w.chainId === chainId
    );
    return match?.spendingPolicies ?? [];
  }, [chainId, query.data, safeAddress]);

  const upsertPolicyMutation = useMutation({
    mutationFn: async (payload: {
      safeAddress: Address;
      chainId: number;
      tokenAddress: Address;
      maxSingleTxWei: string;
      requiresMemo: boolean;
    }) => {
      const res = await fetch("/api/workspaces", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save spending policy.");
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["workspaces-policies"] });
    },
  });

  return {
    workspaces: query.data ?? [],
    policies,
    isLoading: query.isLoading,
    upsertPolicy: upsertPolicyMutation.mutateAsync,
    isSavingPolicy: upsertPolicyMutation.isPending,
  };
}
