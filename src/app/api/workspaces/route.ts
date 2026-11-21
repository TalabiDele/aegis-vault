import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress, type Address } from "viem";
import { z } from "zod";
import { AuthError, requireSafeOwnerSession } from "@/shared/auth/session";
import { prisma } from "@/shared/db/prisma";

const upsertPolicySchema = z.object({
  safeAddress: z
    .string()
    .refine((val): val is Address => isAddress(val), "Invalid safeAddress"),
  chainId: z.number().int().positive(),
  tokenAddress: z
    .string()
    .refine((val): val is Address => isAddress(val), "Invalid tokenAddress"),
  maxSingleTxWei: z.string().regex(/^\d+$/, "maxSingleTxWei must be a non-negative integer string"),
  requiresMemo: z.boolean().default(true),
});

export async function GET() {
  try {
    const workspaces = await prisma.safeWorkspace.findMany({
      include: {
        spendingPolicies: true,
        organization: true,
      },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json({ workspaces }, { status: 200 });
  } catch {
    return NextResponse.json({ workspaces: [] }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const parsed = upsertPolicySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid spending policy payload" },
      { status: 400 }
    );
  }

  const normalizedSafe = getAddress(parsed.data.safeAddress);
  const normalizedToken = getAddress(parsed.data.tokenAddress);

  try {
    await requireSafeOwnerSession(normalizedSafe, parsed.data.chainId);

    const org = await prisma.organization.upsert({
      where: { slug: "kodesy-institutional-treasury" },
      update: {},
      create: {
        name: "Kodesy Institutional Treasury",
        slug: "kodesy-institutional-treasury",
      },
    });

    const workspace = await prisma.safeWorkspace.upsert({
      where: {
        address_chainId: {
          address: normalizedSafe,
          chainId: parsed.data.chainId,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        label: `Safe ${normalizedSafe.slice(0, 6)}...${normalizedSafe.slice(-4)}`,
        address: normalizedSafe,
        chainId: parsed.data.chainId,
      },
    });

    const policy = await prisma.spendingPolicy.upsert({
      where: {
        safeId_tokenAddress: {
          safeId: workspace.id,
          tokenAddress: normalizedToken,
        },
      },
      update: {
        maxSingleTxWei: parsed.data.maxSingleTxWei,
        requiresMemo: parsed.data.requiresMemo,
      },
      create: {
        safeId: workspace.id,
        tokenAddress: normalizedToken,
        maxSingleTxWei: parsed.data.maxSingleTxWei,
        requiresMemo: parsed.data.requiresMemo,
      },
    });

    return NextResponse.json({ policy }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Failed to save spending policy" },
      { status: 500 }
    );
  }
}
