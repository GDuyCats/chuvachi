import { AdminShell } from "@/components/admin/AdminShell";
import { ThemesPage } from "@/components/admin/ThemesPage";

export default function AdminThemesPage() {
  return (
    <AdminShell adminOnly>
      <ThemesPage />
    </AdminShell>
  );
}
