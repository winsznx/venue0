import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/session";
import { getUser } from "@/lib/server/users";

/**
 * Entry point for "Enter Venue0": one server redirect to where the visitor belongs, so nobody passes through /app
 * on the way to onboarding.
 */
export async function GET(request: Request) {
  const session = await getSession();
  const user = session ? await getUser(session.address) : undefined;
  return NextResponse.redirect(new URL(user?.onboardedAt ? "/app" : "/onboarding", request.url), 303);
}
