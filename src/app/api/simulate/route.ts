import { NextRequest, NextResponse } from "next/server";
import {
  concatHex,
  encodeFunctionData,
  getAddress,
  isAddress,
  isHex,
  padHex,
  zeroAddress,
  type Address,
  type Hex,
} from "viem";
import { z } from "zod";
import type {
  SimulatedAssetChange,
  SimulatedCallNode,
  SimulationResponse,
} from "@/features/tx-simulation/lib/types";
import { isSupportedChainId } from "@/shared/config/chains";
import { getTenderlyConfig } from "@/shared/config/env";
import { getTrackedTokensForChain } from "@/shared/config/tokens";
import { prisma } from "@/shared/db/prisma";
import { checkRateLimit, extractClientIp } from "@/shared/lib/rate-limit";
import { safeAbi } from "@/shared/web3/abis";
import { formatTokenAmount } from "@/shared/web3/bigint";
import type { DecodedCallData } from "@/shared/web3/decode";
import { analyzeTransactionRisk } from "@/shared/web3/security";
import { getServerPublicClient } from "@/shared/web3/server-client";

const SAFE_THRESHOLD_STORAGE_SLOT: Hex =
  "0x0000000000000000000000000000000000000000000000000000000000000004";
const STORAGE_VALUE_ONE: Hex =
  "0x0000000000000000000000000000000000000000000000000000000000000001";

const simulateRequestSchema = z.object({
  chainId: z.number().int().positive(),
  safeAddress: z
    .string()
    .refine((v): v is Address => isAddress(v), "Invalid safeAddress"),
  signerAddress: z
    .string()
    .refine((v): v is Address => isAddress(v), "Invalid signerAddress"),
  to: z.string().refine((v): v is Address => isAddress(v), "Invalid target address"),
  value: z.string().regex(/^\d+$/, "value must be a non-negative wei string"),
  data: z
    .string()
    .refine((v): v is Hex => isHex(v), "data must be a valid hex string"),
  operation: z.union([z.literal(0), z.literal(1)]),
});

/**
 * Builds a pre-validated Safe signature (v = 1) for `signerAddress`:
 *   r = pad(signerAddress, 32)
 *   s = 32 zero bytes
 *   v = 0x01
 */
function buildPreValidatedSignature(signerAddress: Address): Hex {
  const r = padHex(getAddress(signerAddress) as Hex, { size: 32 });
  const s = padHex("0x0", { size: 32 });
  const v: Hex = "0x01";
  return concatHex([r, s, v]);
}

interface TenderlyCallTraceRaw {
  type?: string;
  from?: string;
  to?: string;
  function_name?: string;
  value?: string;
  gas_used?: number;
  error?: string | null;
  calls?: TenderlyCallTraceRaw[];
}

interface TenderlyAssetChangeRaw {
  token_info?: {
    symbol?: string;
    contract_address?: string;
  };
  from?: string;
  to?: string;
  raw_amount?: string;
  amount?: string;
  dollar_value?: string;
}

interface TenderlySimulateRaw {
  transaction?: {
    status?: boolean;
    gas_used?: number;
    error_message?: string;
    transaction_info?: {
      asset_changes?: TenderlyAssetChangeRaw[];
      call_trace?: TenderlyCallTraceRaw;
    };
  };
}

function mapTenderlyCallTrace(node: TenderlyCallTraceRaw | undefined): SimulatedCallNode | null {
  if (!node) {
    return null;
  }
  return {
    type: node.type ?? "CALL",
    from: node.from ?? zeroAddress,
    to: node.to ?? zeroAddress,
    functionName: node.function_name,
    value: node.value ?? "0",
    gasUsed: node.gas_used,
    error: node.error ?? null,
    calls: (node.calls ?? [])
      .map((child) => mapTenderlyCallTrace(child))
      .filter((child): child is SimulatedCallNode => child !== null),
  };
}

