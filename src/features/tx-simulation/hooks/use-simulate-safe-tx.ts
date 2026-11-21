"use client";

import { useMutation } from "@tanstack/react-query";
import type { SimulationRequest, SimulationResponse } from "../lib/types";

export function useSimulateSafeTx() {
  return useMutation({
    mutationFn: async (input: SimulationRequest): Promise<SimulationResponse> => {
      const response = await fetch("/api/simulate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
        cache: "no-store",
      });

      const payload = (await response.json()) as SimulationResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Pre-execution simulation failed.");
      }

      return payload;
    },
  });
}
