import "server-only";
import { redirect } from "next/navigation";
import { getSession } from "./session";
import { getUser, type User } from "./users";

/** Product pages require a signed-in wallet that finished onboarding; anything else goes to onboarding. */
export async function requireUser(): Promise<User> {
  const session = await getSession();
  if (!session) redirect("/onboarding");
  const user = await getUser(session.address);
  if (!user?.onboardedAt) redirect("/onboarding");
  return user;
}
