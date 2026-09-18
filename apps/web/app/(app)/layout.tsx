import { APP_NAV, Shell } from "@/components/shell";
import { WalletProvider } from "@/components/wallet/provider";
import { WalletCard } from "@/components/wallet/wallet-card";
import { env } from "@/lib/server/env";
import { getSession } from "@/lib/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  return (
    <WalletProvider environmentId={env.dynamicEnvironmentId ?? null} serverAddress={session?.address ?? null}>
      <Shell nav={APP_NAV} footer={<WalletCard />}>{children}</Shell>
    </WalletProvider>
  );
}
