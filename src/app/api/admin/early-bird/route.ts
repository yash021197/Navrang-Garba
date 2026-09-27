import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function PATCH(request: Request) {
  const authorization = await requireAdmin();
  if (authorization.error) return Response.json({ error: "Admin authorization is required." }, { status: authorization.error });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const price = body?.price;
  const active = body?.active;
  if (typeof price !== "number" || !Number.isSafeInteger(price) || price < 1 || price > 1_000_000 || typeof active !== "boolean") return Response.json({ error: "Enter a valid whole-number price and availability status." }, { status: 400 });
  const { data, error } = await createAdminClient().from("ticket_types").update({ price, active }).eq("code", "EARLY_BIRD_9_DAY").select("price,active").maybeSingle();
  if (error || !data) return Response.json({ error: "Early Bird configuration could not be updated." }, { status: 500 });
  return Response.json({ earlyBird: { price: Number(data.price), active: data.active } });
}
