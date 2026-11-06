import { AdminShell } from "@/components/admin/AdminShell";
import { OrdersBoard } from "@/components/admin/OrdersBoard";

export default function AdminOrdersPage() {
  return (
    <AdminShell>
      <OrdersBoard />
    </AdminShell>
  );
}
