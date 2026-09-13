"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const { error: signInError } = await createBrowserSupabase().auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) setError("Invalid email or password.");
    else router.replace("/admin");
  }

  return <main className="container booking-page"><p className="eyebrow">Navrang Garba 2026</p><h1>Admin login</h1><form className="form-panel form-grid" onSubmit={submit}><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error ? <p className="form-error">{error}</p> : null}<button className="button" disabled={loading}>{loading ? "Signing in…" : "Login"}</button></form></main>;
}
