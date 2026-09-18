export const VISIBILITY_WORDS = { PUBLIC: "Public", INVITE_ONLY: "Invite only", PRIVATE: "Private" } as const;
export const RESIDUAL_BEHAVIOR_WORDS = { ECONOMIC: "Cheapest sensible option", CARRY_FORWARD: "Carry into the next round", CANCEL: "Drop what doesn't cross" } as const;

export function duration(sec: number): string {
  if (sec % 86_400 === 0) return `${sec / 86_400} day${sec === 86_400 ? "" : "s"}`;
  if (sec % 3_600 === 0) return `${sec / 3_600} hour${sec === 3_600 ? "" : "s"}`;
  return `${Math.round(sec / 60)} min`;
}

export function cadence(sec: number | null): string {
  if (!sec) return "On demand";
  if (sec === 86_400) return "Daily";
  if (sec === 604_800) return "Weekly";
  return `Every ${duration(sec)}`;
}
