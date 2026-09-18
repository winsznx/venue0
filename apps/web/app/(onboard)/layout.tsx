import { WalletProvider } from "@/components/wallet/provider";
import { env } from "@/lib/server/env";
import { getSession } from "@/lib/server/session";

export default async function OnboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <WalletProvider environmentId={env.dynamicEnvironmentId ?? null} serverAddress={session?.address ?? null}>
      {children}
    </WalletProvider>
  );
}
