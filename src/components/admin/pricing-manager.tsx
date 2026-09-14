"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { DashboardSnapshot } from "@/components/admin/dashboard-types";
import styles from "./pricing-manager.module.css";

type Pricing = DashboardSnapshot["pricing"];

const money = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function PricingManager({ pricing }: { pricing: Pricing }) {
  const router = useRouter();
  const [current, setCurrent] = useState(pricing);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function begin(code: string, price: number) {
    setEditing(code);
    setValue(String(price));
    setMessage("");
    setError("");
  }

  function cancel() {
    setEditing(null);
    setValue("");
    setError("");
  }

  async function save(code: string) {
    if (!/^[1-9]\d{0,6}$/.test(value) || Number(value) > 1_000_000) {
      setError("Enter a whole-number price from ₹1 to ₹1,000,000.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, price: Number(value) }),
      });
      const result = (await response.json()) as {
        pricing?: Pricing[number];
        error?: string;
      };

      if (!response.ok || !result.pricing) {
        setError(result.error ?? "Price could not be updated.");
        return;
      }

      setCurrent((items) =>
        items.map((item) => (item.code === code ? result.pricing! : item)),
      );
      setEditing(null);
      setMessage(`${result.pricing.name} price saved.`);
      router.refresh();
    } catch {
      setError("Price could not be updated. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="admin-section" aria-labelledby="pricing-heading">
      <div className="admin-section-heading">
        <div>
          <p className="eyebrow">Current configuration</p>
          <h2 id="pricing-heading">Pricing</h2>
        </div>
        <p className={styles.sectionCopy}>
          Current prices apply only to new bookings.
        </p>
      </div>

      <div className={styles.pricingList}>
        {current.map((ticket) => (
          <article key={ticket.code} className={styles.pricingRow}>
            <div>
              <h3>{ticket.name}</h3>
              {editing !== ticket.code ? (
                <strong>{money.format(ticket.price)}</strong>
              ) : (
                <label className={styles.priceInput}>
                  New price in rupees
                  <input
                    aria-label={`${ticket.name} price`}
                    value={value}
                    onChange={(event) => setValue(event.target.value)}
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoFocus
                  />
                </label>
              )}
            </div>

            {editing === ticket.code ? (
              <div className={styles.actions}>
                <button
                  className="button"
                  type="button"
                  onClick={() => save(ticket.code)}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  className="button secondary-button"
                  type="button"
                  onClick={cancel}
                  disabled={saving}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                className="button secondary-button"
                type="button"
                onClick={() => begin(ticket.code, ticket.price)}
              >
                Edit
              </button>
            )}
          </article>
        ))}
      </div>

      {message ? <p className={styles.success} role="status">{message}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
    </section>
  );
}
