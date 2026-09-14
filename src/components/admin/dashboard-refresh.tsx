"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function DashboardRefresh() {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();

  return <button className="button secondary-button" type="button" onClick={() => startTransition(() => router.refresh())} disabled={isRefreshing}>{isRefreshing ? "Refreshing…" : "Refresh"}</button>;
}
