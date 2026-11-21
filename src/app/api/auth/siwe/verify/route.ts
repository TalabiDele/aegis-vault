import { NextRequest, NextResponse } from "next/server";
import { getAddress, isHex, type Hex } from "viem";
import { parseSiweMessage, verifySiweMessage } from "viem/siwe";
import { z } from "zod";
import { getSiweSession } from "@/shared/auth/session";
import { isSupportedChainId } from "@/shared/config/chains";
import { getPublicEnv } from "@/shared/config/env";
import { prisma } from "@/shared/db/prisma";
import { getServerPublicClient } from "@/shared/web3/server-client";

const verifyBodySchema = z.object({
  message: z.string().min(20).max(4096),
  signature: z
    .string()
    .refine((val): val is Hex => isHex(val), "Signature must be a valid hex string"),
});

function resolveExpectedDomain(request: NextRequest): string {
  const hostHeader = request.headers.get("host")?.trim();
  if (hostHeader) {
    return hostHeader;
  }
  return new URL(getPublicEnv().NEXT_PUBLIC_APP_URL).host;
}

export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const parsedBody = verifyBodySchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid SIWE verification payload" },
      { status: 400 }
    );
  }

  const { message, signature } = parsedBody.data;
  const parsedMessage = parseSiweMessage(message);

  if (
    !parsedMessage.address ||
    !parsedMessage.nonce ||
    !parsedMessage.domain ||
    !parsedMessage.chainId
  ) {
    return NextResponse.json(
      { error: "Incomplete SIWE message fields" },
      { status: 400 }
    );
  }

  const expectedDomain = resolveExpectedDomain(request);
  if (parsedMessage.domain !== expectedDomain) {
    return NextResponse.json(
      { error: "SIWE domain mismatch" },
      { status: 401 }
    );
  }

  if (!isSupportedChainId(parsedMessage.chainId)) {
    return NextResponse.json(
      { error: `Unsupported SIWE chainId: ${parsedMessage.chainId}` },
      { status: 400 }
    );
  }

  // Atomically consume matching unexpired nonce (replay-proof)
  try {
    const consumed = await prisma.siweNonce.deleteMany({
      where: {
        nonce: parsedMessage.nonce,
        expiresAt: { gt: new Date() },
      },
    });

    if (consumed.count !== 1) {
      return NextResponse.json(
        { error: "Invalid, expired, or already used SIWE nonce" },
        { status: 401 }
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Database error verifying SIWE nonce" },
      { status: 500 }
    );
  }

  // Verify signature on-chain via server Viem PublicClient (EOA + ERC-1271 support)
  let valid = false;
  try {
    const publicClient = getServerPublicClient(parsedMessage.chainId);
    valid = await verifySiweMessage(publicClient, {
      message,
      signature,
      domain: expectedDomain,
      nonce: parsedMessage.nonce,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to verify SIWE signature" },
      { status: 401 }
    );
  }

  if (!valid) {
    return NextResponse.json(
      { error: "Invalid SIWE cryptographic signature" },
      { status: 401 }
    );
  }

  const checksummedAddress = getAddress(parsedMessage.address);
  const issuedAt = new Date().toISOString();

  try {
    const session = await getSiweSession();
    session.address = checksummedAddress;
    session.chainId = parsedMessage.chainId;
    session.issuedAt = issuedAt;
    await session.save();
  } catch {
    return NextResponse.json(
      { error: "Failed to persist authenticated session" },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      authenticated: true,
      address: checksummedAddress,
      chainId: parsedMessage.chainId,
      issuedAt,
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
