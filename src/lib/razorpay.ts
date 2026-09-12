import crypto from "node:crypto";
import Razorpay from "razorpay";

function required(name: "NEXT_PUBLIC_RAZORPAY_KEY_ID" | "RAZORPAY_KEY_SECRET" | "RAZORPAY_WEBHOOK_SECRET") {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

export function getRazorpay() {
  return new Razorpay({ key_id: required("NEXT_PUBLIC_RAZORPAY_KEY_ID"), key_secret: required("RAZORPAY_KEY_SECRET") });
}

export function getRazorpayKeyId() { return required("NEXT_PUBLIC_RAZORPAY_KEY_ID"); }
export function verifyPaymentSignature(orderId: string, paymentId: string, signature: string) {
  const expected = crypto.createHmac("sha256", required("RAZORPAY_KEY_SECRET")).update(`${orderId}|${paymentId}`).digest("hex");
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
export function verifyWebhookSignature(rawBody: string, signature: string) {
  const expected = crypto.createHmac("sha256", required("RAZORPAY_WEBHOOK_SECRET")).update(rawBody).digest("hex");
  return signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}
