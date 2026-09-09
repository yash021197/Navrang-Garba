export function formatEventDate(isoDate: string) {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${isoDate}T00:00:00`));
}

export function formatPrice(amount: number | null) {
  return amount === null ? "Pricing to be announced" : new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(amount);
}
