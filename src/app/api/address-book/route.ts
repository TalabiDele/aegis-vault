import { NextRequest, NextResponse } from "next/server";
import { getAddress, isAddress, type Address } from "viem";
import { z } from "zod";
import { AuthError, requireSafeOwnerSession } from "@/shared/auth/session";
import { prisma } from "@/shared/db/prisma";

const ENTITY_TYPES = ["VENDOR", "SIGNER", "PROTOCOL", "TREASURY"] as const;

const upsertAddressBookSchema = z.object({
  safeAddress: z
    .string()
    .refine((val): val is Address => isAddress(val), "Invalid safeAddress"),
  safeChainId: z.number().int().positive(),
  address: z
    .string()
    .refine((val): val is Address => isAddress(val), "Invalid counterparty address"),
  chainId: z.number().int().positive().nullable().optional(),
  label: z.string().trim().min(2).max(120),
  entityType: z.enum(ENTITY_TYPES).default("VENDOR"),
  notes: z.string().trim().max(500).optional(),
});

const deleteAddressBookSchema = z.object({
  id: z.string().min(1),
  safeAddress: z
    .string()
    .refine((val): val is Address => isAddress(val), "Invalid safeAddress"),
  safeChainId: z.number().int().positive(),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const chainIdParam = searchParams.get("chainId");
  const chainId =
    chainIdParam && /^\d+$/.test(chainIdParam) ? Number(chainIdParam) : null;

  try {
    const entries = await prisma.addressBookEntry.findMany({
      where: chainId
        ? {
            OR: [{ chainId: null }, { chainId }],
          }
        : undefined,
      orderBy: [{ entityType: "asc" }, { label: "asc" }],
    });

    return NextResponse.json({ entries }, { status: 200 });
  } catch {
    return NextResponse.json({ entries: [] }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const parsed = upsertAddressBookSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid address book entry", details: parsed.error.flatten().fieldErrors },
      { status: 400 }
    );
  }

  const data = parsed.data;
  const normalizedSafe = getAddress(data.safeAddress);
  const normalizedTarget = getAddress(data.address);
  const targetChainId = data.chainId ?? null;

  try {
    const session = await requireSafeOwnerSession(normalizedSafe, data.safeChainId);

    const org = await prisma.organization.upsert({
      where: { slug: "kodesy-institutional-treasury" },
      update: {},
      create: {
        name: "Kodesy Institutional Treasury",
        slug: "kodesy-institutional-treasury",
      },
    });

    const existing = await prisma.addressBookEntry.findFirst({
      where: {
        organizationId: org.id,
        address: normalizedTarget,
        chainId: targetChainId,
      },
    });

    const entry = existing
      ? await prisma.addressBookEntry.update({
          where: { id: existing.id },
          data: {
            label: data.label,
            entityType: data.entityType,
            notes: data.notes ?? null,
            verifiedBy: session.address,
          },
        })
      : await prisma.addressBookEntry.create({
          data: {
            organizationId: org.id,
            address: normalizedTarget,
            chainId: targetChainId,
            label: data.label,
            entityType: data.entityType,
            notes: data.notes ?? null,
            verifiedBy: session.address,
          },
        });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Failed to save address book entry" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Malformed JSON body" }, { status: 400 });
  }

  const parsed = deleteAddressBookSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid delete payload" },
      { status: 400 }
    );
  }

  try {
    await requireSafeOwnerSession(
      getAddress(parsed.data.safeAddress),
      parsed.data.safeChainId
    );

    await prisma.addressBookEntry.delete({
      where: { id: parsed.data.id },
    });

    return NextResponse.json({ deleted: true, id: parsed.data.id }, { status: 200 });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: "Failed to delete address book entry" },
      { status: 500 }
    );
  }
}
