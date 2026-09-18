"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getAddress, isAddress, type Hex } from "viem";
import type { AssetUid } from "@venue0/shared";
import { circles } from "./circles";

export type ActionState = { error?: string; invite?: string };

export async function createCircleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const organizer = String(form.get("organizer") ?? "");
  if (!isAddress(organizer, { strict: false })) return { error: "Organizer must be a wallet address." };
  const assets = form.getAll("assets").map(String) as AssetUid[];
  const cadenceHours = Number(form.get("cadenceHours") ?? 0);
  let id: Hex;
  try {
    const svc = await circles();
    const circle = svc.createCircle({
      name: String(form.get("name") ?? ""),
      visibility: String(form.get("visibility")) as "PUBLIC" | "INVITE_ONLY" | "PRIVATE",
      organizer: getAddress(organizer),
      allowedAssetUids: assets,
      minParticipants: Math.max(2, Number(form.get("minParticipants") ?? 3)),
      defaultRoundDurationSec: 1_800,
      ...(cadenceHours > 0 ? { roundCadenceSec: cadenceHours * 3_600 } : {}),
      privacyMode: String(form.get("privacyMode")) === "AGGREGATE_ONLY" ? "AGGREGATE_ONLY" : "DELTAS_ONLY",
    });
    id = circle.id;
  } catch (error) {
    return { error: (error as Error).message };
  }
  revalidatePath("/circles");
  redirect(`/circles/${id}`);
}

export async function joinCircleAction(_: ActionState, form: FormData): Promise<ActionState> {
  const id = String(form.get("circleId")) as Hex;
  const address = String(form.get("address") ?? "");
  if (!isAddress(address, { strict: false })) return { error: "Enter a wallet address." };
  try {
    const svc = await circles();
    const invite = String(form.get("invite") ?? "");
    const addedBy = String(form.get("addedBy") ?? "");
    svc.join(id, getAddress(address), { ...(invite ? { inviteCode: invite } : {}), ...(isAddress(addedBy, { strict: false }) ? { addedBy: getAddress(addedBy) } : {}) });
  } catch (error) {
    return { error: (error as Error).message };
  }
  revalidatePath(`/circles/${id}`);
  return {};
}

export async function inviteAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const svc = await circles();
    return { invite: svc.createInvite(String(form.get("circleId")) as Hex, getAddress(String(form.get("organizer")))) };
  } catch (error) {
    return { error: (error as Error).message };
  }
}
