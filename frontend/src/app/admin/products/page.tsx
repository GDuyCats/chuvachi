import { AdminShell } from "@/components/admin/AdminShell";
import { ProductsPage } from "@/components/admin/ProductsPage";

export default function AdminProductsPage() {
  return (
    <AdminShell>
      <ProductsPage />
    </AdminShell>
  );
}
