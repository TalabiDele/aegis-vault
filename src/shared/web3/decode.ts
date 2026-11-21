import { decodeFunctionData, getAddress, type Address, type Hex } from "viem";
import { erc20Abi, multiSendCallOnlyAbi, safeAbi } from "@/shared/web3/abis";
import { decodeMultiSendPackedBytes } from "@/shared/web3/multisend";

const nftApprovalAbi = [
  {
    type: "function",
    name: "setApprovalForAll",
    stateMutability: "nonpayable",
    inputs: [
      { name: "operator", type: "address" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

export interface DecodedArg {
  name: string;
  value: string;
}

export interface DecodedCallData {
  functionName: string;
  selector: Hex | null;
  standard: "NATIVE" | "ERC20" | "SAFE" | "MULTISEND" | "NFT" | "UNKNOWN";
  summary: string;
  args: DecodedArg[];
  nestedCalls: Array<{
    index: number;
    to: Address;
    value: string;
    operation: 0 | 1;
    data: Hex;
    decoded: DecodedCallData;
  }>;
}

export function decodeTransactionCalldata(
  to: Address,
  value: bigint,
  data: Hex,
  depth = 0
): DecodedCallData {
  if (!data || data === "0x") {
    return {
      functionName: value === 0n ? "emptyCall" : "nativeTransfer",
      selector: null,
      standard: "NATIVE",
      summary:
        value === 0n
          ? "Zero-value call (nonce rejection / signal)"
          : "Native ETH transfer",
      args: [
        { name: "recipient", value: getAddress(to) },
        { name: "valueWei", value: value.toString() },
      ],
      nestedCalls: [],
    };
  }

  const selector = (data.length >= 10 ? data.slice(0, 10) : data) as Hex;

  // 1. Try MultiSendCallOnly
  if (depth < 3) {
    try {
      const decoded = decodeFunctionData({
        abi: multiSendCallOnlyAbi,
        data,
      });
      if (decoded.functionName === "multiSend") {
        const packed = decoded.args[0];
        const inner = decodeMultiSendPackedBytes(packed);
        const nestedCalls = inner.map((item, idx) => ({
          index: idx,
          to: item.to,
          value: item.value.toString(),
          operation: item.operation,
          data: item.data,
          decoded: decodeTransactionCalldata(item.to, item.value, item.data, depth + 1),
        }));

        return {
          functionName: "multiSend",
          selector,
          standard: "MULTISEND",
          summary: `Batched MultiSend (${nestedCalls.length} ${nestedCalls.length === 1 ? "call" : "calls"})`,
          args: [{ name: "callCount", value: String(nestedCalls.length) }],
          nestedCalls,
        };
      }
    } catch {
      // Fall through to next ABI
    }
  }

  // 2. Try ERC-20
  try {
    const decoded = decodeFunctionData({
      abi: erc20Abi,
      data,
    });
    if (decoded.functionName === "transfer") {
      const [recipient, amount] = decoded.args;
      return {
        functionName: "transfer",
        selector,
        standard: "ERC20",
        summary: "ERC-20 Token Transfer",
        args: [
          { name: "to", value: getAddress(recipient) },
          { name: "amount", value: amount.toString() },
        ],
        nestedCalls: [],
      };
    }
    if (decoded.functionName === "approve") {
      const [spender, amount] = decoded.args;
      return {
        functionName: "approve",
        selector,
        standard: "ERC20",
        summary: amount === 0n ? "ERC-20 Revoke Approval" : "ERC-20 Token Approval",
        args: [
          { name: "spender", value: getAddress(spender) },
          { name: "amount", value: amount.toString() },
        ],
        nestedCalls: [],
      };
    }
  } catch {
    // Fall through
  }

  // 3. Try Safe governance functions
  try {
    const decoded = decodeFunctionData({
      abi: safeAbi,
      data,
    });
    if (decoded.functionName === "addOwnerWithThreshold") {
      const [owner, threshold] = decoded.args;
      return {
        functionName: "addOwnerWithThreshold",
        selector,
        standard: "SAFE",
        summary: `Add Safe Owner (threshold -> ${threshold.toString()})`,
        args: [
          { name: "owner", value: getAddress(owner) },
          { name: "_threshold", value: threshold.toString() },
        ],
        nestedCalls: [],
      };
    }
    if (decoded.functionName === "removeOwner") {
      const [prevOwner, owner, threshold] = decoded.args;
      return {
        functionName: "removeOwner",
        selector,
        standard: "SAFE",
        summary: `Remove Safe Owner (threshold -> ${threshold.toString()})`,
        args: [
          { name: "prevOwner", value: getAddress(prevOwner) },
          { name: "owner", value: getAddress(owner) },
          { name: "_threshold", value: threshold.toString() },
        ],
        nestedCalls: [],
      };
    }
    if (decoded.functionName === "changeThreshold") {
      const [threshold] = decoded.args;
      return {
        functionName: "changeThreshold",
        selector,
        standard: "SAFE",
        summary: `Change Quorum Threshold to ${threshold.toString()}`,
        args: [{ name: "_threshold", value: threshold.toString() }],
        nestedCalls: [],
      };
    }
  } catch {
    // Fall through
  }

  // 4. Try ERC-721 / ERC-1155 setApprovalForAll
  try {
    const decoded = decodeFunctionData({
      abi: nftApprovalAbi,
      data,
    });
    if (decoded.functionName === "setApprovalForAll") {
      const [operator, approved] = decoded.args;
      return {
        functionName: "setApprovalForAll",
        selector,
        standard: "NFT",
        summary: approved ? "Grant All NFT Approval" : "Revoke All NFT Approval",
        args: [
          { name: "operator", value: getAddress(operator) },
          { name: "approved", value: String(approved) },
        ],
        nestedCalls: [],
      };
    }
  } catch {
    // Unknown calldata
  }

  return {
    functionName: `unknown(${selector})`,
    selector,
    standard: "UNKNOWN",
    summary: `Contract Call (${selector})`,
    args: [{ name: "rawCalldataBytes", value: String((data.length - 2) / 2) }],
    nestedCalls: [],
  };
}
