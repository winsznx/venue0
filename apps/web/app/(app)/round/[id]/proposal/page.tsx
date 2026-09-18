import type { Metadata } from "next";
import { RoundStage } from "@/components/product/round-stage";
import { requireUser } from "@/lib/server/guard";

export const metadata: Metadata = { title: "Round proposal · Venue0" };

export default async function RoundProposalPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  return <RoundStage roundId={(await params).id} view="proposal" />;
}
