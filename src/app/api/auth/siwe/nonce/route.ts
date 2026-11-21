import { NextResponse } from "next/server";
import { generateSiweNonce } from "viem/siwe";
import { prisma } from "@/shared/db/prisma";

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET() {
  try {
    const nonce = generateSiweNonce();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + NONCE_TTL_MS);

    await prisma.$transaction([
      prisma.siweNonce.deleteMany({
        where: { expiresAt: { lte: now } },
      }),
      prisma.siweNonce.create({
        data: {
          nonce,
          expiresAt,
        },
      }),
    ]);

    return NextResponse.json(
      { nonce, expiresAt: expiresAt.toISOString() },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to generate authentication nonce" },
      { status: 500 }
    );
  }
}
