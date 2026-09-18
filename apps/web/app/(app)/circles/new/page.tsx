import type { Metadata } from "next";
import { assetChoices } from "@/lib/server/circles";
import { requireUser } from "@/lib/server/guard";
import { getTarget } from "@/lib/server/users";
import { CreateCircleForm } from "@/components/product/create-circle";

export const metadata: Metadata = { title: "Create a Circle · Venue0" };
export const dynamic = "force-dynamic";

export default async function NewCircle() {
  const user = await requireUser();
  const [assets, target] = await Promise.all([assetChoices(), getTarget(user.address)]);
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Create a Circle</h1>
          <p className="muted">You'll be the organizer. Members cross with each other only inside the Stock Tokens you pick.</p>
        </div>
      </header>
      <CreateCircleForm assets={assets} suggested={target?.weights.map((w) => w.uid) ?? []} />
    </>
  );
}
