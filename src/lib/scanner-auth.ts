import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
export async function requireScannerStaff() { const store = await cookies(); const auth = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { cookies: { getAll: () => store.getAll(), setAll: () => {} } }); const { data: { user } } = await auth.auth.getUser(); if (!user) return { error: 401 as const }; const { data: staff } = await createAdminClient().from("staff_users").select("id,user_id,role,active").eq("user_id", user.id).maybeSingle(); if (!staff || !staff.active || staff.role !== "SCANNER") return { error: 403 as const }; return { staff }; }
