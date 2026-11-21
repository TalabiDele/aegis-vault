import type { Address, Hex } from "viem";
import type { DecodedCallData } from "@/shared/web3/decode";
import type { TransactionRiskFinding } from "@/shared/web3/security";

export interface SafeWorkspaceConfig {
  id: string;
  label: string;
  address: Address;
  chainId: number;
  isDefault?: boolean;
}

export interface SafeInfo {
  address: Address;
  chainId: number;
  version: string;
  owners: Address[];
  threshold: number;
  nonce: number;
  fallbackHandler: Address | null;
  guardAddress: Address | null;
}

export interface SafeTokenBalance {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  isNative: boolean;
  isStablecoin: boolean;
  balance: bigint;
  priceMicroUsd: bigint;
  valueUsdCents: bigint;
  allocationBps: number;
}

export interface SafeConfirmationItem {
  owner: Address;
  submissionDate: string;
  signature: Hex;
}

export interface ProposalCommentItem {
  id: string;
  author: Address;
  body: string;
  createdAt: string;
}

export interface ProposalMetaItem {
  id: string;
  safeTxHash: Hex;
  nonce: number;
  title: string;
  description: string | null;
  invoiceRef: string | null;
  category: string;
  createdBy: Address;
  createdAt: string;
  comments: ProposalCommentItem[];
}

export interface SafeMultisigTransaction {
  safeTxHash: Hex;
  safe: Address;
  to: Address;
  value: string;
  data: Hex;
  operation: 0 | 1;
  nonce: number;
  confirmationsRequired: number;
  confirmations: SafeConfirmationItem[];
  isExecuted: boolean;
  isSuccessful: boolean | null;
  transactionHash: Hex | null;
  submissionDate: string;
  executionDate: string | null;
  decoded: DecodedCallData;
  risks: TransactionRiskFinding[];
  meta: ProposalMetaItem | null;
}

/**
 * Explicit 9-state transaction lifecycle machine (Section 10.10).
 */
export type TxLifecycleStatus =
  | "idle"
  | "simulating"
  | "awaiting_wallet_signature"
  | "user_rejected"
  | "proposed_offchain"
  | "pending_onchain"
  | "confirmed"
  | "reverted"
  | "wrong_network";

export interface TxLifecycleState {
  status: TxLifecycleStatus;
  message: string | null;
  safeTxHash?: Hex;
  txHash?: Hex;
}
