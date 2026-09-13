"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function AdminLogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setLoading(true);
    setError("");
    const { error: signOutError } = await createBrowserSupabase().auth.signOut();
    if (signOutError) {
      setError("Unable to sign out. Please try again.");
      setLoading(false);
      return;
    }
    router.replace("/admin/login");
  }

  return <div><button className="button secondary-button" type="button" onClick={signOut} disabled={loading}>{loading ? "Signing out…" : "Sign out"}</button>{error ? <p className="form-error">{error}</p> : null}</div>;
}