function inferStaticAssetChanges(
  chainId: number,
  safeAddress: Address,
  to: Address,
  value: bigint,
  decoded: DecodedCallData
): SimulatedAssetChange[] {
  const changes: SimulatedAssetChange[] = [];
  const tracked = getTrackedTokensForChain(chainId);

  const collect = (target: Address, val: bigint, d: DecodedCallData) => {
    if (val > 0n) {
      changes.push({
        tokenSymbol: "ETH",
        tokenAddress: zeroAddress,
        from: safeAddress,
        to: target,
        rawAmount: val.toString(),
        formattedAmount: formatTokenAmount(val, 18, 6),
        direction: target.toLowerCase() === safeAddress.toLowerCase() ? "IN" : "OUT",
      });
    }

    if (d.standard === "ERC20" && d.functionName === "transfer") {
      const recipient = d.args.find((a) => a.name === "to")?.value ?? zeroAddress;
      const rawAmount = d.args.find((a) => a.name === "amount")?.value ?? "0";
      const tokenMeta = tracked.find(
        (t) => t.address.toLowerCase() === target.toLowerCase()
      );
      const decimals = tokenMeta?.decimals ?? 18;
      changes.push({
        tokenSymbol: tokenMeta?.symbol ?? "ERC20",
        tokenAddress: target,
        from: safeAddress,
        to: recipient,
        rawAmount,
        formattedAmount: formatTokenAmount(BigInt(rawAmount), decimals, 6),
        direction:
          recipient.toLowerCase() === safeAddress.toLowerCase() ? "IN" : "OUT",
      });
    }

    for (const nested of d.nestedCalls) {
      collect(nested.to, BigInt(nested.value), nested.decoded);
    }
  };

  collect(to, value, decoded);
  return changes;
}

