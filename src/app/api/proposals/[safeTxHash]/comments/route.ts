import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress, isHex, type Address } from "viem";
import { z } from "zod";
import { AuthError, requireSafeOwnerSession } from "@/shared/auth/session";
import { prisma } from "@/shared/db/prisma";

const createCommentSchema = z.object({
  safeAddress: z
    .string()
    .refine((val): val is Address => isAddress(val), "Invalid safeAddress"),
  chainId: z.number().int().positive(),
  nonce: z.number().int().min(0).optional(),
  body: z.string().trim().min(1).max(2000),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ safeTxHash: string }> }
) {
  const { safeTxHash } = await context.params;
  if (!isHex(safeTxHash) || safeTxHash.length !== 66) {
    return NextResponse.json(
      { error: "Invalid bytes32 safeTxHash" },
      { status: 400 }
    );
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const parsed = createCommentSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid comment payload" },
      { status: 400 }
    );
  }

  const normalizedSafe = getAddress(parsed.data.safeAddress);

  try {
    const session = await requireSafeOwnerSession(normalizedSafe, parsed.data.chainId);

    let proposal = await prisma.proposalMeta.findUnique({
      where: { safeTxHash },
    });

    if (!proposal) {
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

      proposal = await prisma.proposalMeta.create({
        data: {
          safeTxHash,
          safeId: workspace.id,
          nonce: parsed.data.nonce ?? 0,
          title: `Proposal ${safeTxHash.slice(0, 10)}...`,
          category: "OPERATIONS",
          createdBy: session.address,
        },
      });
    }

    const comment = await prisma.proposalComment.create({
      data: {
        proposalId: proposal.id,
        author: session.address,
        body: parsed.data.body,
      },
    });

    return NextResponse.json({ comment }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Failed to save proposal audit comment" },
      { status: 500 }
    );
  }
}
