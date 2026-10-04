import { getRazorpay } from "@/lib/razorpay";
import { reconcileStalePendingPayments } from "@/lib/payment-resilience";

export const runtime = "nodejs";
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try { return Response.json(await reconcileStalePendingPayments(getRazorpay())); }
  catch (error) { console.error("payment.reconciliation.unhandled", error); return Response.json({ error: "Reconciliation failed" }, { status: 503 }); }
}
