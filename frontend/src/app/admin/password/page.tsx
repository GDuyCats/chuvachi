import { AdminShell } from "@/components/admin/AdminShell";
import { ChangePasswordForm } from "@/components/admin/ChangePasswordForm";

export default function AdminPasswordPage() {
  return (
    <AdminShell>
      <ChangePasswordForm />
    </AdminShell>
  );
}
