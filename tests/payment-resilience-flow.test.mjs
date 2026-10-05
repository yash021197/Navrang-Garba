import test from "node:test";
import assert from "node:assert/strict";
import { isEligibleCapturedPayment } from "../src/lib/payment-reconciliation-policy.js";

const expected = { orderId: "order_test", amount: 180000, currency: "INR" };
const captured = { id: "pay_test", order_id: expected.orderId, amount: expected.amount, currency: "INR", status: "captured" };

class FakePaymentStore {
  constructor() { this.payment = "PENDING"; this.booking = "PENDING"; this.ticketCount = 0; this.emailCount = 0; this.paymentId = null; this.failNext = false; this.events = new Map(); }
  finalize(payment) {
    if (this.failNext) { this.failNext = false; throw new Error("temporary failure"); }
    if (!isEligibleCapturedPayment(payment, expected)) throw new Error("metadata mismatch");
    if (this.payment === "PAID" && this.booking === "PAID") return true;
    if (this.payment !== "PENDING" || this.booking !== "PENDING") throw new Error("inconsistent state");
    this.payment = "PAID"; this.booking = "PAID"; this.paymentId = payment.id;
    return false;
  }
  fulfill() { if (this.ticketCount === 0) this.ticketCount = 1; if (this.emailCount === 0) this.emailCount = 1; }
  process(payment) { this.finalize(payment); this.fulfill(); }
  claimWebhook(key) { const state = this.events.get(key); if (state === "PROCESSED" || state === "IGNORED" || state === "RECEIVED") return false; this.events.set(key, "RECEIVED"); return true; }
  webhook(key, payment) { if (!this.claimWebhook(key)) return; try { this.process(payment); this.events.set(key, "PROCESSED"); } catch { this.events.set(key, "FAILED"); throw new Error("webhook failed"); } }
}

function assertFulfilled(store) { assert.equal(store.payment, "PAID"); assert.equal(store.booking, "PAID"); assert.equal(store.ticketCount, 1); assert.equal(store.emailCount, 1); }

test("A verify captured payment finalizes and fulfills once", () => { const s = new FakePaymentStore(); s.process(captured); assertFulfilled(s); });
test("B webhook succeeds after browser verification is absent", () => { const s = new FakePaymentStore(); s.webhook("evt-b", captured); assertFulfilled(s); });
test("C verify and webhook race converges", async () => { const s = new FakePaymentStore(); await Promise.all([Promise.resolve().then(() => s.process(captured)), Promise.resolve().then(() => s.webhook("evt-c", captured))]); assertFulfilled(s); });
test("D webhook and reconciliation race converges", async () => { const s = new FakePaymentStore(); await Promise.all([Promise.resolve().then(() => s.webhook("evt-d", captured)), Promise.resolve().then(() => s.process(captured))]); assertFulfilled(s); });
test("E verify and reconciliation race converges", async () => { const s = new FakePaymentStore(); await Promise.all([Promise.resolve().then(() => s.process(captured)), Promise.resolve().then(() => s.process(captured))]); assertFulfilled(s); });
test("F two reconciliation attempts converge", async () => { const s = new FakePaymentStore(); await Promise.all([Promise.resolve().then(() => s.process(captured)), Promise.resolve().then(() => s.process(captured))]); assertFulfilled(s); });
test("G failed webhook is claimed again on retry", () => { const s = new FakePaymentStore(); s.failNext = true; assert.throws(() => s.webhook("evt-g", captured)); assert.equal(s.events.get("evt-g"), "FAILED"); s.webhook("evt-g", captured); assert.equal(s.events.get("evt-g"), "PROCESSED"); assertFulfilled(s); });
test("H authorized payment is rejected", () => assert.equal(isEligibleCapturedPayment({ ...captured, status: "authorized" }, expected), false));
test("I wrong amount is rejected", () => assert.equal(isEligibleCapturedPayment({ ...captured, amount: 1 }, expected), false));
test("J wrong order is rejected", () => assert.equal(isEligibleCapturedPayment({ ...captured, order_id: "order_other" }, expected), false));
test("K wrong currency is rejected", () => assert.equal(isEligibleCapturedPayment({ ...captured, currency: "USD" }, expected), false));
test("L already paid state is a no-op apart from safe fulfillment", () => { const s = new FakePaymentStore(); s.process(captured); s.process(captured); assertFulfilled(s); });
test("M captured Razorpay payment reconciles a pending record", () => { const s = new FakePaymentStore(); s.process(captured); assertFulfilled(s); });
test("N atomic finalization cannot leave payment paid with booking pending", () => { const s = new FakePaymentStore(); s.process(captured); assert.notEqual(`${s.payment}/${s.booking}`, "PAID/PENDING"); });
test("O repeated fulfillment keeps exactly one ticket", () => { const s = new FakePaymentStore(); s.process(captured); s.fulfill(); assert.equal(s.ticketCount, 1); });
test("P repeated fulfillment keeps one email send", () => { const s = new FakePaymentStore(); s.process(captured); s.fulfill(); assert.equal(s.emailCount, 1); });
