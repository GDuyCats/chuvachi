import { AdminShell } from "@/components/admin/AdminShell";
import { CostingPage } from "@/components/admin/CostingPage";

export default function AdminCostingPage() {
  return (
    <AdminShell adminOnly>
      <CostingPage />
    </AdminShell>
  );
}
