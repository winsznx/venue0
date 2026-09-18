import { body, route } from "@/lib/server/api";
import { createCircle, listMyCircles, listPublicCircles, type CircleInput } from "@/lib/server/circles";

export const GET = route(async ({ session }) => ({ mine: await listMyCircles(session.address), discover: await listPublicCircles() }));

export const POST = route(async ({ session, request }) => ({ circle: await createCircle(session.address, await body<CircleInput>(request)) }));
