import { NextResponse } from "next/server";
import { getSiweSession } from "@/shared/auth/session";

export async function POST() {
  try {
    const session = await getSiweSession();
    session.destroy();
    return NextResponse.json(
      { authenticated: false },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      }
    );
  } catch {
    return NextResponse.json(
      { error: "Failed to terminate session" },
      { status: 500 }
    );
  }
}
