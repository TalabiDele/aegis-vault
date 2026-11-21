import type { Address, Hex } from "viem";
import type { DecodedCallData } from "@/shared/web3/decode";
import type { TransactionRiskFinding } from "@/shared/web3/security";

export interface SimulationRequest {
  chainId: number;
  safeAddress: Address;
  signerAddress: Address;
  to: Address;
  value: string;
  data: Hex;
  operation: 0 | 1;
}

export interface SimulatedAssetChange {
  tokenSymbol: string;
  tokenAddress: string;
  from: string;
  to: string;
  rawAmount: string;
  formattedAmount: string;
  dollarValue?: string;
  direction: "IN" | "OUT";
}

export interface SimulatedCallNode {
  type: string;
  from: string;
  to: string;
  functionName?: string;
  value: string;
  gasUsed?: number;
  error?: string | null;
  calls: SimulatedCallNode[];
}

export interface SimulationResponse {
  success: boolean;
  engine: "tenderly" | "evm_state_override";
  gasUsed: number | null;
  revertReason: string | null;
  assetChanges: SimulatedAssetChange[];
  callTrace: SimulatedCallNode | null;
  decoded: DecodedCallData;
  risks: TransactionRiskFinding[];
}
