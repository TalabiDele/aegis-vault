import { getIronSession, type IronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { getAddress, type Address } from "viem";
import { isSupportedChainId } from "@/shared/config/chains";
import { getIronSessionSecret } from "@/shared/config/env";
import { safeAbi } from "@/shared/web3/abis";
import { getServerPublicClient } from "@/shared/web3/server-client";

export interface SiweSessionData {
  address?: Address;
  chainId?: number;
  issuedAt?: string;
}

export interface AuthenticatedSiweSession {
  address: Address;
  chainId: number;
  issuedAt: string;
}

export class AuthError extends Error {
  public readonly status: number;

  constructor(message: string, status = 401) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

function getSessionOptions(): SessionOptions {
  return {
    password: getIronSessionSecret(),
    cookieName: "aegisvault_siwe_session",
    ttl: 60 * 60 * 24, // 24 hours
    cookieOptions: {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
    },
  };
}

/**
 * Lazily opens the encrypted HttpOnly iron-session cookie for the current request.
 */
export async function getSiweSession(): Promise<IronSession<SiweSessionData>> {
  const cookieStore = await cookies();
  return getIronSession<SiweSessionData>(cookieStore, getSessionOptions());
}

/**
 * Requires an authenticated SIWE session or throws AuthError(401).
 */
export async function requireSiweSession(): Promise<AuthenticatedSiweSession> {
  const session = await getSiweSession();
  if (!session.address || !session.chainId || !session.issuedAt) {
    throw new AuthError("SIWE authentication required", 401);
  }

  return {
    address: getAddress(session.address),
    chainId: session.chainId,
    issuedAt: session.issuedAt,
  };
}

/**
 * Enforces both SIWE authentication AND on-chain Safe ownership (`safe.isOwner(session.address)`).
 * Used on every mutating institutional metadata endpoint.
 */
export async function requireSafeOwnerSession(
  safeAddress: Address,
  chainId: number
): Promise<AuthenticatedSiweSession> {
  const session = await requireSiweSession();

  if (!isSupportedChainId(chainId)) {
    throw new AuthError(`Unsupported chainId: ${chainId}`, 400);
  }

  const normalizedSafe = getAddress(safeAddress);
  const publicClient = getServerPublicClient(chainId);

  let isOwner = false;
  try {
    isOwner = await publicClient.readContract({
      address: normalizedSafe,
      abi: safeAbi,
      functionName: "isOwner",
      args: [session.address],
    });
  } catch {
    throw new AuthError(
      "Unable to verify Safe ownership on-chain. Verify Safe address and RPC connectivity.",
      502
    );
  }

  if (!isOwner) {
    throw new AuthError(
      "Forbidden: authenticated wallet is not an on-chain owner of this Safe.",
      403
    );
  }

  return session;
}