export async function POST(request: NextRequest) {
  const ip = extractClientIp(request.headers);
  const limit = checkRateLimit(`simulate:${ip}`, 60, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Simulation rate limit exceeded" },
      { status: 429 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const parsed = simulateRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid simulation request", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const req = parsed.data;
  if (!isSupportedChainId(req.chainId)) {
    return NextResponse.json(
      { error: `Unsupported chainId: ${req.chainId}` },
      { status: 400 }
    );
  }

  const safeAddress = getAddress(req.safeAddress);
  const signerAddress = getAddress(req.signerAddress);
  const targetAddress = getAddress(req.to);
  const valueBigInt = BigInt(req.value);

  // Load verified addresses from PostgreSQL (gracefully fallback to empty set if DB offline)
  const verifiedAddresses = new Set<string>();
  try {
    const entries = await prisma.addressBookEntry.findMany({
      where: {
        OR: [{ chainId: null }, { chainId: req.chainId }],
      },
      select: { address: true },
    });
    for (const entry of entries) {
      verifiedAddresses.add(entry.address.toLowerCase());
    }
  } catch {
    // Database optional during pure local Anvil runs
  }

  const { decoded, risks } = analyzeTransactionRisk({
    chainId: req.chainId,
    safeAddress,
    to: targetAddress,
    value: valueBigInt,
    data: req.data,
    operation: req.operation,
    verifiedAddresses,
  });

  const preValidatedSig = buildPreValidatedSignature(signerAddress);
  const execTxCalldata = encodeFunctionData({
    abi: safeAbi,
    functionName: "execTransaction",
    args: [
      targetAddress,
      valueBigInt,
      req.data,
      req.operation,
      0n,
      0n,
      0n,
      zeroAddress,
      zeroAddress,
      preValidatedSig,
    ],
  });

  const tenderly = getTenderlyConfig();
  if (tenderly && req.chainId !== 31337) {
    try {
      const tenderlyUrl = `https://api.tenderly.co/api/v1/account/${tenderly.account}/project/${tenderly.project}/simulate`;
      const res = await fetch(tenderlyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Access-Key": tenderly.accessKey,
        },
        body: JSON.stringify({
          network_id: String(req.chainId),
          from: signerAddress,
          to: safeAddress,
          input: execTxCalldata,
          gas: 8_000_000,
          save: false,
          save_if_fails: false,
          simulation_type: "full",
          state_objects: {
            [safeAddress]: {
              storage: {
                [SAFE_THRESHOLD_STORAGE_SLOT]: STORAGE_VALUE_ONE,
              },
            },
          },
        }),
        cache: "no-store",
      });

      if (res.ok) {
        const raw = (await res.json()) as TenderlySimulateRaw;
        const tx = raw.transaction;
        const rawChanges = tx?.transaction_info?.asset_changes ?? [];

        const assetChanges: SimulatedAssetChange[] = rawChanges
          .filter(
            (c) =>
              c.from?.toLowerCase() === safeAddress.toLowerCase() ||
              c.to?.toLowerCase() === safeAddress.toLowerCase()
          )
          .map((c) => {
            const isInflow = c.to?.toLowerCase() === safeAddress.toLowerCase();
            return {
              tokenSymbol: c.token_info?.symbol ?? "TOKEN",
              tokenAddress: c.token_info?.contract_address ?? zeroAddress,
              from: c.from ?? zeroAddress,
              to: c.to ?? zeroAddress,
              rawAmount: c.raw_amount ?? "0",
              formattedAmount: c.amount ?? "0",
              dollarValue: c.dollar_value,
              direction: isInflow ? "IN" : "OUT",
            };
          });

        const payload: SimulationResponse = {
          success: Boolean(tx?.status),
          engine: "tenderly",
          gasUsed: tx?.gas_used ?? null,
          revertReason: tx?.status ? null : (tx?.error_message ?? "Transaction reverted"),
          assetChanges,
          callTrace: mapTenderlyCallTrace(tx?.transaction_info?.call_trace),
          decoded,
          risks,
        };

        return NextResponse.json(payload, {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        });
      }
    } catch {
      // Fall through to EVM stateOverride simulation
    }
  }

  // Fallback: Live EVM eth_call with Safe slot-4 threshold stateOverride
  const publicClient = getServerPublicClient(req.chainId);
  let success = true;
  let gasUsed: number | null = null;
  let revertReason: string | null = null;

  try {
    await publicClient.call({
      account: signerAddress,
      to: safeAddress,
      data: execTxCalldata,
      stateOverride: [
        {
          address: safeAddress,
          stateDiff: [
            {
              slot: SAFE_THRESHOLD_STORAGE_SLOT,
              value: STORAGE_VALUE_ONE,
            },
          ],
        },
      ],
    });

    try {
      const estimated = await publicClient.estimateGas({
        account: signerAddress,
        to: safeAddress,
        data: execTxCalldata,
        stateOverride: [
          {
            address: safeAddress,
            stateDiff: [
              {
                slot: SAFE_THRESHOLD_STORAGE_SLOT,
                value: STORAGE_VALUE_ONE,
              },
            ],
          },
        ],
      });
      gasUsed = Number(estimated);
    } catch {
      gasUsed = null;
    }
  } catch (err) {
    success = false;
    revertReason =
      err instanceof Error
        ? err.message.split("\n")[0] ?? "Execution reverted during state-override simulation"
        : "Execution reverted during state-override simulation";
  }

  const staticChanges = inferStaticAssetChanges(
    req.chainId,
    safeAddress,
    targetAddress,
    valueBigInt,
    decoded
  );

  const syntheticTrace: SimulatedCallNode = {
    type: "CALL",
    from: signerAddress,
    to: safeAddress,
    functionName: "execTransaction",
    value: "0",
    gasUsed: gasUsed ?? undefined,
    error: revertReason,
    calls: [
      {
        type: req.operation === 1 ? "DELEGATECALL" : "CALL",
        from: safeAddress,
        to: targetAddress,
        functionName: decoded.functionName,
        value: req.value,
        calls: decoded.nestedCalls.map((nested) => ({
          type: nested.operation === 1 ? "DELEGATECALL" : "CALL",
          from: safeAddress,
          to: nested.to,
          functionName: nested.decoded.functionName,
          value: nested.value,
          calls: [],
        })),
      },
    ],
  };

  const payload: SimulationResponse = {
    success,
    engine: "evm_state_override",
    gasUsed,
    revertReason,
    assetChanges: staticChanges,
    callTrace: syntheticTrace,
    decoded,
    risks,
  };

  return NextResponse.json(payload, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
