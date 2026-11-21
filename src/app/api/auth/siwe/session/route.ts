import { NextResponse } from "next/server";
import { getSiweSession } from "@/shared/auth/session";

export async function GET() {
  try {
    const session = await getSiweSession();
    if (!session.address || !session.chainId) {
      return NextResponse.json(
        { authenticated: false },
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    return NextResponse.json(
      {
        authenticated: true,
        address: session.address,
        chainId: session.chainId,
        issuedAt: session.issuedAt,
      },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      { authenticated: false },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
