export function isEligibleCapturedPayment(payment, expected) {
  return payment.status === "captured" && payment.order_id === expected.orderId && payment.amount === expected.amount && payment.currency === expected.currency;
}
