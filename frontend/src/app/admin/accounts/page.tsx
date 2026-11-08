import { AccountsPage } from "@/components/admin/AccountsPage";
import { AdminShell } from "@/components/admin/AdminShell";

export default function AdminAccountsPage() {
  return (
    <AdminShell adminOnly>
      <AccountsPage />
    </AdminShell>
  );
}
