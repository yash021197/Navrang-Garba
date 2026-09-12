import { redirect } from "next/navigation";
import { ScannerLogoutButton } from "@/components/scanner/logout-button";
import { ScannerClient } from "@/components/scanner/scanner-client";
import { requireScannerStaff } from "@/lib/scanner-auth";

export default async function ScannerPage() {
  const auth = await requireScannerStaff();

  if (auth.error === 401) redirect("/scanner/login");

  if (auth.error === 403) {
    return (
      <main className="container placeholder-page">
        <h1>Unauthorized</h1>
        <p>Your account is not an active scanner staff account.</p>
      </main>
    );
  }

  return (
    <main className="container placeholder-page">
      <p className="eyebrow">Staff only</p>
      <h1>Navrang Garba Scanner</h1>
      <p className="page-intro">Scanner session verified. Use the camera to validate one ticket at a time.</p>
      <ScannerClient />
      <ScannerLogoutButton />
    </main>
  );
}
