import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress, isHex, type Address } from "viem";
import { z } from "zod";
import { AuthError, requireSafeOwnerSession } from "@/shared/auth/session";
import { prisma } from "@/shared/db/prisma";

const ALLOWED_CATEGORIES = [
  "PAYROLL",
  "VENDOR",
  "DEFI",
  "GOVERNANCE",
  "REVOKE",
  "OPERATIONS",
] as const;

const createProposalMetaSchema = z.object({
  safeTxHash: z
    .string()
    .refine((val) => isHex(val) && val.length === 66, "Invalid bytes32 safeTxHash"),
  safeAddress: z
    .string()
    .refine((val): val is Address => isAddress(val), "Invalid safeAddress"),
  chainId: z.number().int().positive(),
  nonce: z.number().int().min(0),
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(2000).optional(),
  invoiceRef: z.string().trim().max(120).optional(),
  category: z.enum(ALLOWED_CATEGORIES).default("OPERATIONS"),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const safeAddress = searchParams.get("safeAddress");
  const chainIdParam = searchParams.get("chainId");
  const safeTxHash = searchParams.get("safeTxHash");

  try {
    if (safeTxHash) {
      const proposal = await prisma.proposalMeta.findUnique({
        where: { safeTxHash },
        include: {
          comments: {
            orderBy: { createdAt: "asc" },
          },
          safe: true,
        },
      });
      return NextResponse.json({ proposal }, { status: 200 });
    }

    if (safeAddress && chainIdParam && isAddress(safeAddress) && /^\d+$/.test(chainIdParam)) {
      const normalized = getAddress(safeAddress);
      const chainId = Number(chainIdParam);
      const workspace = await prisma.safeWorkspace.findUnique({
        where: {
          address_chainId: {
            address: normalized,
            chainId,
          },
        },
      });

      if (!workspace) {
        return NextResponse.json({ proposals: [] }, { status: 200 });
      }

      const proposals = await prisma.proposalMeta.findMany({
        where: { safeId: workspace.id },
        include: {
          comments: {
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [{ nonce: "asc" }, { createdAt: "desc" }],
      });

      return NextResponse.json({ proposals }, { status: 200 });
    }

    const proposals = await prisma.proposalMeta.findMany({
      include: {
        comments: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ proposals }, { status: 200 });
  } catch {
    return NextResponse.json({ proposals: [] }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const parsed = createProposalMetaSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid proposal metadata payload", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const normalizedSafe = getAddress(data.safeAddress);

  try {
    const session = await requireSafeOwnerSession(normalizedSafe, data.chainId);

    // Ensure default org and safe workspace exist
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
          chainId: data.chainId,
        },
      },
      update: {},
      create: {
        organizationId: org.id,
        label: `Safe ${normalizedSafe.slice(0, 6)}...${normalizedSafe.slice(-4)}`,
        address: normalizedSafe,
        chainId: data.chainId,
      },
    });

    const proposal = await prisma.proposalMeta.upsert({
      where: { safeTxHash: data.safeTxHash },
      update: {
        title: data.title,
        description: data.description ?? null,
        invoiceRef: data.invoiceRef ?? null,
        category: data.category,
        nonce: data.nonce,
      },
      create: {
        safeTxHash: data.safeTxHash,
        safeId: workspace.id,
        nonce: data.nonce,
        title: data.title,
        description: data.description ?? null,
        invoiceRef: data.invoiceRef ?? null,
        category: data.category,
        createdBy: session.address,
      },
      include: {
        comments: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    return NextResponse.json({ proposal }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Failed to persist proposal metadata" },
      { status: 500 }
    );
  }
}
