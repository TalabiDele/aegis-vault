"use client";

import { getAddress, type Address } from "viem";
import { create } from "zustand";
import { getPublicEnv } from "@/shared/config/env";
import type { SafeWorkspaceConfig } from "./types";

const DEFAULT_WORKSPACES: SafeWorkspaceConfig[] = [
  {
    id: "default-base-treasury",
    label: "Primary Operating Treasury",
    address: getAddress("0x10A19e7eE7d7F8a52822f6817de8ea18204F2e4f"),
    chainId: getPublicEnv().NEXT_PUBLIC_DEFAULT_CHAIN_ID,
    isDefault: true,
  },
  {
    id: "default-sepolia-sandbox",
    label: "Sepolia Staging Vault",
    address: getAddress("0x10A19e7eE7d7F8a52822f6817de8ea18204F2e4f"),
    chainId: 11155111,
  },
  {
    id: "default-anvil-fork",
    label: "Local Anvil Mainnet Fork",
    address: getAddress("0x10A19e7eE7d7F8a52822f6817de8ea18204F2e4f"),
    chainId: 31337,
  },
];

interface SafeWorkspaceState {
  workspaces: SafeWorkspaceConfig[];
  activeWorkspaceId: string;
  setActiveWorkspace: (id: string) => void;
  setWorkspaces: (list: SafeWorkspaceConfig[]) => void;
  addWorkspace: (workspace: SafeWorkspaceConfig) => void;
}

export const useSafeWorkspaceStore = create<SafeWorkspaceState>((set) => ({
  workspaces: DEFAULT_WORKSPACES,
  activeWorkspaceId: DEFAULT_WORKSPACES[0]?.id ?? "default-base-treasury",
  setActiveWorkspace: (id) => set({ activeWorkspaceId: id }),
  setWorkspaces: (list) =>
    set((state) => {
      if (list.length === 0) {
        return state;
      }
      const exists = list.some((w) => w.id === state.activeWorkspaceId);
      return {
        workspaces: list,
        activeWorkspaceId: exists
          ? state.activeWorkspaceId
          : (list[0]?.id ?? state.activeWorkspaceId),
      };
    }),
  addWorkspace: (workspace) =>
    set((state) => {
      const exists = state.workspaces.some(
        (w) =>
          w.address.toLowerCase() === workspace.address.toLowerCase() &&
          w.chainId === workspace.chainId
      );
      if (exists) {
        return { activeWorkspaceId: workspace.id };
      }
      return {
        workspaces: [...state.workspaces, workspace],
        activeWorkspaceId: workspace.id,
      };
    }),
}));

export function useActiveSafeWorkspace(): SafeWorkspaceConfig {
  const workspaces = useSafeWorkspaceStore((s) => s.workspaces);
  const activeId = useSafeWorkspaceStore((s) => s.activeWorkspaceId);
  return (
    workspaces.find((w) => w.id === activeId) ??
    workspaces[0] ?? {
      id: "fallback",
      label: "Primary Operating Treasury",
      address: getAddress("0x10A19e7eE7d7F8a52822f6817de8ea18204F2e4f"),
      chainId: 8453,
    }
  );
}
