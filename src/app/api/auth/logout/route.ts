import { NextRequest, NextResponse } from "next/server";
import { deleteSession, getSessionCookieName } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const sessionId = request.cookies.get(getSessionCookieName())?.value;

    if (sessionId) {
      await deleteSession(sessionId);
    }

    const response = NextResponse.json({ success: true });
    response.cookies.delete(getSessionCookieName());

    return response;
  } catch (error) {
    console.error("[auth/logout] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
