"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";

export function ScannerLogoutButton() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    setError("");

    const { error: signOutError } = await createBrowserSupabase().auth.signOut();
    if (signOutError) {
      setError("Unable to sign out. Please try again.");
      setLoading(false);
      return;
    }

    router.replace("/scanner/login");
  }

  return (
    <div>
      <button className="button secondary-button" onClick={signOut} disabled={loading} type="button">
        {loading ? "Signing out…" : "Sign out"}
      </button>
      {error ? <p className="form-error">{error}</p> : null}
    </div>
  );
}
