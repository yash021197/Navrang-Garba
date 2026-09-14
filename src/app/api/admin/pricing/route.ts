import { requireAdmin } from "@/lib/admin-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const ticketCodes = new Set(["SINGLE", "COUPLE", "GROUP_OF_4"]);

export async function PATCH(request: Request) {
  const authorization = await requireAdmin();

  if (authorization.error) {
    return Response.json(
      { error: "Admin authorization is required." },
      { status: authorization.error },
    );
  }

  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const code = typeof body?.code === "string" ? body.code : "";
  const price = body?.price;

  if (
    !ticketCodes.has(code) ||
    typeof price !== "number" ||
    !Number.isSafeInteger(price) ||
    price < 1 ||
    price > 1_000_000
  ) {
    return Response.json(
      { error: "Enter a whole-number price from ₹1 to ₹1,000,000." },
      { status: 400 },
    );
  }

  const { data, error } = await createAdminClient()
    .from("ticket_types")
    .update({ price })
    .eq("code", code)
    .select("code, name, price")
    .maybeSingle();

  if (error || !data) {
    return Response.json({ error: "Price could not be updated." }, { status: 500 });
  }

  return Response.json({
    pricing: {
      code: data.code,
      name: data.name,
      price: Number(data.price),
    },
  });
}
