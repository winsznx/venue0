import type { Metadata } from "next";
import { env } from "@/lib/server/env";
import { requireUser } from "@/lib/server/guard";
import { SettingsForm } from "@/components/product/settings-form";

export const metadata: Metadata = { title: "Settings · Venue0" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <>
      <header className="page-head"><div><h1>Settings</h1><p className="muted">Stored with your account. Your wallet and its keys stay with you and Dynamic.</p></div></header>
      <SettingsForm user={user} agentAvailable={env.anthropicAvailable} settlementContract={env.settlementContract ?? null} />
    </>
  );
}
