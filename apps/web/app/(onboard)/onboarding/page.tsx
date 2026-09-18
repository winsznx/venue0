import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Onboarding } from "@/components/product/onboarding";
import { env } from "@/lib/server/env";
import { getSession } from "@/lib/server/session";
import { getUser } from "@/lib/server/users";

export const metadata: Metadata = { title: "Get started · Venue0" };

export default async function OnboardingPage() {
  const session = await getSession();
  const user = session ? await getUser(session.address) : undefined;
  if (user?.onboardedAt) redirect("/app");
  return <Onboarding agentAvailable={env.anthropicAvailable} walletConfigured={Boolean(env.dynamicEnvironmentId)} />;
}
