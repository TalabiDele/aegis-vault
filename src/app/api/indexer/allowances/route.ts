import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress } from "viem";
import { isSupportedChainId } from "@/shared/config/chains";
import { getPonderApiUrl } from "@/shared/config/env";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const safeParam = searchParams.get("safeAddress");
  const chainParam = searchParams.get("chainId");

  if (!safeParam || !isAddress(safeParam) || !chainParam || !/^\d+$/.test(chainParam)) {
    return NextResponse.json(
      { error: "Invalid safeAddress or chainId" },
      { status: 400 }
    );
  }

  const chainId = Number(chainParam);
  if (!isSupportedChainId(chainId)) {
    return NextResponse.json(
      { error: `Unsupported chainId: ${chainId}` },
      { status: 400 }
    );
  }

  const safeAddress = getAddress(safeParam);
  const ponderUrl = getPonderApiUrl();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3_000);

    const res = await fetch(
      `${ponderUrl}/api/allowances?safeAddress=${encodeURIComponent(safeAddress)}&chainId=${chainId}`,
      {
        signal: controller.signal,
        cache: "no-store",
      }
    );
    clearTimeout(timeout);

    if (res.ok) {
      const data: unknown = await res.json();
      return NextResponse.json(data, {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      });
    }
  } catch {
    // Graceful degradation to direct Multicall reads when Ponder is offline
  }

  return NextResponse.json(
    { source: "fallback", pairs: [] },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
