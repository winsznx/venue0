import type { Metadata } from "next";
import { RoundStage } from "@/components/product/round-stage";
import { requireUser } from "@/lib/server/guard";

export const metadata: Metadata = { title: "Round match · Venue0" };

export default async function RoundMatchPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  return <RoundStage roundId={(await params).id} view="match" />;
}
