import { APP_NAV, Shell } from "@/components/shell";
import { WalletProvider } from "@/components/wallet/provider";
import { WalletCard } from "@/components/wallet/wallet-card";
import { env } from "@/lib/server/env";
import { requireUser } from "@/lib/server/guard";

/**
 * The sign-in and onboarding check runs here, before the shell renders. When it ran only in each page, the layout
 * streamed first and visitors saw the product shell at /app before being redirected to onboarding.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <WalletProvider environmentId={env.dynamicEnvironmentId ?? null} serverAddress={user.address}>
      <Shell nav={APP_NAV} footer={<WalletCard />}>{children}</Shell>
    </WalletProvider>
  );
}
