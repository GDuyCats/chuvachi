import { AdminShell } from "@/components/admin/AdminShell";
import { HomeEditor } from "@/components/admin/HomeEditor";

export default function AdminHomePage() {
  return (
    <AdminShell adminOnly>
      <HomeEditor />
    </AdminShell>
  );
}
