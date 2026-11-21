import { formatUnits, getAddress, isAddress, maxUint256, parseUnits, type Address } from "viem";

const NUMERIC_AMOUNT_REGEX = /^\d+(?:\.\d+)?$/;

/**
 * Strictly parses a decimal token amount string into raw BigInt base units.
 * Never passes through JavaScript floating-point numbers.
 */
export function parseTokenAmount(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!NUMERIC_AMOUNT_REGEX.test(trimmed)) {
    throw new Error(`Invalid numeric token amount: "${value}"`);
  }
  return parseUnits(trimmed, decimals);
}

/**
 * Formats a raw BigInt token amount into a human-readable string with thousands
 * separators and bounded decimal precision, without converting to JS Number.
 */
export function formatTokenAmount(
  amount: bigint,
  decimals: number,
  maxFractionDigits = 4
): string {
  const isNegative = amount < 0n;
  const absAmount = isNegative ? -amount : amount;
  const raw = formatUnits(absAmount, decimals);
  const [intPart = "0", fracPart = ""] = raw.split(".");

  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

  if (maxFractionDigits <= 0 || fracPart.length === 0) {
    return `${isNegative ? "-" : ""}${formattedInt}`;
  }

  const trimmedFrac = fracPart.slice(0, maxFractionDigits).replace(/0+$/, "");
  if (trimmedFrac.length === 0) {
    return `${isNegative ? "-" : ""}${formattedInt}`;
  }

  return `${isNegative ? "-" : ""}${formattedInt}.${trimmedFrac}`;
}

/**
 * Formats a USD value stored in integer cents (BigInt) into `$1,234.56`.
 */
export function formatUsdCents(cents: bigint): string {
  const isNegative = cents < 0n;
  const absCents = isNegative ? -cents : cents;
  const dollars = absCents / 100n;
  const remainder = absCents % 100n;
  const formattedDollars = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formattedCents = remainder.toString().padStart(2, "0");
  return `${isNegative ? "-" : ""}$${formattedDollars}.${formattedCents}`;
}

/**
 * Multiplies a token amount (raw BigInt) by a USD price in integer micro-dollars
 * (1e6 = $1.00) and returns integer USD cents (1e2 = $1.00) using pure BigInt math.
 */
export function tokenAmountToUsdCents(
  rawAmount: bigint,
  decimals: number,
  priceMicroUsd: bigint
): bigint {
  if (rawAmount === 0n || priceMicroUsd === 0n) {
    return 0n;
  }
  const scale = 10n ** BigInt(decimals);
  // (rawAmount * priceMicroUsd) / (scale * 10_000n) => cents (1e6 / 1e4 = 1e2)
  return (rawAmount * priceMicroUsd) / (scale * 10_000n);
}

/**
 * Computes integer basis points (0..10000) for part / total using BigInt math.
 */
export function calculateShareBps(part: bigint, total: bigint): number {
  if (total <= 0n || part <= 0n) {
    return 0;
  }
  const bps = (part * 10_000n) / total;
  return Number(bps > 10_000n ? 10_000n : bps);
}

export function formatBpsAsPercent(bps: number): string {
  const whole = Math.floor(bps / 100);
  const frac = Math.abs(bps % 100)
    .toString()
    .padStart(2, "0");
  return `${whole}.${frac}%`;
}

export const UNLIMITED_ALLOWANCE_THRESHOLD = maxUint256 / 2n;

export function isUnlimitedAllowance(allowance: bigint): boolean {
  return allowance >= UNLIMITED_ALLOWANCE_THRESHOLD;
}

export function toChecksumAddress(input: string): Address | null {
  const trimmed = input.trim();
  if (!isAddress(trimmed)) {
    return null;
  }
  return getAddress(trimmed);
}

export function truncateAddress(address: string, head = 6, tail = 4): string {
  const checksummed = toChecksumAddress(address) ?? address;
  if (checksummed.length <= head + tail + 3) {
    return checksummed;
  }
  return `${checksummed.slice(0, head)}...${checksummed.slice(-tail)}`;
}
