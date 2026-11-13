import { AdminShell } from "@/components/admin/AdminShell";
import { ExpensesPage } from "@/components/admin/ExpensesPage";

export default function AdminExpensesPage() {
  return (
    <AdminShell>
      <ExpensesPage />
    </AdminShell>
  );
}
