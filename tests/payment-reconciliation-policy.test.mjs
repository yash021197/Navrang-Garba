import test from "node:test";
import assert from "node:assert/strict";
import { isEligibleCapturedPayment } from "../src/lib/payment-reconciliation-policy.js";

const expected = { orderId: "order_test_captured_pending", amount: 180000, currency: "INR" };
const captured = { id: "pay_test_captured", order_id: expected.orderId, amount: expected.amount, currency: expected.currency, status: "captured" };

test("captured-but-pending incident shape is eligible exactly once for reconciliation", () => {
  assert.equal(isEligibleCapturedPayment(captured, expected), true);
  assert.equal(isEligibleCapturedPayment(captured, expected), true);
});

test("only the exact captured payment is eligible", () => {
  assert.equal(isEligibleCapturedPayment({ ...captured, status: "authorized" }, expected), false);
  assert.equal(isEligibleCapturedPayment({ ...captured, status: "failed" }, expected), false);
  assert.equal(isEligibleCapturedPayment({ ...captured, order_id: "order_other" }, expected), false);
  assert.equal(isEligibleCapturedPayment({ ...captured, amount: 1 }, expected), false);
  assert.equal(isEligibleCapturedPayment({ ...captured, currency: "USD" }, expected), false);
});
