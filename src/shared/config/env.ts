import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_WC_PROJECT_ID: z.string().default(""),
  NEXT_PUBLIC_DEFAULT_CHAIN_ID: z
    .string()
    .regex(/^\d+$/, "NEXT_PUBLIC_DEFAULT_CHAIN_ID must be a numeric chain ID")
    .transform((val) => Number(val))
    .default(8453),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

let cachedPublicEnv: PublicEnv | null = null;

export function getPublicEnv(): PublicEnv {
  if (cachedPublicEnv) {
    return cachedPublicEnv;
  }

  const parsed = publicEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    NEXT_PUBLIC_WC_PROJECT_ID: process.env.NEXT_PUBLIC_WC_PROJECT_ID ?? "",
    NEXT_PUBLIC_DEFAULT_CHAIN_ID: process.env.NEXT_PUBLIC_DEFAULT_CHAIN_ID || "8453",
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid public environment variables: ${JSON.stringify(parsed.error.flatten().fieldErrors)}`
    );
  }

  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}

const serverSecretSchema = z.object({
  IRON_SESSION_SECRET: z
    .string()
    .min(32, "IRON_SESSION_SECRET must be at least 32 characters"),
});

export function getIronSessionSecret(): string {
  const parsed = serverSecretSchema.safeParse({
    IRON_SESSION_SECRET: process.env.IRON_SESSION_SECRET,
  });

  if (!parsed.success) {
    throw new Error(
      `Invalid server session secret: ${parsed.error.issues.map((i) => i.message).join(", ")}`
    );
  }

  return parsed.data.IRON_SESSION_SECRET;
}

const databaseEnvSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
});

export function getDatabaseUrl(): string {
  const parsed = databaseEnvSchema.safeParse({
    DATABASE_URL: process.env.DATABASE_URL,
  });

  if (!parsed.success) {
    throw new Error("DATABASE_URL is required on the server");
  }

  return parsed.data.DATABASE_URL;
}

const rpcEnvSchema = z.object({
  RPC_URL_MAINNET: z.string().url().optional().or(z.literal("")),
  RPC_URL_BASE: z.string().url().optional().or(z.literal("")),
  RPC_URL_ARBITRUM: z.string().url().optional().or(z.literal("")),
  RPC_URL_SEPOLIA: z.string().url().optional().or(z.literal("")),
  RPC_URL_ANVIL: z.string().url().optional().or(z.literal("")),
});

export function getRpcUrl(chainId: number): string | null {
  const parsed = rpcEnvSchema.safeParse({
    RPC_URL_MAINNET: process.env.RPC_URL_MAINNET ?? "",
    RPC_URL_BASE: process.env.RPC_URL_BASE ?? "",
    RPC_URL_ARBITRUM: process.env.RPC_URL_ARBITRUM ?? "",
    RPC_URL_SEPOLIA: process.env.RPC_URL_SEPOLIA ?? "",
    RPC_URL_ANVIL: process.env.RPC_URL_ANVIL ?? "http://127.0.0.1:8545",
  });

  if (!parsed.success) {
    return null;
  }

  switch (chainId) {
    case 1:
      return parsed.data.RPC_URL_MAINNET || null;
    case 8453:
      return parsed.data.RPC_URL_BASE || null;
    case 42161:
      return parsed.data.RPC_URL_ARBITRUM || null;
    case 11155111:
      return parsed.data.RPC_URL_SEPOLIA || null;
    case 31337:
      return parsed.data.RPC_URL_ANVIL || "http://127.0.0.1:8545";
    default:
      return null;
  }
}

export interface TenderlyConfig {
  account: string;
  project: string;
  accessKey: string;
}

const tenderlyEnvSchema = z.object({
  TENDERLY_ACCOUNT: z.string().min(1),
  TENDERLY_PROJECT: z.string().min(1),
  TENDERLY_ACCESS_KEY: z.string().min(1),
});

export function getTenderlyConfig(): TenderlyConfig | null {
  const parsed = tenderlyEnvSchema.safeParse({
    TENDERLY_ACCOUNT: process.env.TENDERLY_ACCOUNT ?? "",
    TENDERLY_PROJECT: process.env.TENDERLY_PROJECT ?? "",
    TENDERLY_ACCESS_KEY: process.env.TENDERLY_ACCESS_KEY ?? "",
  });

  if (!parsed.success) {
    return null;
  }

  return {
    account: parsed.data.TENDERLY_ACCOUNT,
    project: parsed.data.TENDERLY_PROJECT,
    accessKey: parsed.data.TENDERLY_ACCESS_KEY,
  };
}

export function getSafeApiKey(): string | undefined {
  const key = process.env.SAFE_API_KEY?.trim();
  return key && key.length > 0 ? key : undefined;
}

export function getPonderApiUrl(): string {
  return process.env.PONDER_API_URL?.trim() || "http://127.0.0.1:42069";
}
