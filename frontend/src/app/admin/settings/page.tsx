import { AdminShell } from "@/components/admin/AdminShell";
import { SettingsPage } from "@/components/admin/SettingsPage";

export default function AdminSettingsPage() {
  return (
    <AdminShell adminOnly>
      <SettingsPage />
    </AdminShell>
  );
}
