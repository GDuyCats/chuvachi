import { AdminShell } from "@/components/admin/AdminShell";
import { StatsPage } from "@/components/admin/StatsPage";

export default function AdminStatsPage() {
  return (
    <AdminShell adminOnly>
      <StatsPage />
    </AdminShell>
  );
}
