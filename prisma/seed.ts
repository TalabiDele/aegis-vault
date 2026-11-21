import { PrismaClient } from "@prisma/client";
import { getAddress } from "viem";

const prisma = new PrismaClient();

async function main() {
  const defaultSafeAddress = getAddress(
    process.env.SEED_SAFE_ADDRESS ?? "0x10A19e7eE7d7F8a52822f6817de8ea18204F2e4f"
  );
  const defaultChainId = Number(process.env.SEED_CHAIN_ID ?? "8453");
  const verifiedBy = getAddress("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");

  const org = await prisma.organization.upsert({
    where: { slug: "kodesy-institutional-treasury" },
    update: { name: "Kodesy Institutional Treasury" },
    create: {
      name: "Kodesy Institutional Treasury",
      slug: "kodesy-institutional-treasury",
    },
  });

  const primarySafe = await prisma.safeWorkspace.upsert({
    where: {
      address_chainId: {
        address: defaultSafeAddress,
        chainId: defaultChainId,
      },
    },
    update: {
      label: "Primary Operating Treasury",
      isDefault: true,
    },
    create: {
      organizationId: org.id,
      label: "Primary Operating Treasury",
      address: defaultSafeAddress,
      chainId: defaultChainId,
      isDefault: true,
    },
  });

  const addressBookEntries = [
    {
      address: getAddress("0x70997970C51812dc3A010C7d01b50e0d17dc79C8"),
      chainId: null,
      label: "CFO Hardware Signer",
      entityType: "SIGNER",
      notes: "Primary Ledger Enterprise co-signer",
    },
    {
      address: getAddress("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"),
      chainId: null,
      label: "General Counsel Signer",
      entityType: "SIGNER",
      notes: "Legal & compliance approval key",
    },
    {
      address: getAddress("0x90F79bf6EB2c4f870365E785982E1f101E93b906"),
      chainId: null,
      label: "CloudScale Infrastructure Vendor",
      entityType: "VENDOR",
      notes: "Monthly RPC & compute settlement wallet",
    },
    {
      address: getAddress("0x2626664c2603336E57B271c5C0b26F421741e481"),
      chainId: 8453,
      label: "Uniswap V3 SwapRouter02 (Base)",
      entityType: "PROTOCOL",
      notes: "Verified canonical Base DEX router",
    },
    {
      address: getAddress("0xA238Dd80C259a72e81d7e4664a9801593F98d1c5"),
      chainId: 8453,
      label: "Aave V3 Pool (Base)",
      entityType: "PROTOCOL",
      notes: "Institutional liquidity reserve pool",
    },
  ];

  for (const entry of addressBookEntries) {
    const existing = await prisma.addressBookEntry.findFirst({
      where: {
        organizationId: org.id,
        address: entry.address,
        chainId: entry.chainId,
      },
    });

    if (existing) {
      await prisma.addressBookEntry.update({
        where: { id: existing.id },
        data: {
          label: entry.label,
          entityType: entry.entityType,
          notes: entry.notes,
          verifiedBy,
        },
      });
    } else {
      await prisma.addressBookEntry.create({
        data: {
          organizationId: org.id,
          address: entry.address,
          chainId: entry.chainId,
          label: entry.label,
          entityType: entry.entityType,
          notes: entry.notes,
          verifiedBy,
        },
      });
    }
  }

  // Sample spending policies (stringified BigInt wei/base units)
  const usdcBase = getAddress("0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  const wethBase = getAddress("0x4200000000000000000000000000000000000006");

  await prisma.spendingPolicy.upsert({
    where: {
      safeId_tokenAddress: {
        safeId: primarySafe.id,
        tokenAddress: usdcBase,
      },
    },
    update: {
      maxSingleTxWei: "50000000000", // 50,000 USDC (6 decimals)
      requiresMemo: true,
    },
    create: {
      safeId: primarySafe.id,
      tokenAddress: usdcBase,
      maxSingleTxWei: "50000000000",
      requiresMemo: true,
    },
  });

  await prisma.spendingPolicy.upsert({
    where: {
      safeId_tokenAddress: {
        safeId: primarySafe.id,
        tokenAddress: wethBase,
      },
    },
    update: {
      maxSingleTxWei: "25000000000000000000", // 25 WETH (18 decimals)
      requiresMemo: true,
    },
    create: {
      safeId: primarySafe.id,
      tokenAddress: wethBase,
      maxSingleTxWei: "25000000000000000000",
      requiresMemo: true,
    },
  });

  console.log(
    `Seeded organization "${org.name}" with Safe ${primarySafe.address} (chain ${primarySafe.chainId}), ${addressBookEntries.length} address book entries, and 2 spending policies.`
  );
}

main()
  .catch((err) => {
    console.error("Failed to seed database:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
