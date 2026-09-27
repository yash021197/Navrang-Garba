"use client";

import { useState } from "react";
import styles from "./pricing-manager.module.css";

export function EarlyBirdManager({ initial }: { initial: { price: number; active: boolean } | null }) {
  const [price, setPrice] = useState(String(initial?.price ?? 1800));
  const [active, setActive] = useState(initial?.active ?? false);
  const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function save() {
    if (!/^[1-9]\d{0,6}$/.test(price)) { setError("Enter a whole-number price from ₹1 to ₹1,000,000."); return; }
    setSaving(true); setError(""); setMessage("");
    try { const response = await fetch("/api/admin/early-bird", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ price: Number(price), active }) }); const result = await response.json() as { earlyBird?: { price: number; active: boolean }; error?: string }; if (!response.ok || !result.earlyBird) { setError(result.error ?? "Early Bird configuration could not be updated."); return; } setPrice(String(result.earlyBird.price)); setActive(result.earlyBird.active); setMessage("Early Bird 9-Day Pass saved."); } catch { setError("Early Bird configuration could not be updated."); } finally { setSaving(false); }
  }
  return <section className="admin-section" aria-labelledby="early-bird-heading"><div className="admin-section-heading"><div><p className="eyebrow">Multi-day pass</p><h2 id="early-bird-heading">Early Bird — 9 Day Pass</h2></div><p className={styles.sectionCopy}>One QR, one entry per event day.</p></div><div className={styles.pricingRow}><div><h3>Price</h3><label className={styles.priceInput}>Price in rupees<input aria-label="Early Bird price" value={price} onChange={(event) => setPrice(event.target.value)} inputMode="numeric" pattern="[0-9]*" /></label><label><input type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /> {active ? "AVAILABLE" : "HIDDEN"}</label></div><button className="button" type="button" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button></div>{message ? <p className={styles.success} role="status">{message}</p> : null}{error ? <p className="form-error" role="alert">{error}</p> : null}</section>;
}
