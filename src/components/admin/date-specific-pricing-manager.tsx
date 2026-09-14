"use client";

import { useState } from "react";
import type { DashboardSnapshot } from "@/components/admin/dashboard-types";
import styles from "./pricing-manager.module.css";

type DatePricing = DashboardSnapshot["dateSpecificPricing"];
const money = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const date = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function DateSpecificPricingManager({ pricing }: { pricing: DatePricing }) {
  const [current, setCurrent] = useState(pricing);
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  function key(dayId: string, code: string) { return `${dayId}:${code}`; }
  function begin(dayId: string, code: string, price: number) { setEditing(key(dayId, code)); setValue(String(price)); setMessage(""); setError(""); }
  function cancel() { setEditing(null); setValue(""); setError(""); }

  async function mutate(dayId: string, code: string, action: "save" | "remove") {
    if (action === "save" && (!/^[1-9]\d{0,6}$/.test(value) || Number(value) > 1_000_000)) { setError("Enter a whole-number price from ₹1 to ₹1,000,000."); return; }
    setSaving(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/date-prices", { method: action === "save" ? "PATCH" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventDayId: dayId, ticketTypeCode: code, ...(action === "save" ? { price: Number(value) } : {}) }) });
      const result = (await response.json()) as { price?: number; error?: string };
      if (!response.ok) { setError(result.error ?? "Date-specific price could not be updated."); return; }
      setCurrent((days) => days.map((day) => day.eventDayId !== dayId ? day : { ...day, prices: day.prices.map((item) => item.code !== code ? item : { ...item, price: action === "save" ? result.price! : item.defaultPrice, isOverride: action === "save" }) }));
      setEditing(null); setMessage(action === "save" ? "Date-specific price saved." : "Override removed; default price restored.");
    } catch { setError("Date-specific price could not be updated. Please try again."); }
    finally { setSaving(false); }
  }

  return <section className="admin-section" aria-labelledby="date-pricing-heading"><div className="admin-section-heading"><div><p className="eyebrow">Optional overrides</p><h2 id="date-pricing-heading">Date-Specific Prices</h2></div><p className={styles.sectionCopy}>Unset dates automatically use the default price.</p></div><div className={styles.dateList}>{current.map((day) => <article className={styles.dateCard} key={day.eventDayId}><h3>Day {day.dayNumber} · {day.date ? date.format(new Date(`${day.date}T00:00:00`)) : "Date unavailable"}</h3>{day.prices.map((ticket) => { const itemKey = key(day.eventDayId, ticket.code); const isEditing = editing === itemKey; return <div className={styles.datePriceRow} key={ticket.code}><div><strong>{ticket.name}</strong>{isEditing ? <label className={styles.priceInput}>Price in rupees<input aria-label={`Day ${day.dayNumber} ${ticket.name} price`} value={value} onChange={(event) => setValue(event.target.value)} inputMode="numeric" pattern="[0-9]*" autoFocus /></label> : <><span>{money.format(ticket.price)}</span><small>{ticket.isOverride ? "Date-specific" : "Using default"}</small></>}</div>{isEditing ? <div className={styles.actions}><button className="button" type="button" onClick={() => mutate(day.eventDayId, ticket.code, "save")} disabled={saving}>{saving ? "Saving…" : "Save"}</button><button className="button secondary-button" type="button" onClick={cancel} disabled={saving}>Cancel</button></div> : <div className={styles.actions}><button className="button secondary-button" type="button" onClick={() => begin(day.eventDayId, ticket.code, ticket.price)}>{ticket.isOverride ? "Edit" : "Set date price"}</button>{ticket.isOverride ? <button className="button secondary-button" type="button" onClick={() => mutate(day.eventDayId, ticket.code, "remove")} disabled={saving}>Remove override</button> : null}</div>}</div>; })}</article>)}</div>{message ? <p className={styles.success} role="status">{message}</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}</section>;
}
