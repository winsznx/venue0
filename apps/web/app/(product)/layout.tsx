import { Shell } from "@/components/shell";
import { proof } from "@/lib/data";

export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return <Shell contract={proof.settlementContract}>{children}</Shell>;
}
