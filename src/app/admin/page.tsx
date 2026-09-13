import { redirect } from "next/navigation";
import { AdminLogoutButton } from "@/components/admin/logout-button";
import { requireAdmin } from "@/lib/admin-auth";

export default async function AdminPage() {
  const auth = await requireAdmin();
  if (auth.error === 401) redirect("/admin/login");
  if (auth.error === 403) return <main className="container placeholder-page"><h1>Unauthorized</h1><p>Your account is not an active Navrang Garba administrator.</p></main>;

  return <main className="container placeholder-page"><p className="eyebrow">Navrang Garba 2026</p><h1>Admin Portal</h1><p>Admin authentication successful.</p><p className="muted">{auth.user.email} · {auth.staff.role} · {auth.staff.active ? "Active" : "Inactive"}</p><p>Dashboard coming in Phase 7B.</p><AdminLogoutButton /></main>;
}
