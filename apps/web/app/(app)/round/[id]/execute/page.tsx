import type { Metadata } from "next";
import { RoundStage } from "@/components/product/round-stage";
import { requireUser } from "@/lib/server/guard";

export const metadata: Metadata = { title: "Round execute · Venue0" };

export default async function RoundExecutePage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  return <RoundStage roundId={(await params).id} view="execute" />;
}
