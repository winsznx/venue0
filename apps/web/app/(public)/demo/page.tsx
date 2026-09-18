import { redirect } from "next/navigation";
import { HERO_ROUND_KEY } from "@/lib/data";

export default function DemoIndex() {
  redirect(`/demo/round/${HERO_ROUND_KEY}?demo=1`);
}
