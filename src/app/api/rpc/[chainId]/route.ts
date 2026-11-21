import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getChainMetadata, isSupportedChainId } from "@/shared/config/chains";
import { getRpcUrl } from "@/shared/config/env";
import { checkRateLimit, extractClientIp } from "@/shared/lib/rate-limit";

const ALLOWED_RPC_METHODS = new Set<string>([
  "eth_chainId",
  "eth_blockNumber",
  "eth_call",
  "eth_getBalance",
  "eth_getCode",
  "eth_getTransactionReceipt",
  "eth_getTransactionByHash",
  "eth_estimateGas",
  "eth_feeHistory",
  "eth_gasPrice",
  "eth_maxPriorityFeePerGas",
  "eth_getLogs",
  "eth_sendRawTransaction",
]);

const jsonRpcItemSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number(), z.null()]).optional(),
  method: z.string().min(1).max(64),
  params: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).optional(),
});

const jsonRpcPayloadSchema = z.union([
  jsonRpcItemSchema,
  z.array(jsonRpcItemSchema).min(1).max(50),
]);

const MAX_BODY_BYTES = 256 * 1024; // 256 KiB

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ chainId: string }> }
) {
  const { chainId: rawChainId } = await context.params;
  if (!/^\d+$/.test(rawChainId)) {
    return NextResponse.json(
      { error: "Invalid chainId parameter" },
      { status: 400 }
    );
  }

  const chainId = Number(rawChainId);
  if (!isSupportedChainId(chainId)) {
    return NextResponse.json(
      { error: `Unsupported chainId: ${chainId}` },
      { status: 400 }
    );
  }

  const ip = extractClientIp(request.headers);
  const rateLimit = checkRateLimit(`rpc:${ip}`, 120, 60_000);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Rate limit exceeded for RPC proxy" },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, Math.ceil((rateLimit.resetAtMs - Date.now()) / 1000))),
        },
      }
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json(
      { error: "JSON-RPC payload too large" },
      { status: 413 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Malformed JSON body" },
      { status: 400 }
    );
  }

  const parsed = jsonRpcPayloadSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid JSON-RPC 2.0 request payload" },
      { status: 400 }
    );
  }

  const calls = Array.isArray(parsed.data) ? parsed.data : [parsed.data];
  for (const call of calls) {
    if (!ALLOWED_RPC_METHODS.has(call.method)) {
      return NextResponse.json(
        { error: `RPC method not permitted: ${call.method}` },
        { status: 403 }
      );
    }
  }

  const chainMeta = getChainMetadata(chainId);
  const upstreamUrl = getRpcUrl(chainId) ?? chainMeta?.fallbackRpcUrl;
  if (!upstreamUrl) {
    return NextResponse.json(
      { error: "Upstream RPC endpoint is not configured for this chain" },
      { status: 503 }
    );
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);

    const upstreamResponse = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parsed.data),
      signal: controller.signal,
      cache: "no-store",
    });

    clearTimeout(timeout);

    if (!upstreamResponse.ok) {
      return NextResponse.json(
        { error: `Upstream RPC returned status ${upstreamResponse.status}` },
        { status: 502 }
      );
    }

    const upstreamData: unknown = await upstreamResponse.json();
    return NextResponse.json(upstreamData, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
        "X-RateLimit-Remaining": String(rateLimit.remaining),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to reach upstream RPC endpoint" },
      { status: 502 }
    );
  }
}
