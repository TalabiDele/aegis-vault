import { getAddress, type Address, type Hex } from "viem";
import { isCanonicalDelegateCallTarget } from "@/shared/config/safe-deployments";
import { isUnlimitedAllowance } from "@/shared/web3/bigint";
import { decodeTransactionCalldata, type DecodedCallData } from "@/shared/web3/decode";

export type RiskSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";

export interface TransactionRiskFinding {
  severity: RiskSeverity;
  code: string;
  title: string;
  detail: string;
}

export interface RiskAnalysisInput {
  chainId: number;
  safeAddress: Address;
  to: Address;
  value: bigint;
  data: Hex;
  operation: 0 | 1;
  verifiedAddresses?: ReadonlySet<string>;
}

function inspectDecoded(
  chainId: number,
  safeAddress: Address,
  to: Address,
  value: bigint,
  operation: 0 | 1,
  decoded: DecodedCallData,
  verifiedAddresses: ReadonlySet<string>,
  findings: TransactionRiskFinding[],
  prefix = ""
) {
  const normalizedSafe = getAddress(safeAddress);
  const normalizedTo = getAddress(to);

  // 1. DELEGATECALL Firewall
  if (operation === 1 && !isCanonicalDelegateCallTarget(chainId, normalizedTo)) {
    findings.push({
      severity: "CRITICAL",
      code: "NON_CANONICAL_DELEGATECALL",
      title: `${prefix}Non-Canonical DELEGATECALL Detected`,
      detail: `Target ${normalizedTo} is not a canonical Safe v1.4.1 MultiSendCallOnly contract. Executing DELEGATECALL against arbitrary code can overwrite Safe storage and drain all funds.`,
    });
  }

  // 2. Self-transfer rejection / cancellation tx
  if (normalizedTo === normalizedSafe && value === 0n && decoded.standard === "NATIVE") {
    findings.push({
      severity: "INFO",
      code: "SELF_REJECTION_TX",
      title: `${prefix}On-Chain Nonce Rejection Transaction`,
      detail:
        "Zero-value self-transfer to the Safe. Executing this transaction cancels all competing proposals sharing the same nonce.",
    });
  }

  // 3. Unlimited ERC-20 Approval
  if (decoded.standard === "ERC20" && decoded.functionName === "approve") {
    const amountArg = decoded.args.find((a) => a.name === "amount");
    const spenderArg = decoded.args.find((a) => a.name === "spender");
    if (amountArg) {
      try {
        const amountBig = BigInt(amountArg.value);
        if (isUnlimitedAllowance(amountBig)) {
          findings.push({
            severity: "CRITICAL",
            code: "UNLIMITED_ERC20_APPROVAL",
            title: `${prefix}Unlimited ERC-20 Allowance (maxUint256)`,
            detail: `Grants ${spenderArg?.value ?? "unknown spender"} unlimited spending authority on token ${normalizedTo}. Prefer exact-amount approvals.`,
          });
        }
      } catch {
        // Ignore unparseable amount
      }
    }
  }

  // 4. NFT setApprovalForAll(operator, true)
  if (decoded.standard === "NFT" && decoded.functionName === "setApprovalForAll") {
    const approvedArg = decoded.args.find((a) => a.name === "approved");
    const operatorArg = decoded.args.find((a) => a.name === "operator");
    if (approvedArg?.value === "true") {
      findings.push({
        severity: "HIGH",
        code: "NFT_SET_APPROVAL_FOR_ALL",
        title: `${prefix}Blanket NFT Collection Approval`,
        detail: `Grants ${operatorArg?.value ?? "operator"} full transfer rights over all tokens in collection ${normalizedTo}.`,
      });
    }
  }

  // 5. Safe Governance Mutation
  if (decoded.standard === "SAFE") {
    findings.push({
      severity: "HIGH",
      code: "SAFE_GOVERNANCE_MUTATION",
      title: `${prefix}Safe Ownership / Quorum Modification`,
      detail: `${decoded.summary}. Carefully verify all owner addresses and resulting signing threshold.`,
    });
  }

  // 6. Unverified recipient / target check
  const recipientToCheck =
    decoded.standard === "ERC20" && decoded.functionName === "transfer"
      ? (decoded.args.find((a) => a.name === "to")?.value ?? normalizedTo)
      : normalizedTo;

  const isSelfOrCanonical =
    recipientToCheck.toLowerCase() === normalizedSafe.toLowerCase() ||
    isCanonicalDelegateCallTarget(chainId, recipientToCheck);

  if (
    !isSelfOrCanonical &&
    decoded.standard !== "MULTISEND" &&
    verifiedAddresses.size > 0 &&
    !verifiedAddresses.has(recipientToCheck.toLowerCase())
  ) {
    findings.push({
      severity: "MEDIUM",
      code: "UNVERIFIED_COUNTERPARTY",
      title: `${prefix}Unverified Counterparty Address`,
      detail: `Address ${recipientToCheck} is not present in the organization's verified Address Book.`,
    });
  }

  // 7. Recurse into MultiSend nested calls
  for (const nested of decoded.nestedCalls) {
    inspectDecoded(
      chainId,
      safeAddress,
      nested.to,
      BigInt(nested.value),
      nested.operation,
      nested.decoded,
      verifiedAddresses,
      findings,
      `[Call #${nested.index + 1}] `
    );
  }
}

export function analyzeTransactionRisk(
  input: RiskAnalysisInput
): { decoded: DecodedCallData; risks: TransactionRiskFinding[] } {
  const decoded = decodeTransactionCalldata(input.to, input.value, input.data);
  const findings: TransactionRiskFinding[] = [];
  const verifiedSet = input.verifiedAddresses ?? new Set<string>();

  inspectDecoded(
    input.chainId,
    input.safeAddress,
    input.to,
    input.value,
    input.operation,
    decoded,
    verifiedSet,
    findings
  );

  return { decoded, risks: findings };
}
