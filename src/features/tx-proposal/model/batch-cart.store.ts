"use client";

import type { Address, Hex } from "viem";
import { create } from "zustand";

export type BatchCartItemKind = "payout" | "revoke" | "governance" | "custom";

export interface BatchCartItem {
  id: string;
  kind: BatchCartItemKind;
  title: string;
  subtitle: string;
  to: Address;
  value: string; // Stringified BigInt wei, never Float
  data: Hex;
  memo?: string;
  invoiceRef?: string;
  tokenSymbol?: string;
  formattedAmount?: string;
  recipientAddress?: Address;
}

interface BatchCartState {
  items: BatchCartItem[];
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  addItem: (item: Omit<BatchCartItem, "id">) => void;
  addItems: (items: Array<Omit<BatchCartItem, "id">>) => void;
  removeItem: (id: string) => void;
  moveItem: (index: number, direction: "up" | "down") => void;
  clearCart: () => void;
}

function createCartId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const useBatchCartStore = create<BatchCartState>((set) => ({
  items: [],
  isOpen: false,
  setOpen: (open) => set({ isOpen: open }),
  addItem: (item) =>
    set((state) => ({
      items: [...state.items, { ...item, id: createCartId() }],
    })),
  addItems: (newItems) =>
    set((state) => ({
      items: [
        ...state.items,
        ...newItems.map((item) => ({ ...item, id: createCartId() })),
      ],
    })),
  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),
  moveItem: (index, direction) =>
    set((state) => {
      const targetIndex = direction === "up" ? index - 1 : index + 1;
      if (
        index < 0 ||
        targetIndex < 0 ||
        index >= state.items.length ||
        targetIndex >= state.items.length
      ) {
        return state;
      }
      const next = [...state.items];
      const current = next[index];
      const swapped = next[targetIndex];
      if (!current || !swapped) {
        return state;
      }
      next[index] = swapped;
      next[targetIndex] = current;
      return { items: next };
    }),
  clearCart: () => set({ items: [] }),
}));
